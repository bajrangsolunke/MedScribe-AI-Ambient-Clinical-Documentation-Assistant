export type SessionStatus = "created" | "processing" | "completed" | "failed";

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SessionSummary {
  id: number;
  patient_label: string;
  chief_complaint: string | null;
  status: SessionStatus;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface SoapPayload {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  edited_at: string | null;
}

export interface IcdSuggestion {
  id: number;
  code: string;
  description: string;
  confidence: number;
  reasoning: string;
  is_validated: boolean;
  accepted_by_user: boolean | null;
}

export interface SessionDetail extends SessionSummary {
  transcript_text: string | null;
  visit_summary: string | null;
  soap_note: SoapPayload | null;
  icd_suggestions: IcdSuggestion[];
}

export type PipelineStage =
  | "pipeline"
  | "transcribe"
  | "soap"
  | "icd_candidates"
  | "icd_validated"
  | "summary";

export type StageStatus = "started" | "in_progress" | "done" | "complete" | "error" | "pending";

export interface PipelineEvent {
  stage: PipelineStage;
  status: StageStatus;
  ts: string;
  meta?: Record<string, unknown>;
}
