import { useApi } from '@/hooks/useApi';
import type { DashboardData } from '@/types/api';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { MetricCard, MetricCardSkeleton } from './MetricCard';
import { FunnelTable } from './FunnelTable';
import { StatusBadge } from './StatusBadge';

export function DashboardPanel() {
  const { data, loading, error } = useApi<DashboardData>('/api/dashboard');

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load dashboard: {error}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
      </div>
    );
  }

  const { pipeline, funnel, leads_needed, gap, connections } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-dgrey-120">
            {data.quarter} {data.year} — {pipeline.name}
          </h2>
          <p className="text-xs text-gray-400">
            Generated {new Date(data.generated_at).toLocaleTimeString()}
          </p>
        </div>
        <StatusBadge status={pipeline.status} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pipeline Value"
          value={formatCurrency(pipeline.value)}
          subtitle={`of ${formatCurrency(pipeline.target)} target`}
          status={pipeline.status}
        />
        <MetricCard
          label="% to Target"
          value={formatPercent(pipeline.pct_complete)}
          subtitle={gap.on_track ? 'On track' : `${formatCurrency(gap.gap)} gap`}
          status={pipeline.status}
        />
        <MetricCard
          label="Days Remaining"
          value={String(pipeline.days_remaining)}
          subtitle={`${formatCurrency(gap.required_daily_pace)}/day needed`}
        />
        <MetricCard
          label="Deals Needed"
          value={leads_needed.deals_needed.toLocaleString()}
          subtitle={`${leads_needed.contacts_needed.toLocaleString()} contacts`}
        />
      </div>

      {/* Funnel table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-dgrey-100">Funnel Breakdown</h3>
        <FunnelTable stages={funnel.stage_breakdown} />
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-4 rounded-lg border border-neutral-300 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Connections
        </span>
        <StatusBadge status={connections.activecampaign ? 'connected' : 'disconnected'} />
        <span className="text-xs text-gray-400">ActiveCampaign</span>
        <StatusBadge status={connections.google_ads ? 'connected' : 'disconnected'} />
        <span className="text-xs text-gray-400">Google Ads</span>
      </div>
    </div>
  );
}
