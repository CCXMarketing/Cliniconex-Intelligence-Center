import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  on_track: 'bg-brand-green/20 text-brand-green border-brand-green/40',
  monitor: 'bg-amber-100 text-amber-700 border-amber-300',
  behind: 'bg-red-100 text-red-700 border-red-300',
  at_risk: 'bg-red-100 text-red-700 border-red-300',
  connected: 'bg-brand-teal/10 text-brand-teal border-brand-teal/30',
  disconnected: 'bg-gray-100 text-gray-500 border-gray-300',
  excellent: 'bg-brand-green/20 text-brand-green border-brand-green/40',
  warning: 'bg-amber-100 text-amber-700 border-amber-300',
  critical: 'bg-red-100 text-red-700 border-red-300',
  none: 'bg-gray-100 text-gray-500 border-gray-300',
};

const statusLabels: Record<string, string> = {
  on_track: 'On Track',
  monitor: 'Monitor',
  behind: 'Behind',
  at_risk: 'At Risk',
  connected: 'Connected',
  disconnected: 'Disconnected',
  excellent: 'Excellent',
  warning: 'Warning',
  critical: 'Critical',
  none: 'N/A',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        statusStyles[key] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        className,
      )}
    >
      {statusLabels[key] ?? status}
    </span>
  );
}
