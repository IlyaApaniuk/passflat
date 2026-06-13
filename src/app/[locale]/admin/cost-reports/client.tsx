'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Trash2, ExternalLink, Loader2 } from 'lucide-react';

interface AdminReport {
  id: string;
  address: string;
  citySlug: string;
  slug: string;
  total: number | null;
  isVisible: boolean;
  verificationStatus: string;
  authorEmail: string | null;
  authorName: string | null;
  createdAt: string;
}

type Filter = 'all' | 'flagged' | 'hidden';

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

export function ModerationClient({ reports: initial }: { reports: AdminReport[] }) {
  const [reports, setReports] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    if (filter === 'flagged') return reports.filter((r) => r.verificationStatus === 'flagged');
    if (filter === 'hidden') return reports.filter((r) => !r.isVisible);
    return reports;
  }, [reports, filter]);

  const flaggedCount = reports.filter((r) => r.verificationStatus === 'flagged').length;
  const hiddenCount = reports.filter((r) => !r.isVisible).length;

  const toggleVisible = async (r: AdminReport) => {
    setPendingId(r.id);
    try {
      const res = await fetch(`/api/admin/cost-reports/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: !r.isVisible }),
      });
      if (!res.ok) throw new Error();
      setReports((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, isVisible: !r.isVisible } : x)),
      );
      toast.success(r.isVisible ? 'Hidden' : 'Restored');
    } catch {
      toast.error('Failed to update');
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (r: AdminReport) => {
    if (!window.confirm(`Delete this report permanently?\n\n${r.address}`)) return;
    setPendingId(r.id);
    try {
      const res = await fetch(`/api/admin/cost-reports/${r.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setReports((prev) => prev.filter((x) => x.id !== r.id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <main className="container mx-auto max-w-5xl px-4 py-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Cost report moderation</h1>
        <Link href="/admin/reports" className="text-sm text-primary hover:underline">
          → Abuse reports
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {reports.length} recent reports · {flaggedCount} flagged · {hiddenCount} hidden
      </p>

      <div className="mt-4 flex gap-2">
        <FilterButton
          value="all"
          label={`All (${reports.length})`}
          active={filter === 'all'}
          onSelect={setFilter}
        />
        <FilterButton
          value="flagged"
          label={`Flagged (${flaggedCount})`}
          active={filter === 'flagged'}
          onSelect={setFilter}
        />
        <FilterButton
          value="hidden"
          label={`Hidden (${hiddenCount})`}
          active={filter === 'hidden'}
          onSelect={setFilter}
        />
      </div>

      <div className="mt-4 space-y-2">
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No reports.</p>
        )}
        {visible.map((r) => (
          <div
            key={r.id}
            className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
              !r.isVisible ? 'border-border bg-muted/40 opacity-70' : 'border-border'
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.address}</span>
                {r.total != null && (
                  <span className="text-sm text-muted-foreground">≈ {r.total} zł</span>
                )}
                {r.verificationStatus === 'flagged' && (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-600">
                    flagged
                  </Badge>
                )}
                {!r.isVisible && (
                  <Badge variant="outline" className="text-muted-foreground">
                    hidden
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {r.authorEmail ?? r.authorName ?? 'unknown'} ·{' '}
                {new Date(r.createdAt).toLocaleString('en-GB')}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/${r.citySlug}/building/${r.slug}`} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pendingId === r.id}
                onClick={() => toggleVisible(r)}
              >
                {pendingId === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : r.isVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                <span className="ml-1.5">{r.isVisible ? 'Hide' : 'Restore'}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={pendingId === r.id}
                onClick={() => remove(r)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
