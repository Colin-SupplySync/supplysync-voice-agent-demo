import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

import { buildSummaryPrompt } from "./prompts.js";
import type { ConversationMessage, ProcurementSummary } from "./types.js";

const procurementSummarySchema = z.object({
  product_information: z.object({
    product: z.string(),
    type: z.string(),
    usage: z.string(),
    key_specs_custom_points: z.string(),
  }),
  procurement_plan: z.object({
    quantity: z.string(),
    budget: z.string(),
    delivery_time: z.string(),
    delivery_location: z.string(),
    sample_required: z.string(),
  }),
  price_quotation: z.object({
    quotation_preference: z.string(),
    tax_included: z.string(),
    shipping_included: z.string(),
    invoice_type: z.string(),
  }),
  market_compliance: z.object({
    target_market: z.string(),
    compliance_certifications_required: z.string(),
    supplier_supporting_certification: z.string(),
  }),
  supplier_requirements: z.object({
    supplier_region_preference: z.string(),
    supplier_qualification: z.string(),
    export_support_required: z.string(),
    other_requirements: z.string(),
  }),
  missing_information: z.array(z.string()),
  next_questions: z.array(z.string()),
  procurement_readiness_score: z.number().int().min(0).max(100),
});

export function createEmptySummary(): ProcurementSummary {
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

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    product_information: {
      type: Type.OBJECT,
      properties: {
        product: { type: Type.STRING },
        type: { type: Type.STRING },
        usage: { type: Type.STRING },
        key_specs_custom_points: { type: Type.STRING },
      },
      required: ["product", "type", "usage", "key_specs_custom_points"],
    },
    procurement_plan: {
      type: Type.OBJECT,
      properties: {
        quantity: { type: Type.STRING },
        budget: { type: Type.STRING },
        delivery_time: { type: Type.STRING },
        delivery_location: { type: Type.STRING },
        sample_required: { type: Type.STRING },
      },
      required: [
        "quantity",
        "budget",
        "delivery_time",
        "delivery_location",
        "sample_required",
      ],
    },
    price_quotation: {
      type: Type.OBJECT,
      properties: {
        quotation_preference: { type: Type.STRING },
        tax_included: { type: Type.STRING },
        shipping_included: { type: Type.STRING },
        invoice_type: { type: Type.STRING },
      },
      required: [
        "quotation_preference",
        "tax_included",
        "shipping_included",
        "invoice_type",
      ],
    },
    market_compliance: {
      type: Type.OBJECT,
      properties: {
        target_market: { type: Type.STRING },
        compliance_certifications_required: { type: Type.STRING },
        supplier_supporting_certification: { type: Type.STRING },
      },
      required: [
        "target_market",
        "compliance_certifications_required",
        "supplier_supporting_certification",
      ],
    },
    supplier_requirements: {
      type: Type.OBJECT,
      properties: {
        supplier_region_preference: { type: Type.STRING },
        supplier_qualification: { type: Type.STRING },
        export_support_required: { type: Type.STRING },
        other_requirements: { type: Type.STRING },
      },
      required: [
        "supplier_region_preference",
        "supplier_qualification",
        "export_support_required",
        "other_requirements",
      ],
    },
    missing_information: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    next_questions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    procurement_readiness_score: { type: Type.INTEGER },
  },
  required: [
    "product_information",
    "procurement_plan",
    "price_quotation",
    "market_compliance",
    "supplier_requirements",
    "missing_information",
    "next_questions",
    "procurement_readiness_score",
  ],
} as const;

export function formatConversationForModel(
  conversation: ConversationMessage[],
): string {
  if (conversation.length === 0) {
    return "暂无对话。";
  }

  return conversation
    .map((item) => `${item.speaker === "user" ? "用户" : "采购 Agent"}：${item.text}`)
    .join("\n");
}

export async function generateProcurementSummary(params: {
  ai: GoogleGenAI;
  model: string;
  conversation: ConversationMessage[];
}): Promise<ProcurementSummary> {
  const transcript = formatConversationForModel(params.conversation);
  const response = await params.ai.models.generateContent({
    model: params.model,
    contents: buildSummaryPrompt(transcript),
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini did not return a summary payload.");
  }

  const parsed = JSON.parse(text);
  return procurementSummarySchema.parse(parsed);
}
