import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/services/api";
import type { SessionStatus } from "@/types";

function statusBadge(status: SessionStatus) {
  const map: Record<
    SessionStatus,
    { label: string; variant: "success" | "info" | "danger" | "neutral" | "warning" }
  > = {
    completed: { label: "Completed", variant: "success" },
    processing: { label: "Processing", variant: "info" },
    recording: { label: "Recording", variant: "warning" },
    created: { label: "Pending", variant: "neutral" },
    failed: { label: "Failed", variant: "danger" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions.list(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Sessions</h1>
        <Link to="/sessions/new">
          <Button>
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your visits</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">Could not load sessions.</p>}
          {data && data.length === 0 && (
            <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No sessions yet. Click <span className="font-medium">New session</span> to get started.
            </div>
          )}
          {data && data.length > 0 && (
            <div className="overflow-hidden rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Patient</th>
                    <th className="px-3 py-2 font-medium">Chief complaint</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Started</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{s.patient_label}</td>
                      <td className="px-3 py-2 text-slate-600">{s.chief_complaint ?? "—"}</td>
                      <td className="px-3 py-2">{statusBadge(s.status)}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {new Date(s.started_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/sessions/${s.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
