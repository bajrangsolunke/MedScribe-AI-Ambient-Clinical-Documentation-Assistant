import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Hash,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User as UserIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownItem, DropdownMenu } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  avatarColor,
  computeStats,
  formatDuration,
  formatTranscriptLen,
  groupByTime,
  patientInitials,
  relativeTime,
  statusCanRetry,
} from "@/lib/sessions";
import { api } from "@/services/api";
import type { SessionStatus, SessionSummary } from "@/types";

type StatusFilter = "all" | SessionStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "recording", label: "Recording" },
  { key: "failed", label: "Failed" },
];

function statusBadge(status: SessionStatus) {
  const map: Record<
    SessionStatus,
    { label: string; variant: "success" | "info" | "danger" | "neutral" | "warning"; icon?: typeof CheckCircle2 }
  > = {
    completed: { label: "Completed", variant: "success", icon: CheckCircle2 },
    processing: { label: "Processing", variant: "info", icon: Loader2 },
    recording: { label: "Recording", variant: "warning", icon: Activity },
    created: { label: "Pending", variant: "neutral" },
    failed: { label: "Failed", variant: "danger", icon: AlertTriangle },
  };
  const { label, variant, icon: Icon } = map[status];
  return (
    <Badge variant={variant} className="gap-1">
      {Icon && (
        <Icon className={cn("h-3 w-3", status === "processing" && "animate-spin")} />
      )}
      {label}
    </Badge>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions.list(),
    refetchOnWindowFocus: true,
    refetchInterval: 10_000, // refresh so "Recording" sessions tick into "Completed" in near-real-time
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.sessions.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => api.sessions.retryFinalize(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const sessions: SessionSummary[] = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );
  const stats = useMemo(() => computeStats(sessions), [sessions]);

  const filtered = useMemo(() => {
    let out = sessions;
    if (filter !== "all") out = out.filter((s) => s.status === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (s) =>
          s.patient_label.toLowerCase().includes(q) ||
          (s.chief_complaint ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [sessions, filter, query]);

  const grouped = useMemo(() => groupByTime(filtered), [filtered]);

  function handleDelete(s: SessionSummary) {
    if (window.confirm(`Delete session "${s.patient_label}"? This cannot be undone.`)) {
      deleteMutation.mutate(s.id);
    }
  }

  function handleRetry(s: SessionSummary) {
    retryMutation.mutate(s.id);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Your clinical sessions, transcripts, and notes.
          </p>
        </div>
        <Link to="/sessions/new">
          <Button>
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total sessions"
          value={stats.total}
          icon={<Stethoscope className="h-5 w-5 text-slate-500" />}
          accent="bg-slate-50"
        />
        <StatCard
          label="This week"
          value={stats.thisWeek}
          icon={<Activity className="h-5 w-5 text-sky-600" />}
          accent="bg-sky-50"
        />
        <StatCard
          label="Completion rate"
          value={
            stats.completed + stats.failed === 0
              ? "—"
              : `${Math.round(stats.completionRate * 100)}%`
          }
          sub={`${stats.completed} completed`}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          accent="bg-emerald-50"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          accent="bg-red-50"
        />
      </div>

      {/* Sessions card */}
      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient label or chief complaint…"
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    filter === f.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content states */}
          {sessionsQuery.isLoading ? (
            <LoadingSkeleton />
          ) : sessionsQuery.error ? (
            <p className="px-2 py-6 text-sm text-red-600">Could not load sessions.</p>
          ) : sessions.length === 0 ? (
            <EmptyState onNew={() => navigate("/sessions/new")} />
          ) : filtered.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No sessions match your search or filter.
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((group) => (
                <div key={group.bucket}>
                  <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group.bucket}
                    <span className="text-slate-300">·</span>
                    <span className="font-normal lowercase tracking-normal text-slate-400">
                      {group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                    <ul className="divide-y divide-slate-100">
                      {group.sessions.map((s) => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          onOpen={() => navigate(`/sessions/${s.id}`)}
                          onDelete={() => handleDelete(s)}
                          onRetry={() => handleRetry(s)}
                          isDeleting={deleteMutation.variables === s.id && deleteMutation.isPending}
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-md", accent)}>
          {icon}
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

interface SessionRowProps {
  session: SessionSummary;
  onOpen: () => void;
  onDelete: () => void;
  onRetry: () => void;
  isDeleting: boolean;
}

function SessionRow({ session, onOpen, onDelete, onRetry, isDeleting }: SessionRowProps) {
  const meta = buildSessionMeta(session);
  return (
    <li
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none",
        isDeleting && "opacity-50",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          avatarColor(session.patient_label),
        )}
        aria-hidden
      >
        {patientInitials(session.patient_label)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
          {session.patient_label}
          {session.status === "recording" && (
            <span
              aria-label="Live"
              className="h-2 w-2 animate-pulse rounded-full bg-rose-500"
            />
          )}
        </div>
        <div className="flex items-center gap-2 truncate text-xs text-slate-500">
          <span className="truncate">
            {session.chief_complaint || "No chief complaint"}
          </span>
          {session.patient_id ? (
            <Link
              to={`/patients/${session.patient_id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
              title="Open patient"
            >
              <UserIcon className="h-3 w-3" />
              {session.patient_label}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Walk-in
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {meta.map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1">
                {m.icon}
                {m.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="hidden md:block">{statusBadge(session.status)}</div>
      <div
        className="hidden text-right text-xs text-slate-500 sm:block"
        title={new Date(session.started_at).toLocaleString()}
      >
        {relativeTime(session.started_at)}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu trigger={<MoreVertical className="h-4 w-4" />}>
          <DropdownItem onSelect={onOpen}>Open</DropdownItem>
          {statusCanRetry(session.status) && (
            <DropdownItem
              onSelect={onRetry}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Retry finalize
            </DropdownItem>
          )}
          <DropdownItem
            onSelect={onDelete}
            variant="danger"
            icon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Delete
          </DropdownItem>
        </DropdownMenu>
      </div>
    </li>
  );
}

interface SessionMetaChip {
  label: string;
  icon: React.ReactNode;
}

function buildSessionMeta(session: SessionSummary): SessionMetaChip[] {
  const chips: SessionMetaChip[] = [];
  const duration = formatDuration(session.duration_sec);
  if (duration) {
    chips.push({
      label: duration,
      icon: <Clock className="h-3 w-3" />,
    });
  }
  if (session.transcript_chars > 0) {
    chips.push({
      label: formatTranscriptLen(session.transcript_chars),
      icon: <FileText className="h-3 w-3" />,
    });
  }
  if (session.has_soap) {
    chips.push({
      label: "SOAP",
      icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
    });
  }
  if (session.icd_count > 0) {
    chips.push({
      label: `${session.icd_count} ICD${session.icd_count === 1 ? "" : "s"}`,
      icon: <Hash className="h-3 w-3" />,
    });
  }
  return chips;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-slate-100 bg-white px-4 py-3"
        >
          <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/40 p-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sky-600">
        <Stethoscope className="h-7 w-7" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">No sessions yet</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Start your first ambient documentation session. The transcript will appear live
          as you speak, then a SOAP note will generate when you stop.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="h-4 w-4" />
        New session
      </Button>
    </div>
  );
}
