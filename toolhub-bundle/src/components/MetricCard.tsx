import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  status?: 'on_track' | 'monitor' | 'behind' | null;
  className?: string;
}

const borderColor: Record<string, string> = {
  on_track: 'border-l-brand-green',
  monitor: 'border-l-amber-400',
  behind: 'border-l-red-500',
};

export function MetricCard({ label, value, subtitle, status, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-300 bg-white p-4 shadow-sm',
        status && `border-l-4 ${borderColor[status] ?? ''}`,
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-dgrey-120">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-neutral-300 bg-white p-4">
      <div className="h-3 w-20 rounded bg-gray-200" />
      <div className="mt-2 h-7 w-28 rounded bg-gray-200" />
      <div className="mt-1 h-3 w-16 rounded bg-gray-200" />
    </div>
  );
}
