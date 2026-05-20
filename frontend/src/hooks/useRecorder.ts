import { useEffect, useRef, useState } from "react";

interface RecorderState {
  isRecording: boolean;
  duration: number; // seconds
  audioBlob: Blob | null;
  error: string | null;
}

const initialState: RecorderState = {
  isRecording: false,
  duration: 0,
  audioBlob: null,
  error: null,
};

export function useRecorder() {
  const [state, setState] = useState<RecorderState>(initialState);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      cleanupStream();
    };
  }, []);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanupStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }

  async function start() {
    setState({ ...initialState, isRecording: true });
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        cleanupStream();
        stopTimer();
        setState((s) => ({ ...s, isRecording: false, audioBlob: blob }));
      };
      recorder.start();
      recorderRef.current = recorder;
      const startTs = Date.now();
      timerRef.current = window.setInterval(() => {
        setState((s) => ({ ...s, duration: Math.floor((Date.now() - startTs) / 1000) }));
      }, 250);
    } catch (err) {
      cleanupStream();
      stopTimer();
      setState({
        ...initialState,
        error: err instanceof Error ? err.message : "Microphone access denied",
      });
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  function reset() {
    stopTimer();
    cleanupStream();
    chunksRef.current = [];
    setState(initialState);
  }

  return { ...state, start, stop, reset };
}
