import type { ProcurementSummary } from "../types";

const fieldGroups = [
  {
    title: "产品信息",
    fields: [
      ["产品", "product_information.product"],
      ["采购类型", "product_information.type"],
      ["用途", "product_information.usage"],
      ["规格参数", "product_information.key_specs_custom_points"],
    ],
  },
  {
    title: "采购计划",
    fields: [
      ["数量", "procurement_plan.quantity"],
      ["预算", "procurement_plan.budget"],
      ["交付时间", "procurement_plan.delivery_time"],
      ["交付地点", "procurement_plan.delivery_location"],
      ["样品要求", "procurement_plan.sample_required"],
    ],
  },
  {
    title: "报价要求",
    fields: [
      ["报价偏好", "price_quotation.quotation_preference"],
      ["是否含税", "price_quotation.tax_included"],
      ["是否含运费", "price_quotation.shipping_included"],
      ["发票类型", "price_quotation.invoice_type"],
    ],
  },
  {
    title: "市场与认证",
    fields: [
      ["目标市场", "market_compliance.target_market"],
      ["认证要求", "market_compliance.compliance_certifications_required"],
      ["供应商配套认证", "market_compliance.supplier_supporting_certification"],
    ],
  },
  {
    title: "供应商要求",
    fields: [
      ["区域偏好", "supplier_requirements.supplier_region_preference"],
      ["资质要求", "supplier_requirements.supplier_qualification"],
      ["出口支持", "supplier_requirements.export_support_required"],
      ["其他要求", "supplier_requirements.other_requirements"],
    ],
  },
] as const;

function readPath(summary: ProcurementSummary, path: string) {
  return path
    .split(".")
    .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], summary);
}

function renderValue(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "待确认";
}

export function SummaryPanel({
  summary,
  hasGeneratedSummary,
}: {
  summary: ProcurementSummary;
  hasGeneratedSummary: boolean;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4">
      <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">结构化通话面板</h2>
          <p className="mt-1 text-sm text-slate-300">
            按采购字段和供应商反馈实时更新，点击“生成通话总结”后下方 JSON 会变成最终版本。
          </p>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-right">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-100/80">
            Procurement Readiness
          </p>
          <p className="mt-1 text-2xl font-semibold text-amber-100">
            {summary.procurement_readiness_score}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {fieldGroups.map((group) => (
          <section
            key={group.title}
            className="rounded-2xl border border-white/8 bg-slate-950/35 p-4"
          >
            <h3 className="text-sm font-semibold tracking-[0.16em] text-slate-200 uppercase">
              {group.title}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.fields.map(([label, path]) => (
                <div
                  key={path}
                  className="rounded-2xl border border-white/7 bg-white/[0.03] px-3 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-100">
                    {renderValue(readPath(summary, path))}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-slate-950/35 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">
              尚缺信息
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.missing_information.length > 0 ? (
                summary.missing_information.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-100"
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">当前没有明显缺失项。</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-slate-950/35 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">
              下一步建议
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.next_questions.length > 0 ? (
                summary.next_questions.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-50"
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">等待更多对话后给出追问建议。</span>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">
              通话总结 JSON
            </h3>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
              {hasGeneratedSummary ? "最终版" : "实时草稿"}
            </span>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/8 bg-[#07111a] p-4 text-xs leading-6 text-cyan-100">
            {JSON.stringify(summary, null, 2)}
          </pre>
        </section>
      </div>
    </section>
  );
}
