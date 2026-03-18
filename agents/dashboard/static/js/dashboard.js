/* ═══════════════════════════════════════════════════════════════════════════
   Cliniconex Marketing Intelligence Center — Dashboard Interactivity
   ═══════════════════════════════════════════════════════════════════════════ */

const MICDashboard = (() => {
    'use strict';

    // ── State ───────────────────────────────────────────────────────────
    let state = {
        campaigns: [],
        trendData: [],
        trendRange: 30,
        sortColumn: 'cost',
        sortDirection: 'desc',
        refreshTimer: null,
        isRefreshing: false,
    };

    // ── Init ────────────────────────────────────────────────────────────
    const init = () => {
        initTheme();
        initIcons();
        bindEvents();
        loadAllData();
        startAutoRefresh();
    };

    // ── Theme ───────────────────────────────────────────────────────────
    const initTheme = () => {
        const saved = localStorage.getItem('mic-theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
    };

    const toggleTheme = () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('mic-theme', next);

        // Rebuild charts with new theme colors
        if (state.trendData.length) renderTrendCharts(state.trendData);
        showToast(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode');
    };

    // ── Icons ───────────────────────────────────────────────────────────
    const initIcons = () => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // ── Events ──────────────────────────────────────────────────────────
    const bindEvents = () => {
        // Theme toggle
        document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);

        // Refresh
        document.getElementById('btnRefresh')?.addEventListener('click', refreshAll);

        // Export CSV
        document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);

        // Keyboard shortcuts modal
        document.getElementById('btnKeyboardHelp')?.addEventListener('click', () => toggleModal(true));
        document.getElementById('closeShortcuts')?.addEventListener('click', () => toggleModal(false));
        document.getElementById('shortcutsModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'shortcutsModal') toggleModal(false);
        });

        // Campaign search & filters
        const debounced = debounce(filterCampaigns, 200);
        document.getElementById('campaignSearch')?.addEventListener('input', debounced);
        document.getElementById('campaignFilter')?.addEventListener('change', filterCampaigns);
        document.getElementById('cpaFilter')?.addEventListener('change', filterCampaigns);

        // Table sorting
        document.querySelectorAll('.data-table th.sortable').forEach(th => {
            th.addEventListener('click', () => sortTable(th.dataset.sort));
        });

        // Close campaign detail
        document.getElementById('closeDetail')?.addEventListener('click', closeCampaignDetail);

        // Trend range buttons
        document.querySelectorAll('.btn-pill[data-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-pill[data-range]').forEach(b => b.classList.remove('btn-pill--active'));
                btn.classList.add('btn-pill--active');
                state.trendRange = parseInt(btn.dataset.range);
                if (state.trendData.length) renderTrendCharts(state.trendData);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);
    };

    const handleKeyboard = (e) => {
        // Don't trigger when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.key === 'Escape') e.target.blur();
            return;
        }

        switch (e.key) {
            case '?':
                e.preventDefault();
                toggleModal(true);
                break;
            case 't':
            case 'T':
                e.preventDefault();
                toggleTheme();
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                refreshAll();
                break;
            case 'e':
            case 'E':
                e.preventDefault();
                exportCSV();
                break;
            case '/':
                e.preventDefault();
                document.getElementById('campaignSearch')?.focus();
                break;
            case 'Escape':
                toggleModal(false);
                closeCampaignDetail();
                break;
            case '1': scrollToSection('sectionMetrics'); break;
            case '2': scrollToSection('sectionFunnel'); break;
            case '3': scrollToSection('sectionCampaigns'); break;
            case '4': scrollToSection('sectionTrends'); break;
            case '5': scrollToSection('sectionAlerts'); break;
        }
    };

    // ── Data Loading ────────────────────────────────────────────────────
    const loadAllData = async () => {
        await Promise.all([
            loadMetrics(),
            loadFunnel(),
            loadCampaigns(),
            loadTrends(),
            loadAlerts(),
        ]);
        updateTimestamp();
    };

    const refreshAll = async () => {
        if (state.isRefreshing) return;
        state.isRefreshing = true;

        const btn = document.getElementById('btnRefresh');
        btn?.classList.add('refreshing');

        await loadAllData();

        btn?.classList.remove('refreshing');
        state.isRefreshing = false;
        showToast('Data refreshed');
    };

    const startAutoRefresh = () => {
        state.refreshTimer = setInterval(loadAllData, 30000);
    };

    // ── API Helpers ─────────────────────────────────────────────────────
    const fetchAPI = async (endpoint) => {
        try {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`API error (${endpoint}):`, err);
            return null;
        }
    };

    // ── Hero Metrics ────────────────────────────────────────────────────
    const loadMetrics = async () => {
        const data = await fetchAPI('/api/metrics');
        if (!data) return;

        // Quarter label
        setText('metricQuarter', data.quarter);

        // Animated counters
        animateCounter('metricTarget', data.revenue_target, { prefix: '', decimals: 0, separator: true });
        animateCounter('metricPipeline', data.pipeline_value, { prefix: '', decimals: 0, separator: true });
        animateCounter('metricLeads', data.leads_needed, { decimals: 0, separator: true });
        animateCounter('metricDays', data.days_remaining, { decimals: 0 });

        // Revenue progress
        const progressBar = document.getElementById('revenueProgressBar');
        const progressLabel = document.getElementById('revenueProgressLabel');
        if (progressBar) {
            setTimeout(() => {
                progressBar.style.width = Math.min(data.pct_complete, 100) + '%';
            }, 100);
        }
        if (progressLabel) progressLabel.textContent = data.pct_complete.toFixed(1) + '% complete';

        // Status badge
        const badge = document.getElementById('statusBadge');
        const label = document.getElementById('statusLabel');
        if (badge) {
            badge.className = 'status-badge ' + data.status;
        }
        if (label) {
            const labels = { on_track: 'On Track', monitor: 'Monitor', behind: 'Behind Pace' };
            label.textContent = labels[data.status] || data.status;
        }

        // Daily pace
        const paceEl = document.getElementById('dailyPaceLabel');
        if (paceEl && data.leads_needed && data.days_remaining) {
            const daily = Math.ceil(data.leads_needed / data.days_remaining);
            paceEl.textContent = daily.toLocaleString() + ' leads/day required';
        }

        // Countdown bar
        const countdownBar = document.getElementById('countdownBar');
        const countdownNum = document.getElementById('metricDays');
        if (countdownBar) {
            const pct = Math.max((data.days_remaining / 90) * 100, 0);
            setTimeout(() => {
                countdownBar.style.width = pct + '%';
            }, 100);
            if (data.days_remaining <= 15) {
                countdownBar.className = 'countdown-bar urgent';
                countdownNum?.classList.add('urgent');
            } else if (data.days_remaining <= 40) {
                countdownBar.className = 'countdown-bar moderate';
                countdownNum?.classList.add('moderate');
            } else {
                countdownBar.className = 'countdown-bar comfortable';
                countdownNum?.classList.add('comfortable');
            }
        }

        // Connection status
        const dot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const anyConnected = data.connections?.activecampaign || data.connections?.google_ads;
        if (dot) {
            dot.className = 'status-dot ' + (anyConnected ? 'connected' : 'disconnected');
        }
        if (statusText) {
            statusText.textContent = anyConnected ? 'Live Data' : 'Demo Mode';
        }
    };

    // ── Animated Counter ────────────────────────────────────────────────
    const animateCounter = (elementId, target, options = {}) => {
        const el = document.getElementById(elementId);
        if (!el) return;

        const { decimals = 0, separator = false, duration = 1200 } = options;
        const start = parseFloat(el.textContent.replace(/[^0-9.-]/g, '')) || 0;
        const startTime = performance.now();

        const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = start + (target - start) * ease;

            let display = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toString();
            if (separator) {
                display = Number(display).toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                });
            }
            el.textContent = display;

            if (progress < 1) requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
    };

    // ── Funnel ──────────────────────────────────────────────────────────
    const loadFunnel = async () => {
        const data = await fetchAPI('/api/funnel');
        if (!data) return;

        renderFunnel(data);
        renderFunnelStats(data);

        const badge = document.getElementById('funnelDataBadge');
        if (badge) {
            badge.className = 'badge ' + (data.live_data ? 'badge--live' : 'badge--info');
            badge.textContent = data.live_data ? 'Live' : 'Demo';
        }
    };

    const renderFunnel = (data) => {
        const container = document.getElementById('funnelVisual');
        if (!container || !data.stages?.length) return;

        const maxCount = Math.max(...data.stages.map(s => s.count), 1);

        let html = '';
        data.stages.forEach((stage, i) => {
            const pct = (stage.count / maxCount) * 100;
            const rate = stage.rate_from_previous;
            const rateStr = rate !== null && rate !== undefined ? (rate * 100).toFixed(1) + '%' : '—';

            html += `
                <div class="funnel-stage" style="animation-delay: ${i * 0.1}s">
                    <div class="funnel-bar-wrapper">
                        <div class="funnel-label">${stage.stage}</div>
                        <div class="funnel-bar-track">
                            <div class="funnel-bar-fill" style="width: 0%" data-width="${pct}%">
                                <div class="funnel-bar-text">
                                    <span class="count">${stage.count.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div class="funnel-metrics">
                            <div class="funnel-rate">${rateStr}</div>
                            <div class="funnel-rate-label">${i === 0 ? 'Total' : 'conv. rate'}</div>
                        </div>
                    </div>
                </div>
            `;

            // Add connector arrow between stages
            if (i < data.stages.length - 1) {
                html += `
                    <div class="funnel-connector">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3 L8 13 M4 9 L8 13 L12 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                `;
            }
        });

        container.innerHTML = html;

        // Animate bars after render
        requestAnimationFrame(() => {
            container.querySelectorAll('.funnel-bar-fill').forEach((bar, i) => {
                setTimeout(() => {
                    bar.style.width = bar.dataset.width;
                }, 100 + i * 150);
            });
        });
    };

    const renderFunnelStats = (data) => {
        const container = document.getElementById('funnelStats');
        if (!container) return;

        const rates = data.conversion_rates || {};
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-card__label">Pipeline Value</div>
                <div class="stat-card__value">$${(data.pipeline_value || 0).toLocaleString()}</div>
                <div class="stat-card__sub">Across all deals</div>
            </div>
            <div class="stat-card">
                <div class="stat-card__label">Avg Deal Size</div>
                <div class="stat-card__value">$${(data.avg_deal_size || 0).toLocaleString()}</div>
                <div class="stat-card__sub">Per closed deal</div>
            </div>
            <div class="stat-card">
                <div class="stat-card__label">Contact → HIRO</div>
                <div class="stat-card__value">${calculateOverallRate(rates)}</div>
                <div class="stat-card__sub">Overall funnel rate</div>
            </div>
        `;
    };

    const calculateOverallRate = (rates) => {
        const r1 = rates.contact_to_engaged || 0;
        const r2 = rates.engaged_to_mql || 0;
        const r3 = rates.mql_to_hiro || 0;
        const overall = r1 * r2 * r3;
        return (overall * 100).toFixed(1) + '%';
    };

    // ── Campaigns ───────────────────────────────────────────────────────
    const loadCampaigns = async () => {
        const data = await fetchAPI('/api/campaigns');
        if (!data) return;

        state.campaigns = data.campaigns || [];
        renderCampaignTable(state.campaigns);
    };

    const renderCampaignTable = (campaigns) => {
        const tbody = document.getElementById('campaignTableBody');
        if (!tbody) return;

        if (!campaigns.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No campaigns found</td></tr>';
            return;
        }

        // Sort campaigns
        const sorted = [...campaigns].sort((a, b) => {
            let va = a[state.sortColumn];
            let vb = b[state.sortColumn];
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return state.sortDirection === 'asc' ? cmp : -cmp;
        });

        // Update sort indicators
        document.querySelectorAll('.data-table th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.sort === state.sortColumn) {
                th.classList.add('sorted-' + state.sortDirection);
            }
        });

        tbody.innerHTML = sorted.map((c, i) => {
            const statusClass = c.status === 'ENABLED' ? 'active' : 'paused';
            const statusLabel = c.status === 'ENABLED' ? 'Active' : 'Paused';

            // Generate sparkline data (pseudo-random but deterministic per campaign)
            const sparkData = generateSparkData(c.id || i, 14);
            const sparkColor = c.cpa_status === 'excellent' ? '#10B981' :
                              c.cpa_status === 'warning' ? '#F59E0B' :
                              c.cpa_status === 'critical' ? '#EF4444' : '#6B7280';

            return `
                <tr data-campaign-id="${c.id}" onclick="MICDashboard.showCampaignDetail('${c.id}')" style="animation: fadeInUp 0.3s ease-out ${i * 0.05}s both">
                    <td><strong>${escapeHtml(c.name)}</strong></td>
                    <td><span class="status-pill status-pill--${statusClass}">${statusLabel}</span></td>
                    <td class="num">${c.impressions.toLocaleString()}</td>
                    <td class="num">${c.clicks.toLocaleString()}</td>
                    <td class="num">${c.conversions}</td>
                    <td class="num">$${c.cost.toLocaleString()}</td>
                    <td class="num cpa-${c.cpa_status}">${c.conversions > 0 ? '$' + c.cpa.toFixed(2) : '—'}</td>
                    <td class="num">${c.ctr.toFixed(2)}%</td>
                    <td class="sparkline-cell">
                        <canvas id="spark-${c.id || i}" width="80" height="28"></canvas>
                    </td>
                </tr>
            `;
        }).join('');

        // Render sparklines after DOM update
        requestAnimationFrame(() => {
            sorted.forEach((c, i) => {
                const canvas = document.getElementById(`spark-${c.id || i}`);
                const sparkData = generateSparkData(c.id || i, 14);
                const color = c.cpa_status === 'excellent' ? '#10B981' :
                              c.cpa_status === 'warning' ? '#F59E0B' :
                              c.cpa_status === 'critical' ? '#EF4444' : '#6B7280';
                MICCharts.createSparkline(canvas, sparkData, color);
            });
        });
    };

    const generateSparkData = (seed, length) => {
        // Simple seeded pseudo-random for consistent sparklines
        let s = typeof seed === 'string' ? hashCode(seed) : seed;
        const data = [];
        let val = 50;
        for (let i = 0; i < length; i++) {
            s = (s * 16807 + 0) % 2147483647;
            const delta = (s % 20) - 10;
            val = Math.max(10, Math.min(90, val + delta));
            data.push(val);
        }
        return data;
    };

    const hashCode = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    };

    const sortTable = (column) => {
        if (state.sortColumn === column) {
            state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortColumn = column;
            state.sortDirection = 'desc';
        }
        filterCampaigns();
    };

    const filterCampaigns = () => {
        const search = (document.getElementById('campaignSearch')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('campaignFilter')?.value || 'all';
        const cpaFilter = document.getElementById('cpaFilter')?.value || 'all';

        let filtered = state.campaigns.filter(c => {
            if (search && !c.name.toLowerCase().includes(search)) return false;
            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
            if (cpaFilter !== 'all' && c.cpa_status !== cpaFilter) return false;
            return true;
        });

        renderCampaignTable(filtered);
    };

    const showCampaignDetail = (id) => {
        const campaign = state.campaigns.find(c => c.id === id);
        if (!campaign) return;

        const detail = document.getElementById('campaignDetail');
        const name = document.getElementById('detailCampaignName');
        const content = document.getElementById('detailContent');

        if (name) name.textContent = campaign.name;

        if (content) {
            content.innerHTML = `
                <div class="detail-metric">
                    <div class="detail-metric__label">Impressions</div>
                    <div class="detail-metric__value">${campaign.impressions.toLocaleString()}</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">Clicks</div>
                    <div class="detail-metric__value">${campaign.clicks.toLocaleString()}</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">Conversions</div>
                    <div class="detail-metric__value">${campaign.conversions}</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">Total Spend</div>
                    <div class="detail-metric__value">$${campaign.cost.toLocaleString()}</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">CPA</div>
                    <div class="detail-metric__value cpa-${campaign.cpa_status}">${campaign.conversions > 0 ? '$' + campaign.cpa.toFixed(2) : '—'}</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">CTR</div>
                    <div class="detail-metric__value">${campaign.ctr.toFixed(2)}%</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">Conv. Rate</div>
                    <div class="detail-metric__value">${campaign.conversion_rate.toFixed(2)}%</div>
                </div>
                <div class="detail-metric">
                    <div class="detail-metric__label">Status</div>
                    <div class="detail-metric__value"><span class="status-pill status-pill--${campaign.status === 'ENABLED' ? 'active' : 'paused'}">${campaign.status === 'ENABLED' ? 'Active' : 'Paused'}</span></div>
                </div>
            `;
        }

        if (detail) {
            detail.style.display = 'block';
            detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    const closeCampaignDetail = () => {
        const detail = document.getElementById('campaignDetail');
        if (detail) detail.style.display = 'none';
    };

    // ── Trends ──────────────────────────────────────────────────────────
    const loadTrends = async () => {
        const data = await fetchAPI('/api/trends');
        if (!data?.days) return;

        state.trendData = data.days;
        renderTrendCharts(data.days);
    };

    const renderTrendCharts = (allDays) => {
        const days = allDays.slice(-state.trendRange);

        // Spend chart
        MICCharts.createSpendChart('chartSpend', days);
        const totalSpend = days.reduce((s, d) => s + d.spend, 0);
        setText('totalSpendBadge', '$' + Math.round(totalSpend).toLocaleString());

        // CPA chart
        MICCharts.createCPAChart('chartCPA', days);
        const avgCpa = days.reduce((s, d) => s + d.cpa, 0) / days.length;
        setText('avgCpaBadge', '$' + avgCpa.toFixed(2));

        // Conversion chart
        MICCharts.createConversionChart('chartConversion', days);
        const avgConv = days.reduce((s, d) => s + d.conversion_rate, 0) / days.length;
        setText('avgConvBadge', avgConv.toFixed(2) + '%');

        // CTR chart
        MICCharts.createCTRChart('chartCTR', days);
        const avgCtr = days.reduce((s, d) => s + d.ctr, 0) / days.length;
        setText('avgCtrBadge', avgCtr.toFixed(2) + '%');
    };

    // ── Alerts ──────────────────────────────────────────────────────────
    const loadAlerts = async () => {
        const data = await fetchAPI('/api/alerts');
        if (!data) return;

        renderAlerts(data.alerts || []);
    };

    const renderAlerts = (alerts) => {
        const container = document.getElementById('alertsContainer');
        const countBadge = document.getElementById('alertCountBadge');

        if (!container) return;

        if (countBadge) {
            const critical = alerts.filter(a => a.level === 'critical').length;
            countBadge.textContent = `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`;
            countBadge.className = 'badge ' + (critical > 0 ? 'badge--danger' : alerts.length > 0 ? 'badge--warning' : 'badge--success');
        }

        if (!alerts.length) {
            container.innerHTML = `
                <div class="no-alerts">
                    <div class="no-alerts-icon">✅</div>
                    <h4>All Clear</h4>
                    <p>No active alerts — all campaigns within thresholds</p>
                </div>
            `;
            return;
        }

        const icons = { critical: '🔴', warning: '🟡', info: '🟢' };
        const actionLabels = {
            critical: 'Pause Campaign',
            warning: 'Review',
            info: 'Scale Up',
        };

        container.innerHTML = alerts.map((alert, i) => `
            <div class="alert-card alert-${alert.level}" id="alert-${i}" style="animation-delay: ${i * 0.08}s">
                <div class="alert-icon">${icons[alert.level] || '⚪'}</div>
                <div class="alert-body">
                    <div class="alert-campaign">${escapeHtml(alert.campaign)}</div>
                    <div class="alert-message">${escapeHtml(alert.message)}</div>
                </div>
                <div class="alert-actions">
                    <button class="alert-btn ${alert.level === 'critical' ? 'alert-btn--danger' : ''}" onclick="MICDashboard.handleAlertAction('${alert.level}', '${escapeHtml(alert.campaign)}')">
                        ${actionLabels[alert.level] || 'Review'}
                    </button>
                    <button class="alert-btn alert-btn--dismiss" onclick="MICDashboard.dismissAlert(${i})" title="Dismiss">&times;</button>
                </div>
            </div>
        `).join('');
    };

    const dismissAlert = (index) => {
        const el = document.getElementById(`alert-${index}`);
        if (el) {
            el.classList.add('dismissed');
            setTimeout(() => el.remove(), 400);
        }
    };

    const handleAlertAction = (level, campaign) => {
        const actions = {
            critical: `Pause request queued for "${campaign}"`,
            warning: `Review flagged for "${campaign}"`,
            info: `Scale analysis started for "${campaign}"`,
        };
        showToast(actions[level] || 'Action noted');
    };

    // ── Export ───────────────────────────────────────────────────────────
    const exportCSV = () => {
        window.location.href = '/api/export/csv';
        showToast('Exporting CSV...');
    };

    // ── Modal ───────────────────────────────────────────────────────────
    const toggleModal = (show) => {
        const modal = document.getElementById('shortcutsModal');
        if (modal) {
            if (show) {
                modal.classList.add('visible');
            } else {
                modal.classList.remove('visible');
            }
        }
    };

    // ── Toast ───────────────────────────────────────────────────────────
    const showToast = (message, duration = 3000) => {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span class="toast-icon">✓</span> ${escapeHtml(message)}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };

    // ── Utilities ───────────────────────────────────────────────────────
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    };

    const debounce = (fn, ms) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    };

    const scrollToSection = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const updateTimestamp = () => {
        const el = document.getElementById('lastUpdated');
        if (el) {
            el.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        }
    };

    // ── Public API ──────────────────────────────────────────────────────
    return {
        init,
        showCampaignDetail,
        dismissAlert,
        handleAlertAction,
    };
})();

// ── Boot ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', MICDashboard.init);
