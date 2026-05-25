import { useMemo } from "react";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Hex / Tailwind colour for the stroke + area gradient. Defaults to sky-500. */
  stroke?: string;
}

/**
 * Tiny SVG sparkline — no recharts dependency, ~40 lines. Renders a
 * smoothed area-under-curve chart from a numeric array. Pads the path
 * with `padY` so the line never touches the edges, and a vertical
 * linear gradient softens the fill.
 *
 * Uses `<svg viewBox="0 0 w h" preserveAspectRatio="none">` so the
 * chart scales with its container while keeping line thickness crisp.
 */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  className,
  stroke = "#0ea5e9", // sky-500
}: Props) {
  const { line, area } = useMemo(() => {
    if (values.length === 0) {
      return { line: "", area: "" };
    }
    const padY = 3;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const points = values.map((v, i) => {
      const x = values.length === 1 ? width / 2 : i * step;
      const y = padY + (1 - (v - min) / range) * (height - padY * 2);
      return [x, y] as const;
    });
    const line = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");
    const area =
      line +
      ` L ${width.toFixed(2)} ${height.toFixed(2)}` +
      ` L 0 ${height.toFixed(2)} Z`;
    return { line, area };
  }, [values, width, height]);

  const gradId = useMemoGradId();

  if (values.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

let _gradCounter = 0;
function useMemoGradId(): string {
  return useMemo(() => `sparkline-grad-${++_gradCounter}`, []);
}
