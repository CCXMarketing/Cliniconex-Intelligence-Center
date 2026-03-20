import { useEffect, useState } from 'react';
import { DashboardPanel } from '@/components/DashboardPanel';
import { ForecastPanel } from '@/components/ForecastPanel';
import { CampaignTable } from '@/components/CampaignTable';
import { AutomatePanel } from '@/components/AutomatePanel';
import { cn } from '@/lib/utils';

type Tab = 'activecampaign' | 'googleads';

const STORAGE_KEY = 'mic_active_tab';

const tabs: { id: Tab; label: string }[] = [
  { id: 'activecampaign', label: 'ActiveCampaign Metrics' },
  { id: 'googleads', label: 'Google Ads Metrics' },
];

export default function MarketingIntelligence() {
  const [active, setActive] = useState<Tab>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'googleads' ? 'googleads' : 'activecampaign';
  });

  // Track whether Google Ads tab has ever been opened (lazy load)
  const [gadsVisited, setGadsVisited] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, active);
    if (active === 'googleads' && !gadsVisited) {
      setGadsVisited(true);
    }
  }, [active, gadsVisited]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 font-sans">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-dgrey-120">Marketing Intelligence</h1>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-lg border border-neutral-300 bg-white p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-semibold transition',
              active === tab.id
                ? 'bg-brand-green text-white shadow-sm'
                : 'text-dgrey-100 hover:bg-lgrey-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: ActiveCampaign Metrics */}
      {active === 'activecampaign' && (
        <div className="space-y-6">
          <DashboardPanel />
          <ForecastPanel />
          <AutomatePanel />
        </div>
      )}

      {/* Tab 2: Google Ads Metrics — only mount after first visit */}
      {active === 'googleads' && gadsVisited && <CampaignTable />}
    </div>
  );
}
