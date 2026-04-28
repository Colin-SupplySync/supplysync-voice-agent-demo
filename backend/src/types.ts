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
  extraInstructions?: string;
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

export type ClientControlMessage =
  | {
      type: "start";
      sessionConfig: OutboundCallSessionConfig;
    }
  | {
      type: "stop" | "clear" | "generate_summary";
    };

export interface StatusEvent {
  type: "status";
  status: SessionStatus;
  detail?: string;
}

export interface ConversationEvent {
  type: "conversation";
  conversation: ConversationMessage[];
}

export interface AudioEvent {
  type: "audio";
  data: string;
}

export interface SummaryEvent {
  type: "summary_preview" | "summary_result";
  summary: ProcurementSummary;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ServerEvent =
  | StatusEvent
  | ConversationEvent
  | AudioEvent
  | SummaryEvent
  | ErrorEvent;

export interface BackendEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  GEMINI_TEXT_MODEL: string;
  GEMINI_VOICE_NAME?: string;
  VOLCENGINE_API_KEY?: string;
  VOLCENGINE_TTS_RESOURCE_ID: string;
  VOLCENGINE_TTS_VOICE_ID?: string;
  VOLCENGINE_TTS_SPEECH_RATE: number;
  PORT: number;
  CLIENT_ORIGIN: string;
  isConfigured: boolean;
  missingEnvVars: string[];
}
