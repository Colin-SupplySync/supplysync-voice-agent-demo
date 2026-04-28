import { useDeferredValue, useState, type ChangeEvent } from "react";

import { ActionButton } from "./components/ActionButton";
import { CallBriefComposer } from "./components/CallBriefComposer";
import { ConversationList } from "./components/ConversationList";
import { StatusBadge } from "./components/StatusBadge";
import { SummaryPanel } from "./components/SummaryPanel";
import { useVoiceAgent } from "./hooks/useVoiceAgent";
import type { ReferenceAttachment } from "./types";

const sampleProcurementRequest = `{
  "project_name": "华东区域工业设备备件寻源",
  "buyer_identity": {
    "company_type": "设备制造企业",
    "contact_role": "采购专员"
  },
  "product_requirement": {
    "product_name": "3Cr13 定制电机轴",
    "category": "机加工定制件",
    "usage": "用于中型工业电机传动组件",
    "key_specs": [
      "按图纸定制",
      "材质 3Cr13",
      "需淬火",
      "关键尺寸公差需稳定"
    ]
  },
  "procurement_plan": {
    "quantity": 20000,
    "sample_required": true,
    "delivery_location": "上海",
    "target_delivery_time": "首批 4 周内",
    "quotation_preference": "先报含税单价，再确认运费"
  },
  "supplier_screening_focus": [
    "是否做过类似定制轴类产品",
    "是否能看图报价",
    "样品周期",
    "量产交期",
    "起订量",
    "质量控制能力"
  ],
  "unknowns_to_confirm": [
    "对方是否具备稳定热处理配套",
    "是否能接受两万件排产",
    "是否支持开 13% 增值税专票"
  ]
}`;

const sampleExtraInstructions =
  "你是主动外呼的采购，不要像客服。开场先确认对方是不是做这类产品，再判断是否值得继续深聊。多用短句，像真人电话。";

const textLikeFilePattern = /\.(txt|md|markdown|json|csv|tsv|yaml|yml|xml)$/i;

async function readAttachment(file: File): Promise<ReferenceAttachment> {
  let textExcerpt = "";
  const isTextLike =
    file.type.startsWith("text/") ||
    file.type.includes("json") ||
    file.type.includes("xml") ||
    file.type.includes("csv") ||
    textLikeFilePattern.test(file.name);

  if (isTextLike) {
    try {
      textExcerpt = (await file.text()).slice(0, 12000);
    } catch {
      textExcerpt = "";
    }
  }

  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    textExcerpt,
  };
}

function App() {
  const {
    state,
    startConversation,
    stopConversation,
    clearConversation,
    generateSummary,
  } = useVoiceAgent();
  const deferredConversation = useDeferredValue(state.conversation);
  const [procurementRequest, setProcurementRequest] = useState(
    sampleProcurementRequest,
  );
  const [extraInstructions, setExtraInstructions] = useState(
    sampleExtraInstructions,
  );
  const [attachments, setAttachments] = useState<ReferenceAttachment[]>([]);

  const handleFilesSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const nextAttachments = await Promise.all(files.map((file) => readAttachment(file)));
    setAttachments((previous) => {
      const merged = [...previous];
      for (const attachment of nextAttachments) {
        const index = merged.findIndex((item) => item.name === attachment.name);
        if (index >= 0) {
          merged[index] = attachment;
        } else {
          merged.push(attachment);
        }
      }
      return merged;
    });

    event.target.value = "";
  };

  const resetSampleBrief = () => {
    setProcurementRequest(sampleProcurementRequest);
    setExtraInstructions(sampleExtraInstructions);
    setAttachments([]);
  };

  return (
    <main className="min-h-screen px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(9,34,52,0.92),rgba(20,22,34,0.9))] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-6 border-b border-white/10 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.28em] text-cyan-200/80">
                SupplySync AI Voice Procurement Demo
              </p>
              <h1 className="mt-3 font-['Avenir_Next','PingFang_SC','Noto_Sans_SC',sans-serif] text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                SupplySync AI 采购外呼 Agent Demo
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                这次不是你给 AI 打电话，而是 AI 先看采购简报，再以采购身份主动打给你。你在网页里扮演供应商，浏览器麦克风用于“接听”和回复。
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50 shadow-inner shadow-cyan-500/10">
              <div className="flex items-center gap-3">
                <StatusBadge status={state.status} />
                <span className="font-medium">{state.statusLabel}</span>
              </div>
              <p className="mt-2 text-cyan-100/80">
                {state.statusDetail || "建议佩戴耳机，你现在扮演供应商接听 AI 来电。"}
              </p>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            <CallBriefComposer
              procurementRequest={procurementRequest}
              extraInstructions={extraInstructions}
              attachments={attachments}
              onProcurementRequestChange={setProcurementRequest}
              onExtraInstructionsChange={setExtraInstructions}
              onFilesSelected={handleFilesSelected}
              onRemoveAttachment={(name) =>
                setAttachments((previous) =>
                  previous.filter((item) => item.name !== name),
                )
              }
              onResetSample={resetSampleBrief}
            />

            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
            <section className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <ActionButton
                    label="开始外呼"
                    variant="primary"
                    onClick={() =>
                      startConversation({
                        procurementRequest,
                        extraInstructions,
                        attachments,
                      })
                    }
                    disabled={state.status === "connecting"}
                  />
                  <ActionButton
                    label="结束通话"
                    variant="secondary"
                    onClick={stopConversation}
                    disabled={!state.canStop}
                  />
                  <ActionButton
                    label="清空记录"
                    variant="ghost"
                    onClick={clearConversation}
                  />
                  <ActionButton
                    label="生成通话总结"
                    variant="accent"
                    onClick={generateSummary}
                    disabled={state.conversation.length === 0}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      当前连接状态
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {state.statusLabel}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      你用麦克风扮演供应商，AI 会主动先开口。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      对话条数
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {state.conversation.length}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      包含供应商与采购外呼 Agent 的转录记录。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      完整度评分
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {state.activeSummary.procurement_readiness_score}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      基于当前采购信息完整度动态更新。
                    </p>
                  </div>
                </div>

                {state.errorMessage ? (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {state.errorMessage}
                  </div>
                ) : null}

                <ConversationList conversation={deferredConversation} />
              </div>
            </section>

            <SummaryPanel
              summary={state.activeSummary}
              hasGeneratedSummary={Boolean(state.generatedSummary)}
            />
          </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
