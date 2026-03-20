// ── Dashboard ────────────────────────────────────────────────────────────

export interface PipelineInfo {
  name: string;
  id: number | null;
  value: number;
  target: number;
  pct_complete: number;
  status: 'on_track' | 'monitor' | 'behind';
  days_remaining: number;
}

export interface StageBreakdown {
  stage: string;
  count: number;
  rate_from_previous?: number;
}

export interface FunnelInfo {
  stage_breakdown: StageBreakdown[];
  conversion_rates: Record<string, number>;
  total_contacts: number;
  hiros: number;
}

export interface LeadsNeeded {
  contacts_needed: number;
  deals_needed: number;
  mql_needed: number;
  engaged_needed: number;
}

export interface GapInfo {
  gap: number;
  required_daily_pace: number;
  on_track: boolean;
  status: string;
}

export interface Connections {
  activecampaign: boolean;
  google_ads: boolean;
}

export interface DashboardData {
  quarter: string;
  year: number;
  pipeline: PipelineInfo;
  funnel: FunnelInfo;
  leads_needed: LeadsNeeded;
  gap: GapInfo;
  connections: Connections;
  generated_at: string;
}

// ── Forecast ─────────────────────────────────────────────────────────────

export interface AttainmentInfo {
  score: number;
  band: 'on_track' | 'monitor' | 'behind';
  label: string;
  current_value: number;
  target: number;
}

export interface MonteCarloInfo {
  p10: number;
  p50: number;
  p90: number;
  attainment_probability: number;
  simulations: number;
}

export interface VelocityInfo {
  trend: string;
  wow_growth_rates: number[];
}

export interface ForecastData {
  quarter: string;
  year: number;
  attainment: AttainmentInfo;
  monte_carlo: MonteCarloInfo;
  velocity: VelocityInfo;
  generated_at: string;
}

// ── Campaigns ────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  cpa: number;
  ctr: number;
  conversion_rate: number;
  cpa_status: 'excellent' | 'warning' | 'critical' | 'none';
}

export interface CampaignData {
  campaigns: Campaign[];
  metrics: Record<string, number>;
  connected: boolean;
}

// ── Automate ─────────────────────────────────────────────────────────────

export interface ActionResult {
  action: string;
  campaign_id?: string;
  campaign_name?: string;
  status: string;
  dry_run: boolean;
  estimated_savings?: string;
  details?: Record<string, unknown>;
}

export interface AutomateResult {
  dry_run: boolean;
  actions_executed: ActionResult[];
  actions_pending_approval: ActionResult[];
  total_estimated_impact: {
    savings: string;
    reallocated: string;
  };
  message?: string;
}

export interface RollbackResult {
  status: string;
  action?: string;
  campaign_name?: string;
  dry_run?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  action: string;
  campaign: string;
  status: string;
}

export interface AutomationLogData {
  entries: LogEntry[];
  total: number;
}

// ── Errors ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  status: number;
}
