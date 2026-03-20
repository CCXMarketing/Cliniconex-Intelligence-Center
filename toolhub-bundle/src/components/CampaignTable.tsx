import { useApi } from '@/hooks/useApi';
import type { CampaignData } from '@/types/api';
import { formatCurrency } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

export function CampaignTable() {
  const { data, loading, error } = useApi<CampaignData>('/api/campaigns');

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load campaigns: {error}
      </div>
    );
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!data || !data.connected) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-semibold text-amber-800">Google Ads Not Connected</p>
        <p className="mt-1 text-xs text-amber-600">
          Connect Google Ads credentials to view campaign performance data.
        </p>
      </div>
    );
  }

  if (data.campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-300 bg-white p-6 text-center text-sm text-gray-400">
        No campaigns found for the current quarter.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-dgrey-120">Google Ads Campaigns</h2>

      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-lgrey-100">
              <th className="px-4 py-2.5 text-left font-semibold text-dgrey-100">Campaign</th>
              <th className="px-4 py-2.5 text-right font-semibold text-dgrey-100">Clicks</th>
              <th className="px-4 py-2.5 text-right font-semibold text-dgrey-100">Conv.</th>
              <th className="px-4 py-2.5 text-right font-semibold text-dgrey-100">Cost</th>
              <th className="px-4 py-2.5 text-right font-semibold text-dgrey-100">CPA</th>
              <th className="px-4 py-2.5 text-center font-semibold text-dgrey-100">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c, i) => (
              <tr
                key={c.id}
                className={i % 2 === 0 ? 'bg-white' : 'bg-lgrey-100/50'}
              >
                <td className="px-4 py-2.5 font-medium text-dgrey-120">
                  {(c as any).ac_url ? (
                    <a
                      href={(c as any).ac_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-dotted hover:decoration-solid"
                    >
                      {c.name}
                    </a>
                  ) : c.name}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.clicks.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.conversions.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(c.cost)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${cpaColor(c.cpa, c.cpa_status)}`}>
                  {c.conversions > 0 ? formatCurrency(c.cpa) : '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <StatusBadge status={c.cpa_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cpaColor(cpa: number, status: string): string {
  switch (status) {
    case 'excellent':
      return 'text-brand-green';
    case 'warning':
      return 'text-amber-600';
    case 'critical':
      return 'text-red-600';
    default:
      return 'text-gray-400';
  }
}
