import { useEffect, useRef } from "react";

import type { ConversationMessage } from "../types";

function speakerLabel(speaker: ConversationMessage["speaker"]) {
  return speaker === "user" ? "供应商（你）" : "采购外呼 Agent";
}

export function ConversationList({
  conversation,
}: {
  conversation: ConversationMessage[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [conversation]);

  return (
    <section className="overflow-hidden rounded-[24px] border border-white/8 bg-slate-950/45">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-white">实时对话记录</h2>
          <p className="text-sm text-slate-400">
            浏览器端展示供应商语音转文字与 AI 采购来电转录。
          </p>
        </div>
      </div>

      <div
        ref={containerRef}
        className="max-h-[32rem] space-y-3 overflow-y-auto px-4 py-4"
      >
        {conversation.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400">
            还没有通话内容。点击“开始外呼”后，AI 会先开场，你再以供应商身份直接说中文回复即可。
          </div>
        ) : null}

        {conversation.map((item) => {
          const isUser = item.speaker === "user";
          return (
            <article
              key={item.id}
              className={`max-w-[92%] rounded-3xl border px-4 py-3 ${
                isUser
                  ? "ml-auto border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
                  : "mr-auto border-white/10 bg-white/[0.05] text-slate-100"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-[0.24em] text-slate-300/80">
                  {speakerLabel(item.speaker)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {item.final ? "已确认" : "转录中"}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-7">{item.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
