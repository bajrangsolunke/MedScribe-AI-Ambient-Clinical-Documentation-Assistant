import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  /** Number of bars to render. */
  bars?: number;
  className?: string;
}

/**
 * Live audio-level visualizer for a MediaStream.
 *
 * Uses the Web Audio API's AnalyserNode to read frequency-domain data
 * from the mic stream and draws a row of bars to a canvas at ~60fps.
 * The bars rise and fall with real volume, giving the recording UI
 * an "alive" feel during streaming.
 *
 * When `stream` is null the canvas renders nothing (no-op).
 */
export function Waveform({ stream, bars = 32, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!stream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // FFT must be a power of two and >= 32 in most browsers.
    const fftSize = Math.max(32, nextPow2(bars * 4));

    const AudioCtor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtor();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    const bins = analyser.frequencyBinCount;
    const buffer = new Uint8Array(bins);
    let raf = 0;

    const draw = () => {
      analyser.getByteFrequencyData(buffer);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const gap = 2;
      const barWidth = (width - gap * (bars - 1)) / bars;
      const binsPerBar = Math.max(1, Math.floor(bins / bars));

      for (let i = 0; i < bars; i++) {
        // Average a small slice of frequency bins per visible bar.
        let sum = 0;
        for (let k = 0; k < binsPerBar; k++) sum += buffer[i * binsPerBar + k] ?? 0;
        const avg = sum / binsPerBar / 255; // 0..1
        // Visual easing — let very quiet sound still show a wisp.
        const eased = Math.pow(avg, 0.7);
        const barHeight = Math.max(2, eased * height);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;
        // Sky-blue, fading to slate at the edges for a soft falloff.
        const edgeDist = Math.abs(i - bars / 2) / (bars / 2);
        const alpha = 1 - edgeDist * 0.4;
        ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
        roundRect(ctx, x, y, barWidth, barHeight, Math.min(barWidth / 2, 3));
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      void audioCtx.close().catch(() => undefined);
    };
  }, [stream, bars]);

  // Match the canvas's bitmap size to its CSS size for crisp bars on hi-DPI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx?.scale(dpr, dpr);
      // Re-set the logical size so draw() reads the scaled dimensions.
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}

function nextPow2(n: number): number {
  let p = 32;
  while (p < n) p *= 2;
  return p;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
