import http from "node:http";

import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { env } from "./env.js";
import { createGeminiClient } from "./geminiLive.js";
import { ClientSessionManager } from "./sessionManager.js";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
  }),
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: env.isConfigured,
    missingEnvVars: env.missingEnvVars,
    model: env.GEMINI_MODEL,
    summaryModel: env.GEMINI_TEXT_MODEL,
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const ai = env.GEMINI_API_KEY ? createGeminiClient(env.GEMINI_API_KEY) : null;

wss.on("connection", (ws) => {
  if (!ai || !env.isConfigured) {
    ws.send(
      JSON.stringify({
        type: "error",
        message:
          `后端已启动，但缺少 ${env.missingEnvVars.join(", ")}。请先在 backend/.env 中补齐配置后重启后端。`,
      }),
    );
    ws.close();
    return;
  }

  const manager = new ClientSessionManager({ ws, ai, env });

  ws.on("message", (data, isBinary) => {
    manager.handleMessage(data, isBinary);
  });

  ws.on("close", () => {
    manager.destroy();
  });

  ws.on("error", () => {
    manager.destroy();
  });
});

server.listen(env.PORT, () => {
  // Keep startup logging simple for local development.
  console.log(`SupplySync backend listening on http://localhost:${env.PORT}`);
  if (!env.isConfigured) {
    console.log(
      `Backend is running in config-check mode. Missing env vars: ${env.missingEnvVars.join(", ")}`,
    );
  }
});
