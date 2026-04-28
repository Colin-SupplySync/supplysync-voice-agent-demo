import dotenv from "dotenv";
import { z } from "zod";

import type { BackendEnv } from "./types.js";

dotenv.config();

const envSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-live-preview"),
  GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_VOICE_NAME: z.string().optional(),
  VOLCENGINE_API_KEY: z.string().optional(),
  VOLCENGINE_TTS_RESOURCE_ID: z.string().min(1).default("seed-icl-2.0"),
  VOLCENGINE_TTS_VOICE_ID: z.string().optional(),
  VOLCENGINE_TTS_SPEECH_RATE: z.coerce.number().min(-50).max(100).default(45),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = envSchema.parse(process.env);

const missingEnvVars: string[] = [];
const apiKey = parsed.GEMINI_API_KEY?.trim();
const volcengineApiKey = parsed.VOLCENGINE_API_KEY?.trim();
const volcengineVoiceId = parsed.VOLCENGINE_TTS_VOICE_ID?.trim();

if (!apiKey) {
  missingEnvVars.push("GEMINI_API_KEY");
}

if (!volcengineApiKey) {
  missingEnvVars.push("VOLCENGINE_API_KEY");
}

if (!volcengineVoiceId) {
  missingEnvVars.push("VOLCENGINE_TTS_VOICE_ID");
}

export const env: BackendEnv = {
  ...parsed,
  GEMINI_API_KEY: apiKey || undefined,
  VOLCENGINE_API_KEY: volcengineApiKey || undefined,
  VOLCENGINE_TTS_VOICE_ID: volcengineVoiceId || undefined,
  isConfigured: missingEnvVars.length === 0,
  missingEnvVars,
};
