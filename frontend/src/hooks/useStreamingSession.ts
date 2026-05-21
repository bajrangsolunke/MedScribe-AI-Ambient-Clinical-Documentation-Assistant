import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import type { PipelineEvent, ScribePhase, StageStatus } from "@/types";

export const PIPELINE_STAGES = [
  "soap",
  "icd_candidates",
  "icd_validated",
  "summary",
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number];

export interface StageState {
  key: PipelineStageKey;
  label: string;
  status: StageStatus;
}

const STAGE_LABELS: Record<PipelineStageKey, string> = {
  soap: "SOAP",
  icd_candidates: "ICD candidates",
  icd_validated: "Validate ICD",
  summary: "Summary",
};

function initialStages(): StageState[] {
  return PIPELINE_STAGES.map((key) => ({ key, label: STAGE_LABELS[key], status: "pending" }));
}

/**
 * Drives the live-streaming session state machine:
 *   idle  →  recording  →  finalizing  →  completed | failed
 *
 * Live phase:
 *   - pushChunk(blob, isFinal) is called by the recorder. Uploads are
 *     serialized via an internal awaited promise chain so chunks always
 *     arrive in sequence order at the server.
 *   - The SSE stream is opened on the first chunk upload and receives
 *     `transcribe:fragment` events, which are appended to the transcript
 *     string in arrival order.
 *
 * Finalize phase:
 *   - When the recorder emits its final chunk, pushChunk awaits that
 *     upload and then calls /finalize. The same SSE stream then carries
 *     the SOAP/ICD/summary stage events.
 */
export function useStreamingSession(sessionId: number | null) {
  const [phase, setPhase] = useState<ScribePhase>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [stages, setStages] = useState<StageState[]>(initialStages);
  const [error, setError] = useState<string | null>(null);

  const sequenceRef = useRef(0);
  const uploadQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<number | null>(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const reset = useCallback(() => {
    sequenceRef.current = 0;
    uploadQueueRef.current = Promise.resolve();
    closeStream();
    setPhase("idle");
    setTranscript("");
    setStages(initialStages());
    setError(null);
  }, [closeStream]);

  useEffect(() => () => closeStream(), [closeStream]);

  const handleEvent = useCallback((ev: PipelineEvent) => {
    if (ev.stage === "transcribe" && ev.status === "fragment") {
      const text = (ev.meta?.text as string | undefined) ?? "";
      if (text) {
        setTranscript((prev) => (prev ? `${prev} ${text}` : text));
      }
      return;
    }
    if (ev.stage === "pipeline") {
      if (ev.status === "complete") {
        setPhase("completed");
        closeStream();
      } else if (ev.status === "error") {
        setError((ev.meta?.message as string) ?? "Pipeline failed");
        setPhase("failed");
        closeStream();
      }
      return;
    }
    setStages((prev) =>
      prev.map((s) => (s.key === ev.stage ? { ...s, status: ev.status } : s)),
    );
  }, [closeStream]);

  const openStream = useCallback(
    (sid: number) => {
      if (sourceRef.current) return; // already open
      const token = useAuthStore.getState().token;
      if (!token) {
        setError("Not authenticated");
        setPhase("failed");
        return;
      }
      const es = new EventSource(api.sessions.streamUrl(sid, token));
      sourceRef.current = es;

      es.onmessage = (e) => handleEvent(JSON.parse(e.data) as PipelineEvent);
      es.addEventListener("ping", () => undefined);

      const stageEvents: [string, string][] = [
        ["transcribe", "fragment"],
        ["soap", "in_progress"],
        ["soap", "done"],
        ["icd_candidates", "in_progress"],
        ["icd_candidates", "done"],
        ["icd_validated", "in_progress"],
        ["icd_validated", "done"],
        ["summary", "in_progress"],
        ["summary", "done"],
        ["pipeline", "started"],
        ["pipeline", "complete"],
        ["pipeline", "error"],
      ];
      stageEvents.forEach(([stage, status]) =>
        es.addEventListener(`${stage}:${status}`, (e) =>
          handleEvent(JSON.parse((e as MessageEvent).data) as PipelineEvent),
        ),
      );

      es.onerror = () => {
        // Connection blip — the browser will retry automatically.
        // Don't transition state unless we receive a terminal event.
      };
    },
    [handleEvent],
  );

  const pushChunk = useCallback(
    (blob: Blob, isFinal: boolean) => {
      const sid = sessionIdRef.current;
      if (sid == null) return;
      if (phase === "idle") setPhase("recording");

      const sequence = sequenceRef.current++;
      // Open the SSE stream on the first chunk so fragment events flow to us.
      openStream(sid);

      uploadQueueRef.current = uploadQueueRef.current
        .then(() => api.sessions.uploadChunk(sid, blob, sequence))
        .then(() => {
          if (isFinal) {
            setPhase("finalizing");
            return api.sessions.finalize(sid);
          }
          return undefined;
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Chunk upload failed");
          setPhase("failed");
        });
    },
    [openStream, phase],
  );

  return { phase, transcript, stages, error, pushChunk, reset };
}
