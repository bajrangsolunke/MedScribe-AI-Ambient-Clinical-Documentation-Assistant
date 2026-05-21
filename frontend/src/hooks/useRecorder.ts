import { useCallback, useEffect, useRef, useState } from "react";

export type ChunkCallback = (blob: Blob, isFinal: boolean) => void;

interface RecorderState {
  isRecording: boolean;
  duration: number; // seconds since recording started
  error: string | null;
}

const initialState: RecorderState = {
  isRecording: false,
  duration: 0,
  error: null,
};

/**
 * Browser audio recorder with a stop-restart chunk loop.
 *
 * Every `chunkMs` milliseconds the underlying MediaRecorder is stopped
 * (which assembles a complete WebM blob) and immediately a new recorder
 * is started on the same MediaStream. The caller's `onChunk` callback
 * receives each blob. Calling `stop()` flushes the final chunk with
 * `isFinal=true`.
 *
 * There is a ~50–100 ms audio gap at each stop-restart boundary; the
 * transcript reads fine because Whisper is robust to mid-sentence cuts.
 */
export function useRecorder({ chunkMs = 4000 }: { chunkMs?: number } = {}) {
  const [state, setState] = useState<RecorderState>(initialState);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const partsRef = useRef<Blob[]>([]);
  const onChunkRef = useRef<ChunkCallback | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm;codecs=opus");
  const isFinalRef = useRef(false);
  const cycleTimerRef = useRef<number | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (cycleTimerRef.current !== null) {
      window.clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => () => {
    clearTimers();
    stopStream();
  }, [clearTimers, stopStream]);

  const beginRecorderRef = useRef<() => void>(() => undefined);
  const beginRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    partsRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) partsRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const isFinal = isFinalRef.current;
      const blob = new Blob(partsRef.current, { type: mimeTypeRef.current });
      partsRef.current = [];
      onChunkRef.current?.(blob, isFinal);
      if (isFinal) {
        clearTimers();
        stopStream();
        setState((s) => ({ ...s, isRecording: false }));
      } else {
        // not final — kick off the next recorder cycle on the same stream
        // (call through the ref to avoid the recursive-binding ESLint trap)
        beginRecorderRef.current();
      }
    };
    recorder.start();
    recorderRef.current = recorder;
  }, [clearTimers, stopStream]);
  useEffect(() => {
    beginRecorderRef.current = beginRecorder;
  }, [beginRecorder]);

  const start = useCallback(
    async (onChunk: ChunkCallback) => {
      onChunkRef.current = onChunk;
      isFinalRef.current = false;
      setState({ isRecording: true, duration: 0, error: null });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        mimeTypeRef.current = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        beginRecorder();

        startTsRef.current = Date.now();
        durationTimerRef.current = window.setInterval(() => {
          setState((s) => ({
            ...s,
            duration: Math.floor((Date.now() - startTsRef.current) / 1000),
          }));
        }, 250);

        cycleTimerRef.current = window.setInterval(() => {
          // Stop the current recorder; its onstop will fire onChunk and start the next one.
          if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
          }
        }, chunkMs);
      } catch (err) {
        clearTimers();
        stopStream();
        setState({
          isRecording: false,
          duration: 0,
          error: err instanceof Error ? err.message : "Microphone access denied",
        });
      }
    },
    [chunkMs, beginRecorder, clearTimers, stopStream],
  );

  const stop = useCallback(() => {
    // Stop the cycle timer immediately so no more intermediate stops fire,
    // then flag the current recorder as final so its onstop emits isFinal=true.
    if (cycleTimerRef.current !== null) {
      window.clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    isFinalRef.current = true;
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    } else {
      // Nothing actively recording (between cycles) — clean up directly.
      clearTimers();
      stopStream();
      setState((s) => ({ ...s, isRecording: false }));
    }
  }, [clearTimers, stopStream]);

  return { ...state, start, stop };
}
