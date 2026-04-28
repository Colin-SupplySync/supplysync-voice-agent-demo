import crypto from "node:crypto";

const VOLCENGINE_TTS_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
export const VOLCENGINE_PCM_SAMPLE_RATE = 24_000;

interface VolcengineTtsResponse {
  code: number;
  message?: string;
  data?: string;
}

function parseResponseLines(bodyText: string): VolcengineTtsResponse[] {
  const segments = bodyText
    .split(/\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const parsedResponses: VolcengineTtsResponse[] = [];

  for (const segment of segments) {
    try {
      parsedResponses.push(JSON.parse(segment) as VolcengineTtsResponse);
    } catch {
      // Ignore non-JSON chunks and continue scanning for the audio payload.
    }
  }

  if (parsedResponses.length > 0) {
    return parsedResponses;
  }

  return [JSON.parse(bodyText) as VolcengineTtsResponse];
}

export interface VolcengineTtsConfig {
  apiKey: string;
  resourceId: string;
  voiceId: string;
  speechRate?: number;
}

export interface SynthesizedSpeech {
  audio: Buffer;
  sampleRate: number;
}

export async function streamSpeech(params: {
  config: VolcengineTtsConfig;
  text: string;
  uid?: string;
  signal?: AbortSignal;
  onChunk?: (chunk: Buffer) => void | Promise<void>;
}): Promise<SynthesizedSpeech> {
  const payload = {
    user: {
      uid: params.uid || "supplysync-voice-agent",
    },
    req_params: {
      text: params.text,
      speaker: params.config.voiceId,
      audio_params: {
        format: "pcm",
        sample_rate: VOLCENGINE_PCM_SAMPLE_RATE,
        ...(typeof params.config.speechRate === "number"
          ? { speech_rate: params.config.speechRate }
          : {}),
      },
    },
  };

  const response = await fetch(VOLCENGINE_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": params.config.apiKey,
      "X-Api-Request-Id": crypto.randomUUID(),
      "X-Api-Resource-Id": params.config.resourceId,
    },
    body: JSON.stringify(payload),
    signal: params.signal,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `火山语音合成请求失败，HTTP ${response.status}${
        bodyText ? `：${bodyText.slice(0, 160)}` : ""
      }`,
    );
  }

  if (!response.body) {
    throw new Error("火山语音合成没有返回可读取的数据流。");
  }

  const audioChunks: Buffer[] = [];
  const decoder = new TextDecoder();
  let bufferedText = "";
  let lastResponse: VolcengineTtsResponse | null = null;

  const flushSegment = async (segment: string) => {
    if (!segment.trim()) {
      return;
    }

    let parsed: VolcengineTtsResponse;
    try {
      parsed = JSON.parse(segment) as VolcengineTtsResponse;
    } catch {
      return;
    }

    lastResponse = parsed;
    if (parsed.code === 0 && typeof parsed.data === "string" && parsed.data) {
      const chunk = Buffer.from(parsed.data, "base64");
      audioChunks.push(chunk);
      await params.onChunk?.(chunk);
    }
  };

  for await (const rawChunk of response.body) {
    bufferedText += decoder.decode(rawChunk, { stream: true });

    let lineBreakIndex = bufferedText.indexOf("\n");
    while (lineBreakIndex >= 0) {
      const line = bufferedText.slice(0, lineBreakIndex);
      bufferedText = bufferedText.slice(lineBreakIndex + 1);
      await flushSegment(line);
      lineBreakIndex = bufferedText.indexOf("\n");
    }
  }

  bufferedText += decoder.decode();
  if (bufferedText.trim()) {
    for (const segment of bufferedText.split(/\r?\n/)) {
      await flushSegment(segment);
    }
  }

  if (audioChunks.length === 0) {
    const responseForError = lastResponse as VolcengineTtsResponse | null;
    const fallbackErrorMessage = responseForError
      ? responseForError.message || `火山语音合成失败，错误码 ${responseForError.code ?? "unknown"}。`
      : "火山语音合成失败，未收到可播放的音频分片。";
    throw new Error(fallbackErrorMessage);
  }

  return {
    audio: Buffer.concat(audioChunks),
    sampleRate: VOLCENGINE_PCM_SAMPLE_RATE,
  };
}

export async function synthesizeSpeech(params: {
  config: VolcengineTtsConfig;
  text: string;
  uid?: string;
}): Promise<SynthesizedSpeech> {
  return streamSpeech(params);
}
