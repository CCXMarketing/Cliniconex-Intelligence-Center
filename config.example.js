// ── CIC Configuration Template ──────────────────────────────────
// Copy this file to js/config.js and fill in any local overrides.
// js/config.js is gitignored — never commit credentials to the repo.
//
// All API credentials live in Cloudflare Worker Secrets (see SECURITY.md).
// This file contains only non-sensitive configuration: URLs, IDs, thresholds.

export const CONFIG = {
  activecampaign: {
    // Base API URL (no trailing slash)
    api_url: "https://cliniconexmarketing.api-us1.com/api/3",
    // Cloudflare Worker proxy — handles auth via Worker Secrets
    proxy_url: "https://cic-ac-proxy.gerald-48c.workers.dev",
    // Pipeline IDs
    pipelines: {
      demand: 1,        // Prospect Demand Pipeline
      opportunity: 15,  // Prospect Opportunity Pipeline
      // Additional pipelines as needed
    }
  },
  google_ads: {
    // Public customer ID (not a secret)
    customer_id: "4135262293",
  },
  google_sheets: {
    sheet_id: ""
  },
  app: {
    // Avg LTV per converted lead — internal source, never AC
    avgLTV: 29000,
    ltv: 29000,
    fiscal_year_start: "jan",
    default_scenario: "target",
    // HIRO conversion target by scenario (suggested starting points)
    hiro_targets: {
      threshold: 25,
      target: 30,
      overachieve: 35
    }
  },
  workers: {
    // Cloudflare Worker base URL — all API calls route through here
    base_url: "https://cic-ac-proxy.gerald-48c.workers.dev",
    // Per-source paths
    paths: {
      ac: "/ac",
      google_ads: "/google-ads",
      gemini: "/gemini",
      salesforce: "/salesforce",
      jira: "/jira"
    }
  }
};
