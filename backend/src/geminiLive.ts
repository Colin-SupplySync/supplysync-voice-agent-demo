import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

export function buildLiveConfig(systemPrompt: string, voiceName?: string) {
  return {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.MINIMAL,
    },
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    ...(voiceName
      ? {
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        }
      : {}),
  };
}
