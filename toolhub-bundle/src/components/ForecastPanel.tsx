import { useApi } from '@/hooks/useApi';
import type { ForecastData } from '@/types/api';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { MetricCard, MetricCardSkeleton } from './MetricCard';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

export function ForecastPanel() {
  const { data, loading, error } = useApi<ForecastData>('/api/forecast');

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load forecast: {error}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
      </div>
    );
  }

  const { attainment, monte_carlo, velocity } = data;

  // Build chart data for the Monte Carlo range
  const chartData = [
    { name: 'P10 (Low)', value: monte_carlo.p10, fill: '#F44336' },
    { name: 'P50 (Median)', value: monte_carlo.p50, fill: '#BF6A02' },
    { name: 'P90 (High)', value: monte_carlo.p90, fill: '#4CAF50' },
    { name: 'Target', value: attainment.target, fill: '#02475A' },
  ];

  // Velocity sparkline data
  const sparkData = velocity.wow_growth_rates.map((rate, i) => ({
    week: `W${i + 1}`,
    rate: +(rate * 100).toFixed(1),
  }));

  return (
    <div className="space-y-6">
      {/* Attainment score */}
      <div className="flex items-center gap-6 rounded-lg border border-neutral-300 bg-white p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Attainment Score
          </p>
          <p className="mt-1 text-5xl font-extrabold text-dgrey-120">
            {formatPercent(attainment.score)}
          </p>
        </div>
        <StatusBadge status={attainment.band} className="text-sm px-3 py-1" />
        <div className="ml-auto text-right text-sm text-gray-500">
          <p>{formatCurrency(attainment.current_value)} current</p>
          <p>{formatCurrency(attainment.target)} target</p>
        </div>
      </div>

      {/* Monte Carlo metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="P10 (Conservative)"
          value={formatCurrency(monte_carlo.p10)}
          subtitle="10th percentile"
        />
        <MetricCard
          label="P50 (Median)"
          value={formatCurrency(monte_carlo.p50)}
          subtitle="Most likely outcome"
          status={monte_carlo.p50 >= attainment.target ? 'on_track' : 'behind'}
        />
        <MetricCard
          label="P90 (Optimistic)"
          value={formatCurrency(monte_carlo.p90)}
          subtitle="90th percentile"
        />
      </div>

      {/* Probability */}
      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <p className="text-sm text-gray-500">
          Probability of hitting target:{' '}
          <span className="font-bold text-dgrey-120">
            {formatPercent(monte_carlo.attainment_probability * 100)}
          </span>{' '}
          <span className="text-xs text-gray-400">
            ({monte_carlo.simulations.toLocaleString()} simulations)
          </span>
        </p>
      </div>

      {/* Monte Carlo range chart */}
      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-dgrey-100">Forecast Range</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E1E6EF" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#404041' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#404041' }}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), 'Revenue']}
              contentStyle={{ fontSize: 12 }}
            />
            <Area type="monotone" dataKey="value" fill="#ADC837" fillOpacity={0.15} stroke="none" />
            <Line type="monotone" dataKey="value" stroke="#02475A" strokeWidth={2} dot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Velocity */}
      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-dgrey-100">Deal Velocity</h3>
            <p className="text-xs text-gray-400">Week-over-week growth trend</p>
          </div>
          <StatusBadge
            status={
              velocity.trend === 'accelerating'
                ? 'on_track'
                : velocity.trend === 'decelerating'
                  ? 'behind'
                  : 'monitor'
            }
          />
        </div>
        {sparkData.length > 0 ? (
          <ResponsiveContainer width="100%" height={80} className="mt-3">
            <ComposedChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#029FB5"
                strokeWidth={2}
                dot={false}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'WoW Growth']}
                contentStyle={{ fontSize: 11 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="mt-3 text-xs text-gray-400">Insufficient data for sparkline</p>
        )}
      </div>
    </div>
  );
}
