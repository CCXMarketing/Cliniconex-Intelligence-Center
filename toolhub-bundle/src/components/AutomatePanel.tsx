import { useCallback, useState } from 'react';
import { useApi, apiPost } from '@/hooks/useApi';
import type { AutomateResult, RollbackResult, AutomationLogData } from '@/types/api';
import { StatusBadge } from './StatusBadge';

type ActionFilter = 'all' | 'PAUSE' | 'ADJUST_BID' | 'SCALE_BUDGET' | 'ADD_NEGATIVE_KEYWORDS';

export function AutomatePanel() {
  const [dryRun, setDryRun] = useState(true);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AutomateResult | null>(null);
  const [rollbackResult, setRollbackResult] = useState<RollbackResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);

  const { data: logData, loading: logLoading, refetch: refetchLog } = useApi<AutomationLogData>(
    '/api/automation-log?tail=20',
  );

  const handleRun = useCallback(async () => {
    if (!dryRun && !confirmLive) {
      setConfirmLive(true);
      return;
    }

    setRunning(true);
    setActionError(null);
    setResult(null);
    setConfirmLive(false);

    try {
      const res = await apiPost<AutomateResult>('/api/automate', {
        dry_run: dryRun,
        action: actionFilter,
      });
      setResult(res);
      refetchLog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }, [dryRun, actionFilter, confirmLive, refetchLog]);

  const handleRollback = useCallback(async () => {
    setRunning(true);
    setActionError(null);
    setRollbackResult(null);

    try {
      const res = await apiPost<RollbackResult>('/api/rollback', { dry_run: dryRun });
      setRollbackResult(res);
      refetchLog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }, [dryRun, refetchLog]);

  return (
    <div className="space-y-6">
      {/* Run Automation */}
      <div className="rounded-lg border border-neutral-300 bg-white p-5">
        <h3 className="text-sm font-semibold text-dgrey-100">Run Automation</h3>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* Dry Run toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => {
                setDryRun(e.target.checked);
                setConfirmLive(false);
              }}
              className="h-4 w-4 rounded border-gray-300 accent-brand-teal"
            />
            <span className={dryRun ? 'font-semibold text-brand-teal' : 'text-red-600 font-semibold'}>
              {dryRun ? 'Dry Run' : 'LIVE Execute'}
            </span>
          </label>

          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="all">All Actions</option>
            <option value="PAUSE">Pause</option>
            <option value="ADJUST_BID">Bid Adjust</option>
            <option value="SCALE_BUDGET">Budget</option>
            <option value="ADD_NEGATIVE_KEYWORDS">Keywords</option>
          </select>

          <button
            onClick={handleRun}
            disabled={running}
            className={`rounded px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition ${
              confirmLive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-brand-teal hover:bg-brand-teal/90'
            } disabled:opacity-50`}
          >
            {running ? 'Running...' : confirmLive ? 'Confirm Live Execute' : 'Run'}
          </button>
        </div>

        {!dryRun && !confirmLive && (
          <p className="mt-2 text-xs text-red-500">
            Live mode will execute changes against Google Ads. Use with caution.
          </p>
        )}

        {actionError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Results table */}
        {result && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span>
                {result.actions_executed.length} executed
              </span>
              <span>
                {result.actions_pending_approval.length} pending approval
              </span>
              <span className="font-semibold text-brand-green">
                Est. savings: {result.total_estimated_impact.savings}
              </span>
            </div>

            {result.message && (
              <p className="text-sm text-gray-500">{result.message}</p>
            )}

            {result.actions_executed.length > 0 && (
              <div className="overflow-x-auto rounded border border-neutral-300">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-300 bg-lgrey-100">
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-left">Campaign</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-right">Est. Savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.actions_executed.map((a, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-lgrey-100/50'}>
                        <td className="px-3 py-2 font-medium">{a.action}</td>
                        <td className="px-3 py-2">
                          {a.campaign_name ? (
                            (a as any).ac_url ? (
                              <a
                                href={(a as any).ac_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-dotted hover:decoration-solid"
                              >
                                {a.campaign_name}
                              </a>
                            ) : a.campaign_name
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusBadge status={a.status.includes('dry') ? 'monitor' : 'on_track'} />
                        </td>
                        <td className="px-3 py-2 text-right">{a.estimated_savings ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rollback */}
      <div className="rounded-lg border border-neutral-300 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-dgrey-100">Rollback</h3>
            <p className="text-xs text-gray-400">Undo the last executed action</p>
          </div>
          <button
            onClick={handleRollback}
            disabled={running}
            className="rounded bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
          >
            {running ? 'Processing...' : 'Rollback'}
          </button>
        </div>

        {rollbackResult && (
          <div className="mt-3 rounded border border-neutral-300 bg-lgrey-100 p-3 text-sm">
            <p>
              Status: <span className="font-semibold">{rollbackResult.status}</span>
            </p>
            {rollbackResult.action && <p>Action: {rollbackResult.action}</p>}
            {rollbackResult.campaign_name && <p>Campaign: {rollbackResult.campaign_name}</p>}
          </div>
        )}
      </div>

      {/* Execution Log */}
      <div className="rounded-lg border border-neutral-300 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-dgrey-100">Execution Log</h3>

        {logLoading ? (
          <div className="h-32 animate-pulse rounded bg-gray-200" />
        ) : !logData || logData.entries.length === 0 ? (
          <p className="text-sm text-gray-400">No log entries yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-300">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-300 bg-lgrey-100">
                  <th className="px-3 py-2 text-left">Timestamp</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {logData.entries.map((entry, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-lgrey-100/50'}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                      {entry.timestamp}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {entry.action || entry.message.slice(0, 40)}
                    </td>
                    <td className="px-3 py-2">{entry.campaign || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {entry.status ? <StatusBadge status={entry.status.toLowerCase()} /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
