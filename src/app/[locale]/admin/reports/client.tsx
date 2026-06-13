'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, Check, X, Ban } from 'lucide-react';

export interface AdminReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: string;
  listing: { title: string; type: string; status: string; citySlug: string } | null;
}

type Filter = 'pending' | 'all';

function FilterButton({
  value,
  label,
  active,
  onSelect,
}: {
  value: Filter;
  label: string;
  active: boolean;
  onSelect: (v: Filter) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

export function ReportsClient({ reports: initial }: { reports: AdminReportRow[] }) {
  const [reports, setReports] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');

  const pendingCount = reports.filter((r) => r.status === 'pending').length;
  const visible = useMemo(
    () => (filter === 'pending' ? reports.filter((r) => r.status === 'pending') : reports),
    [reports, filter],
  );

  const resolve = async (
    r: AdminReportRow,
    status: 'reviewed' | 'dismissed',
    hideListing = false,
  ) => {
    if (
      hideListing &&
      !window.confirm(`Remove this listing from the site?\n\n${r.listing?.title ?? r.targetId}`)
    )
      return;
    setPendingId(r.id);
    try {
      const res = await fetch(`/api/admin/reports/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, hideListing }),
      });
      if (!res.ok) throw new Error();
      setReports((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                status,
                listing: hideListing && x.listing ? { ...x.listing, status: 'removed' } : x.listing,
              }
            : x,
        ),
      );
      toast.success(
        hideListing ? 'Listing removed' : status === 'reviewed' ? 'Marked reviewed' : 'Dismissed',
      );
    } catch {
      toast.error('Failed to update');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <main className="container mx-auto max-w-5xl px-4 py-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Abuse reports</h1>
        <Link href="/admin/cost-reports" className="text-sm text-primary hover:underline">
          → Cost report moderation
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {reports.length} recent · {pendingCount} pending
      </p>

      <div className="mt-4 flex gap-2">
        <FilterButton
          value="pending"
          label={`Pending (${pendingCount})`}
          active={filter === 'pending'}
          onSelect={setFilter}
        />
        <FilterButton
          value="all"
          label={`All (${reports.length})`}
          active={filter === 'all'}
          onSelect={setFilter}
        />
      </div>

      <div className="mt-4 space-y-2">
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No reports.</p>
        )}
        {visible.map((r) => {
          const busy = pendingId === r.id;
          const url = r.listing ? `/${r.listing.citySlug}/${r.listing.type}/${r.targetId}` : null;
          return (
            <div
              key={r.id}
              className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                r.status !== 'pending' ? 'border-border bg-muted/40 opacity-70' : 'border-border'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {r.listing?.title ?? `${r.targetType}:${r.targetId}`}
                  </span>
                  <Badge variant="outline" className="text-muted-foreground">
                    {r.reason}
                  </Badge>
                  {r.status !== 'pending' && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {r.status}
                    </Badge>
                  )}
                  {r.listing?.status === 'removed' && (
                    <Badge variant="outline" className="border-red-500/30 text-red-600">
                      listing removed
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  by {r.reporter} · {new Date(r.createdAt).toLocaleString('en-GB')}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {url && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={url} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                {r.status === 'pending' && (
                  <>
                    {r.listing && r.listing.status !== 'removed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => resolve(r, 'reviewed', true)}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                        <span className="ml-1.5">Remove</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => resolve(r, 'reviewed')}
                    >
                      <Check className="h-4 w-4" />
                      <span className="ml-1.5">Reviewed</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => resolve(r, 'dismissed')}
                    >
                      <X className="h-4 w-4" />
                      <span className="ml-1.5">Dismiss</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
