import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import type { PipelineEvent, StageStatus } from "@/types";

export const PIPELINE_STAGES = [
  "transcribe",
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
  transcribe: "Transcribe",
  soap: "SOAP",
  icd_candidates: "ICD candidates",
  icd_validated: "Validate ICD",
  summary: "Summary",
};

function initialStages(): StageState[] {
  return PIPELINE_STAGES.map((key) => ({ key, label: STAGE_LABELS[key], status: "pending" }));
}

type PipelinePhase = "idle" | "uploading" | "streaming" | "completed" | "failed";

export function useScribeSession(sessionId: number | null) {
  const [stages, setStages] = useState<StageState[]>(initialStages);
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setStages(initialStages());
    setPhase("idle");
    setError(null);
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => reset, [reset]);

  const openStream = useCallback((sid: number) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      setError("Not authenticated");
      setPhase("failed");
      return;
    }
    sourceRef.current?.close();
    const es = new EventSource(api.sessions.streamUrl(sid, token));
    sourceRef.current = es;
    setPhase("streaming");

    es.onmessage = (e) => {
      handleEvent(JSON.parse(e.data) as PipelineEvent);
    };
    es.addEventListener("ping", () => {
      /* heartbeat — ignore */
    });

    // Listen for every typed event name (`<stage>:<status>`) that the backend sends.
    const stageNames: PipelineStageKey[] = [
      "transcribe",
      "soap",
      "icd_candidates",
      "icd_validated",
      "summary",
    ];
    const statuses: StageStatus[] = ["in_progress", "done"];
    stageNames.forEach((s) =>
      statuses.forEach((st) =>
        es.addEventListener(`${s}:${st}`, (e) => {
          handleEvent(JSON.parse((e as MessageEvent).data) as PipelineEvent);
        }),
      ),
    );
    ["started", "complete", "error"].forEach((st) =>
      es.addEventListener(`pipeline:${st}`, (e) => {
        handleEvent(JSON.parse((e as MessageEvent).data) as PipelineEvent);
      }),
    );

    es.onerror = () => {
      // Connection lost or 4xx. Don't flip to failed unless we never got a terminal event.
      es.close();
    };

    function handleEvent(ev: PipelineEvent) {
      if (ev.stage === "pipeline") {
        if (ev.status === "complete") {
          setPhase("completed");
          es.close();
        } else if (ev.status === "error") {
          setError((ev.meta?.message as string) ?? "Pipeline failed");
          setPhase("failed");
          es.close();
        }
        return;
      }
      setStages((prev) =>
        prev.map((s) => (s.key === ev.stage ? { ...s, status: ev.status } : s)),
      );
    }
  }, []);

  const start = useCallback(
    async (audio: Blob, filename: string) => {
      if (sessionId == null) return;
      reset();
      setPhase("uploading");
      try {
        await api.sessions.uploadAudio(sessionId, audio, filename);
        openStream(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPhase("failed");
      }
    },
    [sessionId, reset, openStream],
  );

  const retry = useCallback(
    async (audio: Blob, filename: string) => {
      if (sessionId == null) return;
      reset();
      setPhase("uploading");
      try {
        await api.sessions.retry(sessionId, audio, filename);
        openStream(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Retry failed");
        setPhase("failed");
      }
    },
    [sessionId, reset, openStream],
  );

  return { stages, phase, error, start, retry, reset };
}
