import type { ChangeEvent } from "react";

import type { ReferenceAttachment } from "../types";

interface CallBriefComposerProps {
  procurementRequest: string;
  extraInstructions: string;
  attachments: ReferenceAttachment[];
  onProcurementRequestChange: (value: string) => void;
  onExtraInstructionsChange: (value: string) => void;
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (name: string) => void;
  onResetSample: () => void;
}

export function CallBriefComposer({
  procurementRequest,
  extraInstructions,
  attachments,
  onProcurementRequestChange,
  onExtraInstructionsChange,
  onFilesSelected,
  onRemoveAttachment,
  onResetSample,
}: CallBriefComposerProps) {
  return (
    <section className="rounded-[24px] border border-cyan-300/15 bg-slate-950/35 p-4">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-white">采购来电简报</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            AI 会先读取这里的采购 JSON 和可选附件，再以真人采购的口吻主动打给你。你在对话里扮演供应商，不需要先给 AI 提需求。
          </p>
        </div>
        <button
          type="button"
          onClick={onResetSample}
          className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.09]"
        >
          恢复示例简报
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">
              采购 JSON
            </span>
            <textarea
              value={procurementRequest}
              onChange={(event) => onProcurementRequestChange(event.target.value)}
              className="min-h-[18rem] w-full rounded-3xl border border-white/10 bg-[#08131d] px-4 py-4 font-mono text-sm leading-6 text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35"
              placeholder="请贴入采购需求 JSON"
              spellCheck={false}
            />
          </label>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">
              补充话术要求
            </span>
            <textarea
              value={extraInstructions}
              onChange={(event) => onExtraInstructionsChange(event.target.value)}
              className="min-h-[9.5rem] w-full rounded-3xl border border-white/10 bg-[#08131d] px-4 py-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35"
              placeholder="例如：先确认是否有现货，再问 MOQ 和交期。语气像成熟采购，不要像客服。"
            />
          </label>

          <div className="rounded-3xl border border-white/10 bg-[#08131d] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  可选附件
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  支持上传 `txt`、`md`、`json` 等文本附件；非文本文件会只带文件元信息进入 Prompt。
                </p>
              </div>
              <label className="cursor-pointer rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/15">
                上传附件
                <input
                  type="file"
                  multiple
                  onChange={onFilesSelected}
                  className="hidden"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {attachments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                  当前没有附件。只用采购 JSON 也能直接模拟外呼。
                </div>
              ) : null}

              {attachments.map((attachment) => (
                <article
                  key={attachment.name}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{attachment.name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {attachment.mimeType || "unknown"} · {attachment.size} bytes
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(attachment.name)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/[0.06]"
                    >
                      删除
                    </button>
                  </div>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-6 text-slate-300">
                    {attachment.textExcerpt.trim()
                      ? attachment.textExcerpt
                      : "未解析出文本内容，模型将仅看到文件名、类型和大小。"}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
