export type SessionStatus =
  | "disconnected"
  | "connecting"
  | "listening"
  | "assistant-speaking"
  | "ended"
  | "error";

export interface ConversationMessage {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  final: boolean;
  updatedAt: number;
}

export interface ReferenceAttachment {
  name: string;
  mimeType: string;
  size: number;
  textExcerpt: string;
}

export interface OutboundCallSessionConfig {
  procurementRequest: string;
  extraInstructions: string;
  attachments: ReferenceAttachment[];
}

export interface ProcurementSummary {
  product_information: {
    product: string;
    type: string;
    usage: string;
    key_specs_custom_points: string;
  };
  procurement_plan: {
    quantity: string;
    budget: string;
    delivery_time: string;
    delivery_location: string;
    sample_required: string;
  };
  price_quotation: {
    quotation_preference: string;
    tax_included: string;
    shipping_included: string;
    invoice_type: string;
  };
  market_compliance: {
    target_market: string;
    compliance_certifications_required: string;
    supplier_supporting_certification: string;
  };
  supplier_requirements: {
    supplier_region_preference: string;
    supplier_qualification: string;
    export_support_required: string;
    other_requirements: string;
  };
  missing_information: string[];
  next_questions: string[];
  procurement_readiness_score: number;
}

export interface VoiceAgentState {
  status: SessionStatus;
  statusLabel: string;
  statusDetail: string;
  conversation: ConversationMessage[];
  summaryPreview: ProcurementSummary;
  generatedSummary: ProcurementSummary | null;
  activeSummary: ProcurementSummary;
  errorMessage: string;
  canStop: boolean;
}

export interface BackendHealthResponse {
  ok: boolean;
  configured: boolean;
  missingEnvVars: string[];
  model: string;
  summaryModel: string;
}

export type ServerMessage =
  | {
      type: "status";
      status: SessionStatus;
      detail?: string;
    }
  | {
      type: "conversation";
      conversation: ConversationMessage[];
    }
  | {
      type: "audio";
      data: string;
    }
  | {
      type: "summary_preview" | "summary_result";
      summary: ProcurementSummary;
    }
  | {
      type: "error";
      message: string;
    };
