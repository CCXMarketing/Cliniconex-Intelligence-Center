import type { StageBreakdown } from '@/types/api';

interface FunnelTableProps {
  stages: StageBreakdown[];
}

export function FunnelTable({ stages }: FunnelTableProps) {
  if (stages.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-300 bg-white p-6 text-center text-sm text-gray-400">
        No funnel data available
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 bg-lgrey-100">
            <th className="px-4 py-2.5 text-left font-semibold text-dgrey-100">Stage</th>
            <th className="px-4 py-2.5 text-right font-semibold text-dgrey-100">Count</th>
            <th className="px-4 py-2.5 text-right font-semibold text-dgrey-100">Conv. Rate</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage, i) => (
            <tr
              key={stage.stage}
              className={i % 2 === 0 ? 'bg-white' : 'bg-lgrey-100/50'}
            >
              <td className="px-4 py-2.5 font-medium text-dgrey-120">{stage.stage}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{stage.count.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                {stage.rate_from_previous != null
                  ? `${(stage.rate_from_previous * 100).toFixed(1)}%`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
