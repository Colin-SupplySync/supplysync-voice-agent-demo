import { startTransition, useEffect, useRef, useState } from "react";

import type {
  BackendHealthResponse,
  OutboundCallSessionConfig,
  ProcurementSummary,
  ServerMessage,
  SessionStatus,
  VoiceAgentState,
} from "../types";
import { PcmPlayer, downsampleFloat32ToInt16 } from "../utils/audio";

const backendBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:3001";
const socketUrl = `${backendBaseUrl.replace(/^http/, "ws")}/ws`;
const healthUrl = `${backendBaseUrl}/api/health`;

function createEmptySummary(): ProcurementSummary {
  return {
    product_information: {
      product: "",
      type: "",
      usage: "",
      key_specs_custom_points: "",
    },
    procurement_plan: {
      quantity: "",
      budget: "",
      delivery_time: "",
      delivery_location: "",
      sample_required: "",
    },
    price_quotation: {
      quotation_preference: "",
      tax_included: "",
      shipping_included: "",
      invoice_type: "",
    },
    market_compliance: {
      target_market: "",
      compliance_certifications_required: "",
      supplier_supporting_certification: "",
    },
    supplier_requirements: {
      supplier_region_preference: "",
      supplier_qualification: "",
      export_support_required: "",
      other_requirements: "",
    },
    missing_information: [],
    next_questions: [],
    procurement_readiness_score: 0,
  };
}

function statusToLabel(status: SessionStatus) {
  switch (status) {
    case "connecting":
      return "正在连接";
    case "listening":
      return "正在监听";
    case "assistant-speaking":
      return "AI 正在回复";
    case "ended":
      return "已结束";
    case "error":
      return "连接异常";
    case "disconnected":
    default:
      return "未连接";
  }
}

const initialSummary = createEmptySummary();

const initialState: VoiceAgentState = {
  status: "disconnected",
  statusLabel: statusToLabel("disconnected"),
  statusDetail: "",
  conversation: [],
  summaryPreview: initialSummary,
  generatedSummary: null,
  activeSummary: initialSummary,
  errorMessage: "",
  canStop: false,
};

export function useVoiceAgent() {
  const [state, setState] = useState<VoiceAgentState>(initialState);

  const socketRef = useRef<WebSocket | null>(null);
  const socketPromiseRef = useRef<Promise<WebSocket> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const isStreamingRef = useRef(false);

  const updateState = (updater: (previous: VoiceAgentState) => VoiceAgentState) => {
    startTransition(() => {
      setState(updater);
    });
  };

  const setMicrophoneEnabled = (enabled: boolean) => {
    for (const track of mediaStreamRef.current?.getAudioTracks() ?? []) {
      track.enabled = enabled;
    }
    isStreamingRef.current = enabled;
  };

  const checkBackendHealth = async () => {
    let response: Response;

    try {
      response = await fetch(healthUrl, {
        method: "GET",
        cache: "no-store",
      });
    } catch {
      throw new Error(
        "后端未启动。请先在 backend 目录运行 npm run dev，再重新开始对话。",
      );
    }

    if (!response.ok) {
      throw new Error(`后端健康检查失败，HTTP ${response.status}。`);
    }

    const payload = (await response.json()) as BackendHealthResponse;
    if (!payload.configured) {
      const missingVars = payload.missingEnvVars.join(", ");
      throw new Error(
        `后端已启动，但缺少 ${missingVars}。请先创建 backend/.env 并补齐配置后重启后端。`,
      );
    }
  };

  const ensureSocket = async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return socketRef.current;
    }

    if (socketPromiseRef.current) {
      return socketPromiseRef.current;
    }

    socketPromiseRef.current = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(socketUrl);
      socket.binaryType = "arraybuffer";
      let hasOpened = false;

      socket.onopen = () => {
        hasOpened = true;
        socketRef.current = socket;
        socketPromiseRef.current = null;
        resolve(socket);
      };

      socket.onerror = () => {
        socketPromiseRef.current = null;
        reject(new Error("无法连接后端 WebSocket。"));
      };

      socket.onclose = () => {
        socketRef.current = null;
        socketPromiseRef.current = null;
        setMicrophoneEnabled(false);
        playerRef.current?.clear();
        updateState((previous) => ({
          ...previous,
          status: previous.status === "error" ? previous.status : "disconnected",
          statusLabel:
            previous.status === "error"
              ? previous.statusLabel
              : statusToLabel("disconnected"),
          statusDetail:
            previous.status === "error"
              ? previous.statusDetail
              : hasOpened
                ? "后端连接已关闭。"
                : "后端 WebSocket 未建立成功。",
          canStop: false,
        }));
      };

      socket.onmessage = async (event) => {
        const parsed = JSON.parse(event.data) as ServerMessage;

        if (parsed.type === "audio") {
          await playerRef.current?.resume();
          playerRef.current?.enqueue(parsed.data);
          return;
        }

        if (parsed.type === "status") {
          if (parsed.status === "listening" || parsed.status === "assistant-speaking") {
            updateState((previous) => ({
              ...previous,
              canStop: true,
            }));
          }

          if (parsed.status === "listening") {
            playerRef.current?.clear();
          }

          updateState((previous) => ({
            ...previous,
            status: parsed.status,
            statusLabel: statusToLabel(parsed.status),
            statusDetail: parsed.detail || "",
            errorMessage: parsed.status === "error" ? previous.errorMessage : previous.errorMessage,
            canStop:
              parsed.status !== "disconnected" &&
              parsed.status !== "ended" &&
              parsed.status !== "error",
          }));
          return;
        }

        if (parsed.type === "conversation") {
          updateState((previous) => ({
            ...previous,
            conversation: parsed.conversation,
            generatedSummary: null,
          }));
          return;
        }

        if (parsed.type === "summary_preview") {
          updateState((previous) => ({
            ...previous,
            summaryPreview: parsed.summary,
            activeSummary: parsed.summary,
          }));
          return;
        }

        if (parsed.type === "summary_result") {
          updateState((previous) => ({
            ...previous,
            generatedSummary: parsed.summary,
            activeSummary: parsed.summary,
          }));
          return;
        }

        if (parsed.type === "error") {
          const message = parsed.message;
          updateState((previous) => ({
            ...previous,
            errorMessage: message,
            status: previous.status === "connecting" ? "error" : previous.status,
            statusLabel:
              previous.status === "connecting"
                ? statusToLabel("error")
                : previous.statusLabel,
            statusDetail:
              previous.status === "connecting" || previous.status === "error"
                ? message
                : previous.statusDetail,
          }));
        }
      };
    });

    return socketPromiseRef.current;
  };

  const ensureAudioPipeline = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风采集。");
    }

    if (!audioContextRef.current) {
      const context = new AudioContext({ latencyHint: "interactive" });
      await context.audioWorklet.addModule("/audio-capture-worklet.js");
      audioContextRef.current = context;
      playerRef.current = new PcmPlayer(context);
    }

    if (!mediaStreamRef.current) {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setMicrophoneEnabled(false);
    }

    if (!workletNodeRef.current && audioContextRef.current && mediaStreamRef.current) {
      const source = audioContextRef.current.createMediaStreamSource(
        mediaStreamRef.current,
      );
      const workletNode = new AudioWorkletNode(
        audioContextRef.current,
        "audio-capture-processor",
        {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        },
      );

      workletNode.port.onmessage = ({ data }) => {
        if (
          !isStreamingRef.current ||
          socketRef.current?.readyState !== WebSocket.OPEN ||
          !audioContextRef.current
        ) {
          return;
        }

        const downsampled = downsampleFloat32ToInt16(
          data as Float32Array,
          audioContextRef.current.sampleRate,
        );
        socketRef.current.send(downsampled.buffer);
      };

      source.connect(workletNode);
      workletNodeRef.current = workletNode;
    }
  };

  const startConversation = async (sessionConfig: OutboundCallSessionConfig) => {
    updateState((previous) => ({
      ...previous,
      status: "connecting",
      statusLabel: statusToLabel("connecting"),
      statusDetail: "正在分析采购简报、检查后端并准备麦克风。",
      errorMessage: "",
      generatedSummary: null,
      activeSummary: previous.summaryPreview,
    }));

    try {
      if (!sessionConfig.procurementRequest.trim()) {
        throw new Error("请先填写采购 JSON，再开始外呼。");
      }

      try {
        JSON.parse(sessionConfig.procurementRequest);
      } catch {
        throw new Error("采购简报需要是合法 JSON，当前内容还无法解析。");
      }

      await checkBackendHealth();
      await ensureAudioPipeline();
      await audioContextRef.current?.resume();
      await playerRef.current?.resume();
      const socket = await ensureSocket();
      setMicrophoneEnabled(true);
      socket.send(
        JSON.stringify({
          type: "start",
          sessionConfig,
        }),
      );
    } catch (error) {
      setMicrophoneEnabled(false);
      playerRef.current?.clear();
      const message =
        error instanceof Error ? error.message : "启动语音会话失败。";
      updateState((previous) => ({
        ...previous,
        status: "error",
        statusLabel: statusToLabel("error"),
        statusDetail: message,
        canStop: false,
        errorMessage: message,
      }));
    }
  };

  const stopConversation = () => {
    setMicrophoneEnabled(false);
    playerRef.current?.clear();
    socketRef.current?.send(JSON.stringify({ type: "stop" }));

    updateState((previous) => ({
      ...previous,
      status: "ended",
      statusLabel: statusToLabel("ended"),
      statusDetail: "会话已停止，可重新开始。",
      canStop: false,
    }));
  };

  const clearConversation = () => {
    setMicrophoneEnabled(false);
    playerRef.current?.clear();
    socketRef.current?.send(JSON.stringify({ type: "clear" }));

    updateState(() => ({
      ...initialState,
      summaryPreview: createEmptySummary(),
      activeSummary: createEmptySummary(),
    }));
  };

  const generateSummary = () => {
    socketRef.current?.send(JSON.stringify({ type: "generate_summary" }));
  };

  useEffect(() => {
    return () => {
      setMicrophoneEnabled(false);
      playerRef.current?.dispose();
      workletNodeRef.current?.disconnect();
      socketRef.current?.close();
      for (const track of mediaStreamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      void audioContextRef.current?.close();
    };
  }, []);

  return {
    state,
    startConversation,
    stopConversation,
    clearConversation,
    generateSummary,
  };
}
