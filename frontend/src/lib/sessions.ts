import type { SessionStatus, SessionSummary } from "@/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionStats {
  total: number;
  thisWeek: number;
  completed: number;
  completionRate: number; // 0..1
  failed: number;
  recording: number;
}

export function computeStats(sessions: SessionSummary[]): SessionStats {
  const now = Date.now();
  const weekAgo = now - 7 * ONE_DAY_MS;
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const failed = sessions.filter((s) => s.status === "failed").length;
  const recording = sessions.filter(
    (s) => s.status === "recording" || s.status === "processing",
  ).length;
  const thisWeek = sessions.filter(
    (s) => new Date(s.started_at).getTime() >= weekAgo,
  ).length;
  const finished = completed + failed;
  const completionRate = finished === 0 ? 0 : completed / finished;
  return { total, thisWeek, completed, completionRate, failed, recording };
}

export type TimeBucket = "Today" | "Yesterday" | "This week" | "Earlier";

export interface GroupedSessions {
  bucket: TimeBucket;
  sessions: SessionSummary[];
}

const BUCKET_ORDER: TimeBucket[] = ["Today", "Yesterday", "This week", "Earlier"];

export function groupByTime(sessions: SessionSummary[]): GroupedSessions[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - ONE_DAY_MS;
  const weekStart = todayStart - 6 * ONE_DAY_MS; // start of "this week" bucket

  const buckets: Record<TimeBucket, SessionSummary[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  for (const s of sessions) {
    const t = new Date(s.started_at).getTime();
    if (t >= todayStart) buckets.Today.push(s);
    else if (t >= yesterdayStart) buckets.Yesterday.push(s);
    else if (t >= weekStart) buckets["This week"].push(s);
    else buckets.Earlier.push(s);
  }

  return BUCKET_ORDER.filter((b) => buckets[b].length > 0).map((b) => ({
    bucket: b,
    sessions: buckets[b],
  }));
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function patientInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

export function avatarColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function statusCanRetry(status: SessionStatus): boolean {
  return status === "failed";
}

export function formatDuration(sec: number | null): string | null {
  if (sec == null || sec < 0) return null;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatTranscriptLen(chars: number): string {
  if (chars === 0) return "no transcript";
  // Rough proxy: ~5 chars per word for English
  const words = Math.round(chars / 5);
  if (words < 1000) return `${words} words`;
  return `${(words / 1000).toFixed(1)}k words`;
}

export function confidenceTone(c: number): {
  label: string;
  className: string;
} {
  if (c >= 0.8) return { label: "high", className: "bg-emerald-100 text-emerald-700" };
  if (c >= 0.6) return { label: "medium", className: "bg-amber-100 text-amber-700" };
  return { label: "low", className: "bg-rose-100 text-rose-700" };
}

/**
 * Returns a length-N array where entry i is the count of sessions whose
 * `started_at` falls on the day that's (N-1-i) days before today. So index
 * 0 is the oldest day in the window; the last entry is today.
 *
 * Used to drive the dashboard sparkline.
 */
export function dailyVisitCounts(sessions: SessionSummary[], days: number): number[] {
  const counts = new Array(days).fill(0) as number[];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  for (const s of sessions) {
    const t = new Date(s.started_at);
    t.setHours(0, 0, 0, 0);
    const dayDelta = Math.round((todayMs - t.getTime()) / ONE_DAY_MS);
    if (dayDelta >= 0 && dayDelta < days) {
      counts[days - 1 - dayDelta]++;
    }
  }
  return counts;
}
