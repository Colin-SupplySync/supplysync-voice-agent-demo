import type { GoogleGenAI } from "@google/genai";
import WebSocket, { type RawData } from "ws";

import { buildLiveConfig } from "./geminiLive.js";
import {
  buildSupplierCallOpeningPrompt,
  SUPPLIER_CALL_SYSTEM_PROMPT,
} from "./prompts.js";
import {
  createEmptySummary,
  generateProcurementSummary,
} from "./summary.js";
import type {
  BackendEnv,
  ClientControlMessage,
  ConversationMessage,
  OutboundCallSessionConfig,
  ProcurementSummary,
  ServerEvent,
  SessionStatus,
} from "./types.js";
import { streamSpeech, VOLCENGINE_PCM_SAMPLE_RATE } from "./volcengineTts.js";

interface LiveSessionLike {
  sendRealtimeInput: (params: unknown) => void;
  close: () => void;
}

function createMessage(
  speaker: ConversationMessage["speaker"],
  text: string,
  final: boolean,
): ConversationMessage {
  return {
    id: `${speaker}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    speaker,
    text,
    final,
    updatedAt: Date.now(),
  };
}

function mergeTranscriptionChunk(current: string, next: string) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  if (next.startsWith(current)) {
    return next;
  }

  if (current.endsWith(next)) {
    return current;
  }

  const maxOverlap = Math.min(current.length, next.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (current.slice(-overlap) === next.slice(0, overlap)) {
      return `${current}${next.slice(overlap)}`;
    }
  }

  return `${current}${next}`;
}

function normalizeChineseSpacing(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/([\u4e00-\u9fff])\s+([，。！？；：、])/g, "$1$2")
    .replace(/([，。！？；：、])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/\s+([，。！？；：、])/g, "$1")
    .trim();
}

function toSpokenPhoneChinese(text: string) {
  let normalized = normalizeChineseSpacing(text)
    .replace(/([，、]){2,}/g, "，")
    .replace(/([。！？]){2,}/g, "$1")
    .replace(/我方/g, "我这边")
    .replace(/贵司/g, "您这边")
    .replace(/是否/g, "是不是")
    .replace(/可否/g, "方不方便")
    .replace(/添加微信/g, "加微信")
    .replace(/详细需求/g, "详细资料")
    .replace(/稍后/g, "一会儿");

  normalized = normalized.replace(/^您好，?/, "喂，您好，");

  if (!/[。！？!?]$/.test(normalized)) {
    normalized = `${normalized}。`;
  }

  return normalized;
}

export class ClientSessionManager {
  private readonly ws: WebSocket;
  private readonly ai: GoogleGenAI;
  private readonly env: BackendEnv;
  private liveSession: LiveSessionLike | null = null;
  private conversation: ConversationMessage[] = [];
  private pendingUserText = "";
  private pendingAssistantText = "";
  private queuedAudioChunks: Buffer[] = [];
  private status: SessionStatus = "disconnected";
  private summaryPreview: ProcurementSummary = createEmptySummary();
  private summaryTimer: NodeJS.Timeout | null = null;
  private assistantPlaybackTimer: NodeJS.Timeout | null = null;
  private assistantPlaybackEndsAt = 0;
  private assistantSpeechQueue: string[] = [];
  private assistantQueuedTextLength = 0;
  private assistantSpeechWorker: Promise<void> | null = null;
  private assistantSpeechAbortController: AbortController | null = null;
  private speechRevision = 0;
  private destroyed = false;

  constructor(params: { ws: WebSocket; ai: GoogleGenAI; env: BackendEnv }) {
    this.ws = params.ws;
    this.ai = params.ai;
    this.env = params.env;
  }

  handleMessage(rawData: RawData, isBinary: boolean) {
    if (isBinary) {
      const chunk = Buffer.isBuffer(rawData)
        ? rawData
        : Buffer.from(rawData as ArrayBuffer);
      this.handleAudioChunk(chunk);
      return;
    }

    const text = rawData.toString();
    const message = JSON.parse(text) as ClientControlMessage;

    switch (message.type) {
      case "start":
        void this.startConversation(message.sessionConfig);
        break;
      case "stop":
        this.stopConversation("ended");
        break;
      case "clear":
        this.clearConversation();
        break;
      case "generate_summary":
        void this.generateFinalSummary();
        break;
      default:
        this.send({
          type: "error",
          message: "Unsupported message type.",
        });
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopConversation("disconnected");
    if (this.summaryTimer) {
      clearTimeout(this.summaryTimer);
      this.summaryTimer = null;
    }
  }

  private async startConversation(sessionConfig: OutboundCallSessionConfig) {
    this.stopConversation("connecting");
    this.conversation = [];
    this.pendingUserText = "";
    this.pendingAssistantText = "";
    this.queuedAudioChunks = [];
    this.summaryPreview = createEmptySummary();
    this.resetAssistantSpeechState();
    this.broadcastConversation();
    this.send({ type: "summary_preview", summary: this.summaryPreview });
    this.updateStatus("connecting", "正在建立 Gemini Live 会话");

    if (!sessionConfig.procurementRequest.trim()) {
      this.send({
        type: "error",
        message: "缺少采购简报。请先在页面左侧填写采购 JSON 后再开始外呼。",
      });
      this.updateStatus("error", "采购简报为空");
      return;
    }

    try {
      const session = await this.ai.live.connect({
        model: this.env.GEMINI_MODEL,
        config: buildLiveConfig(
          SUPPLIER_CALL_SYSTEM_PROMPT,
          this.env.GEMINI_VOICE_NAME,
        ),
        callbacks: {
          onopen: () => {
            // Connection readiness is handled right after connect() resolves.
          },
          onmessage: (message) => {
            this.handleGeminiMessage(message);
          },
          onerror: (error) => {
            this.send({
              type: "error",
              message: error.message || "Gemini Live 连接出错。",
            });
            this.updateStatus("error", error.message);
          },
          onclose: (event) => {
            if (!this.destroyed && this.status !== "ended") {
              this.updateStatus("ended", event.reason || "Gemini Live 会话已关闭");
            }
          },
        },
      });

      this.liveSession = session as LiveSessionLike;
      this.updateStatus("listening", "已连接，开始语音对话");
      this.flushQueuedAudio();
      this.liveSession.sendRealtimeInput({
        text: buildSupplierCallOpeningPrompt(sessionConfig),
      });
    } catch (error) {
      this.liveSession = null;
      this.send({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect to Gemini Live.",
      });
      this.updateStatus("error", "Gemini Live 连接失败");
    }
  }

  private stopConversation(nextStatus: SessionStatus) {
    if (this.liveSession) {
      try {
        this.liveSession.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // noop
      }
      try {
        this.liveSession.close();
      } catch {
        // noop
      }
    }

    this.liveSession = null;
    this.queuedAudioChunks = [];
    this.pendingUserText = "";
    this.pendingAssistantText = "";
    this.resetAssistantSpeechState();
    this.updateStatus(nextStatus);
  }

  private clearConversation() {
    this.stopConversation("disconnected");
    this.conversation = [];
    this.summaryPreview = createEmptySummary();
    this.broadcastConversation();
    this.send({ type: "summary_preview", summary: this.summaryPreview });
  }

  private handleAudioChunk(chunk: Buffer) {
    if (!this.liveSession) {
      this.queuedAudioChunks.push(chunk);
      return;
    }

    this.liveSession.sendRealtimeInput({
      audio: {
        data: chunk.toString("base64"),
        mimeType: "audio/pcm;rate=16000",
      },
    });
  }

  private flushQueuedAudio() {
    if (!this.liveSession || this.queuedAudioChunks.length === 0) {
      return;
    }

    const queued = [...this.queuedAudioChunks];
    this.queuedAudioChunks = [];
    for (const chunk of queued) {
      this.handleAudioChunk(chunk);
    }
  }

  private handleGeminiMessage(message: unknown) {
    const event = message as Record<string, unknown>;
    const serverContent =
      typeof event.serverContent === "object" && event.serverContent
        ? (event.serverContent as Record<string, unknown>)
        : null;

    if (serverContent?.inputTranscription) {
      const inputTranscription = serverContent.inputTranscription as {
        text?: string;
      };
      if (inputTranscription.text) {
        if (this.status === "assistant-speaking") {
          this.interruptAssistantPlayback("用户打断了当前回复");
        }
        this.pendingUserText = normalizeChineseSpacing(
          mergeTranscriptionChunk(this.pendingUserText, inputTranscription.text),
        );
        this.broadcastConversation();
      }
    }

    if (serverContent?.outputTranscription) {
      const outputTranscription = serverContent.outputTranscription as {
        text?: string;
      };
      if (outputTranscription.text) {
        if (!this.pendingAssistantText) {
          this.speechRevision += 1;
          this.assistantQueuedTextLength = 0;
          this.assistantSpeechQueue = [];
        }
        this.pendingAssistantText = normalizeChineseSpacing(
          mergeTranscriptionChunk(this.pendingAssistantText, outputTranscription.text),
        );
        this.updateStatus("assistant-speaking", "AI 正在回复");
        this.broadcastConversation();
        this.flushAssistantSpeech(false);
      }
    }

    if (serverContent?.modelTurn) {
      if (this.pendingUserText) {
        this.finalizePending("user");
      }
    }

    if (serverContent?.generationComplete) {
      this.flushAssistantSpeech(true);
      this.finalizePending("assistant");
      this.scheduleSummaryRefresh();
    }

    if (serverContent?.interrupted) {
      this.cancelAssistantSpeech();
      this.finalizePending("assistant");
      this.updateStatus("listening", "用户打断了当前回复");
      this.scheduleSummaryRefresh();
    }

    if (serverContent?.turnComplete) {
      if (this.status !== "assistant-speaking") {
        this.updateStatus("listening");
      }
    }
  }

  private finalizePending(speaker: "user" | "assistant") {
    const text =
      speaker === "user" ? this.pendingUserText.trim() : this.pendingAssistantText.trim();
    if (!text) {
      if (speaker === "user") {
        this.pendingUserText = "";
      } else {
        this.pendingAssistantText = "";
      }
      this.broadcastConversation();
      return;
    }

    this.conversation.push(createMessage(speaker, text, true));
    if (speaker === "user") {
      this.pendingUserText = "";
    } else {
      this.pendingAssistantText = "";
    }
    this.broadcastConversation();
  }

  private buildConversationSnapshot() {
    const snapshot = [...this.conversation];

    if (this.pendingUserText.trim()) {
      snapshot.push(createMessage("user", this.pendingUserText.trim(), false));
    }

    if (this.pendingAssistantText.trim()) {
      snapshot.push(createMessage("assistant", this.pendingAssistantText.trim(), false));
    }

    return snapshot;
  }

  private broadcastConversation() {
    this.send({
      type: "conversation",
      conversation: this.buildConversationSnapshot(),
    });
  }

  private scheduleSummaryRefresh() {
    if (this.summaryTimer) {
      clearTimeout(this.summaryTimer);
    }

    this.summaryTimer = setTimeout(() => {
      void this.refreshSummaryPreview();
    }, 250);
  }

  private extractSpeechSegment(force: boolean) {
    const unsentText = this.pendingAssistantText.slice(this.assistantQueuedTextLength);
    if (!unsentText.trim()) {
      return "";
    }

    if (force) {
      return unsentText;
    }

    const sentenceMatch = unsentText.match(/^[\s\S]*?[。！？!?；;]/);
    if (sentenceMatch) {
      return sentenceMatch[0];
    }

    const pauseThreshold = this.assistantQueuedTextLength === 0 ? 14 : 24;
    const pauseMatch =
      unsentText.length >= pauseThreshold ? unsentText.match(/^[\s\S]*?[，、,]/) : null;
    if (pauseMatch) {
      return pauseMatch[0];
    }

    return "";
  }

  private flushAssistantSpeech(force: boolean) {
    while (true) {
      const segment = this.extractSpeechSegment(force);
      if (!segment) {
        break;
      }

      this.assistantSpeechQueue.push(segment);
      this.assistantQueuedTextLength += segment.length;
      force = false;
    }

    if (!this.assistantSpeechWorker && this.assistantSpeechQueue.length > 0) {
      const revision = this.speechRevision;
      this.assistantSpeechWorker = this.processAssistantSpeechQueue(revision);
    }
  }

  private async processAssistantSpeechQueue(revision: number) {
    try {
      while (
        !this.destroyed &&
        revision === this.speechRevision &&
        this.assistantSpeechQueue.length > 0
      ) {
        const text = this.assistantSpeechQueue.shift();
        if (!text?.trim()) {
          continue;
        }
        await this.streamAssistantSpeech(toSpokenPhoneChinese(text), revision);
      }
    } finally {
      if (revision === this.speechRevision) {
        this.assistantSpeechWorker = null;
      }
    }
  }

  private async streamAssistantSpeech(text: string, revision: number) {
    if (!this.env.VOLCENGINE_API_KEY || !this.env.VOLCENGINE_TTS_VOICE_ID) {
      this.send({
        type: "error",
        message: "火山语音配置不完整，无法播放克隆音色。",
      });
      return;
    }

    try {
      this.updateStatus("assistant-speaking", "火山语音正在播放采购外呼回复");
      const abortController = new AbortController();
      this.assistantSpeechAbortController = abortController;

      await streamSpeech({
        config: {
          apiKey: this.env.VOLCENGINE_API_KEY,
          resourceId: this.env.VOLCENGINE_TTS_RESOURCE_ID,
          voiceId: this.env.VOLCENGINE_TTS_VOICE_ID,
          speechRate: this.env.VOLCENGINE_TTS_SPEECH_RATE,
        },
        text,
        signal: abortController.signal,
        onChunk: async (chunk) => {
          if (this.destroyed || revision !== this.speechRevision) {
            return;
          }

          this.send({
            type: "audio",
            data: chunk.toString("base64"),
          });
          this.extendAssistantPlayback(chunk.byteLength, revision);
        },
      });

      if (this.destroyed || revision !== this.speechRevision) {
        return;
      }
    } catch (error) {
      if (revision !== this.speechRevision) {
        return;
      }
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      this.send({
        type: "error",
        message:
          error instanceof Error
            ? `火山语音播放失败：${error.message}`
            : "火山语音播放失败。",
      });
      this.updateStatus("listening", "文本回复已生成，但语音播放失败");
    } finally {
      if (this.assistantSpeechAbortController?.signal.aborted || revision === this.speechRevision) {
        this.assistantSpeechAbortController = null;
      }
    }
  }

  private extendAssistantPlayback(chunkByteLength: number, revision: number) {
    const chunkDurationMs = Math.ceil(
      (chunkByteLength / 2 / VOLCENGINE_PCM_SAMPLE_RATE) * 1000,
    );
    const now = Date.now();
    const nextStartAt = Math.max(this.assistantPlaybackEndsAt, now + 30);
    this.assistantPlaybackEndsAt = nextStartAt + chunkDurationMs;

    if (this.assistantPlaybackTimer) {
      clearTimeout(this.assistantPlaybackTimer);
    }

    this.assistantPlaybackTimer = setTimeout(() => {
      if (this.destroyed || revision !== this.speechRevision) {
        return;
      }

      this.assistantPlaybackTimer = null;
      this.assistantPlaybackEndsAt = 0;
      this.updateStatus("listening");
    }, Math.max(120, this.assistantPlaybackEndsAt - now + 120));
  }

  private interruptAssistantPlayback(detail: string) {
    this.cancelAssistantSpeech();
    this.updateStatus("listening", detail);
  }

  private cancelAssistantSpeech() {
    this.speechRevision += 1;
    this.assistantSpeechQueue = [];
    this.assistantQueuedTextLength = 0;
    this.assistantSpeechAbortController?.abort();
    this.assistantSpeechAbortController = null;
    this.assistantSpeechWorker = null;

    if (this.assistantPlaybackTimer) {
      clearTimeout(this.assistantPlaybackTimer);
      this.assistantPlaybackTimer = null;
    }
    this.assistantPlaybackEndsAt = 0;
  }

  private resetAssistantSpeechState() {
    this.cancelAssistantSpeech();
    this.pendingAssistantText = "";
  }

  private async refreshSummaryPreview() {
    const conversation = this.buildConversationSnapshot().filter((item) => item.text.trim());
    if (conversation.length === 0) {
      this.summaryPreview = createEmptySummary();
      this.send({ type: "summary_preview", summary: this.summaryPreview });
      return;
    }

    try {
      this.summaryPreview = await generateProcurementSummary({
        ai: this.ai,
        model: this.env.GEMINI_TEXT_MODEL,
        conversation,
      });
      this.send({ type: "summary_preview", summary: this.summaryPreview });
    } catch (error) {
      this.send({
        type: "error",
        message:
          error instanceof Error
            ? `采购摘要提取失败：${error.message}`
            : "采购摘要提取失败。",
      });
    }
  }

  private async generateFinalSummary() {
    const conversation = this.buildConversationSnapshot().filter((item) => item.text.trim());
    if (conversation.length === 0) {
      this.send({
        type: "error",
        message: "当前还没有可用于总结的对话内容。",
      });
      return;
    }

    try {
      const summary = await generateProcurementSummary({
        ai: this.ai,
        model: this.env.GEMINI_TEXT_MODEL,
        conversation,
      });
      this.summaryPreview = summary;
      this.send({ type: "summary_result", summary });
      this.send({ type: "summary_preview", summary });
    } catch (error) {
      this.send({
        type: "error",
        message:
          error instanceof Error
            ? `生成采购总结失败：${error.message}`
            : "生成采购总结失败。",
      });
    }
  }

  private updateStatus(status: SessionStatus, detail?: string) {
    this.status = status;
    this.send({ type: "status", status, detail });
  }

  private send(event: ServerEvent) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(event));
  }
}
