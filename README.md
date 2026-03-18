# Cliniconex Revenue Intelligence Platform

**Multi-agent AI system for revenue forecasting, marketing attribution, and automated campaign optimization**

![Status](https://img.shields.io/badge/status-active%20development-blue)
![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License](https://img.shields.io/badge/license-proprietary-red)

---

## 🎯 **The Problem We're Solving**

**Executive Question:** *"How many leads do we need to hit our revenue target?"*

**Current State:** Marketing managers can't answer this confidently because they lack:
- Revenue target visibility across multiple streams
- Conversion rate data through the full funnel
- Real-time pace tracking
- Channel attribution clarity

**This Platform's Answer:** A multi-agent AI system that connects your data, does the math, tracks your pace, and optimizes your campaigns automatically.

---

## 🏗️ **Architecture: Multi-Agent Design**

```
┌─────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                             │
│                     (main.py)                                │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Data         │    │ Revenue      │    │ Strategic    │
│ Connector    │───▶│ Analyst      │───▶│ Advisor      │
│              │    │              │    │              │
│ • Google Ads │    │ • Conv rates │    │ • Campaign   │
│ • ActiveCamp │    │ • Revenue    │    │   analysis   │
│ • Caching    │    │   math       │    │ • Recommends │
└──────────────┘    │ • Attribution│    │ • Alerts     │
                    └──────────────┘    └──────────────┘
                            │                     │
                            └─────────┬───────────┘
                                      ▼
                            ┌──────────────┐
                            │ Dashboard    │
                            │ Builder      │
                            │              │
                            │ • CLI view   │
                            │ • Web UI     │
                            │ • Reports    │
                            └──────────────┘
```

---

## 🚀 **Quick Start**

### **Installation**

```bash
# Clone
git clone https://github.com/your-org/revenue-intelligence.git
cd revenue-intelligence

# Install
pip install -r requirements.txt

# Configure
cp config/credentials.yaml.example config/credentials.yaml
# Edit credentials.yaml with your API keys

# Run
python main.py dashboard
```

---

## 📊 **What You'll Get**

### **The Dashboard Answer**
```
🎯 Q2 TARGET: $2,250,000
   Current: $340,000 (15%)
   Status: 🔴 BEHIND PACE

📊 LEADS NEEDED: 
   → 1,592 more closed deals
   → 4,549 demos required
   → 18,196 total contacts (leads)
   
   Current pace: 380 leads/month
   Required: 605 leads/month
   Daily rate needed: 19.8 leads/day
```

### **Channel Attribution**
```
💰 YOUR CONTRIBUTION (Marketing):
   Google Ads:  127 leads → $21,600 revenue
   Organic:      89 leads → $14,400 revenue  
   Referral:     29 leads →  $4,800 revenue
```

### **Automated Recommendations**
```
🔴 IMMEDIATE ACTION:
   • Pause ACS US Medical ($1,705 spend, 0 conv)
   • Pause Partners ($682 spend, 0 conv)

🟡 OPTIMIZE:
   • Lower CPA target 15% on Senior Care
   • Add 23 negative keywords

🟢 TEST:
   • Value-Based Bidding ($1,000 LTV)
   • Offline conversion tracking
```

---

## 📁 **Project Structure**

```
revenue-intelligence/
├── agents/
│   ├── data_connector/       # API integrations
│   ├── revenue_analyst/      # Math & metrics
│   ├── strategic_advisor/    # Recommendations
│   └── dashboard/            # Visualization
├── config/
│   ├── credentials.yaml      # API keys (gitignored)
│   └── thresholds.yaml       # CPA limits, targets
├── main.py                   # Orchestrator
└── tests/                    # Unit tests
```

---

## 🤖 **Agent Capabilities**

### **1. Data Connector**
- Fetches from Google Ads & ActiveCampaign APIs
- Caches responses to avoid rate limits
- Handles authentication automatically

### **2. Revenue Analyst**
- Calculates conversion rates at each funnel stage
- Reverse math: works backwards from revenue target
- Channel attribution (which sources drive revenue)

### **3. Strategic Advisor**
- Analyzes campaign performance vs thresholds
- Generates prioritized recommendations (🔴🟡🟢)
- Alerts when metrics exceed limits

### **4. Dashboard Builder**
- CLI interface for terminal users
- Web dashboard for interactive exploration
- Export to CSV/PDF for reports

---

## 🔧 **Configuration**

### **credentials.yaml**
```yaml
google_ads:
  developer_token: "YOUR_TOKEN"
  client_id: "YOUR_CLIENT_ID"
  client_secret: "YOUR_SECRET"
  refresh_token: "YOUR_REFRESH_TOKEN"
  customer_id: "4135262293"

activecampaign:
  api_url: "https://yourcompany.api-us1.com"
  api_key: "YOUR_API_KEY"
```

### **thresholds.yaml**
```yaml
revenue:
  annual_target: 9000000

cpa:
  excellent: 75
  warning: 200
  critical: 300

conversion_rates:
  contact_to_demo: 0.25
  demo_to_deal: 0.35
  deal_to_won: 0.15
```

---

## 📈 **Development Roadmap**

### **Phase 1: Foundation** (Week 1)
- [ ] Data Connector Agent
- [ ] Revenue Analyst Agent
- [ ] CLI Dashboard

### **Phase 2: Intelligence** (Week 2)
- [ ] Strategic Advisor Agent
- [ ] Alert System
- [ ] Web Dashboard

### **Phase 3: Automation** (Week 3)
- [ ] Automation Engine
- [ ] Auto-pause campaigns
- [ ] Auto-adjust bids

### **Phase 4: Advanced** (Week 4)
- [ ] Predictive forecasting
- [ ] Slack/email notifications
- [ ] Scheduled reports

---

## 🤝 **Contributing**

Internal Cliniconex project. Contact: Ger (Director of Marketing)

---

## 📄 **License**

Proprietary - Cliniconex Internal Use Only

---

**Last Updated:** March 18, 2026  
**Version:** 0.1.0 (Active Development)
