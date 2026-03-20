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
        activeTab: localStorage.getItem('mic_active_tab') || 'ac',
        gadsLoaded: false,  // lazy-load flag — don't fetch until tab is opened
        roiLoaded: false,   // lazy-load flag for Demand Gen ROI tab
    };

    // ── Tab Switching ─────────────────────────────────────────────────
    const switchTab = (tabName) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        const tabEl = document.getElementById(`tab-${tabName}`);
        const btnEl = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabEl) tabEl.classList.remove('hidden');
        if (btnEl) btnEl.classList.add('active');

        state.activeTab = tabName;
        localStorage.setItem('mic_active_tab', tabName);

        // Lazy-load Google Ads data on first visit
        if (tabName === 'gads' && !state.gadsLoaded) {
            state.gadsLoaded = true;
            loadGadsData();
        }

        // Lazy-load Demand Gen ROI data on first visit
        if (tabName === 'roi' && !state.roiLoaded) {
            state.roiLoaded = true;
            loadRoiData();
        }

        // Re-init icons for the newly visible tab
        initIcons();
    };

    // ── Init ────────────────────────────────────────────────────────────
    const init = () => {
        initTheme();
        initIcons();
        bindEvents();
        switchTab(state.activeTab);  // restore saved tab
        loadAcData();                // always load AC data on boot
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

        // ROI CSV export
        document.getElementById('btnExportRoiCSV')?.addEventListener('click', exportRoiCSV);

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
            case '1': switchTab('ac'); scrollToSection('sectionMetrics'); break;
            case '2': switchTab('ac'); scrollToSection('sectionFunnel'); break;
            case '3': switchTab('gads'); scrollToSection('sectionCampaigns'); break;
            case '4': switchTab('gads'); scrollToSection('sectionTrends'); break;
            case '5': switchTab('ac'); scrollToSection('sectionAlerts'); break;
            case '6': switchTab('roi'); scrollToSection('sectionRoiHero'); break;
        }
    };

    // ── Data Loading ────────────────────────────────────────────────────
    const loadAcData = async () => {
        await Promise.all([
            loadMetrics(),
            loadFunnel(),
            loadAlerts(),
        ]);
        updateTimestamp();
    };

    const loadGadsData = async () => {
        const params = (typeof GadsTimeState !== 'undefined') ? GadsTimeState.toParams() : '';
        await Promise.all([
            loadCampaigns(params),
            loadTrends(params),
        ]);
        updateTimestamp();
    };

    const loadAllData = async () => {
        // Refresh active tab data
        if (state.activeTab === 'ac') {
            await loadAcData();
        } else if (state.activeTab === 'gads') {
            await loadGadsData();
        } else if (state.activeTab === 'roi') {
            await loadRoiData();
        }
    };

    const refreshAll = async () => {
        if (state.isRefreshing) return;
        state.isRefreshing = true;

        const btn = document.getElementById('btnRefresh');
        btn?.classList.add('refreshing');

        // Refresh all loaded tabs' data
        await Promise.all([
            loadAcData(),
            state.gadsLoaded ? loadGadsData() : Promise.resolve(),
            state.roiLoaded ? loadRoiData() : Promise.resolve(),
        ]);

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

        // Sync pipeline state for time intelligence
        if (typeof PipelineState !== 'undefined' && data.pipeline) {
            PipelineState.selectedId = data.pipeline.id;
        }

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

        // Connection status (navbar — shows overall)
        const dot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const anyConnected = data.connections?.activecampaign || data.connections?.google_ads;
        if (dot) {
            dot.className = 'status-dot ' + (anyConnected ? 'connected' : 'disconnected');
        }
        if (statusText) {
            statusText.textContent = anyConnected ? 'Live Data' : 'Demo Mode';
        }

        // Per-tab AC connection indicator
        const acDot = document.getElementById('acStatusDot');
        const acText = document.getElementById('acStatusText');
        if (acDot) {
            acDot.className = 'status-dot ' + (data.connections?.activecampaign ? 'connected' : 'disconnected');
        }
        if (acText) {
            acText.textContent = data.connections?.activecampaign
                ? 'ActiveCampaign: Connected'
                : 'ActiveCampaign: Not Connected';
        }

        // Per-tab Google Ads indicator (set from metrics since it includes both)
        const gadsDot = document.getElementById('gadsStatusDot');
        const gadsText = document.getElementById('gadsStatusText');
        if (gadsDot) {
            gadsDot.className = 'status-dot ' + (data.connections?.google_ads ? 'connected' : 'disconnected');
        }
        if (gadsText) {
            gadsText.textContent = data.connections?.google_ads
                ? 'Google Ads: Connected'
                : 'Google Ads: Not Connected';
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
    const loadCampaigns = async (queryString) => {
        const url = queryString ? `/api/campaigns?${queryString}` : '/api/campaigns';
        const data = await fetchAPI(url);
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
                    <td><strong>${c.ac_url ? `<a href="${escapeHtml(c.ac_url)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; text-decoration-style: dotted;" onclick="event.stopPropagation()">${escapeHtml(c.name)}</a>` : escapeHtml(c.name)}</strong></td>
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
    const loadTrends = async (queryString) => {
        const url = queryString ? `/api/trends?${queryString}` : '/api/trends';
        const data = await fetchAPI(url);
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

    // ── Demand Gen ROI ──────────────────────────────────────────────────
    const loadRoiData = async () => {
        const data = await fetchAPI('/api/demand-gen-roi');
        if (!data) return;

        renderRoiHero(data);
        renderRoiFunnel(data.funnel);
        renderRoiRevenue(data);
        renderRoiStatus(data.connections);
        updateTimestamp();
    };

    const renderRoiHero = (data) => {
        const annual = data.roas?.annual || {};
        const target = data.target || {};

        animateCounter('roiAnnualRoas', annual.roas || 0, { decimals: 1 });
        animateCounter('roiTotalConversions', annual.total_conversions || 0, { decimals: 0, separator: true });
        animateCounter('roiTotalSpend', annual.total_spend || 0, { decimals: 0, separator: true });
        animateCounter('roiTotalRevenue', annual.ltv_weighted_revenue || 0, { decimals: 0, separator: true });

        // ROAS progress bar
        const bar = document.getElementById('roasProgressBar');
        const label = document.getElementById('roasProgressLabel');
        if (bar) {
            setTimeout(() => { bar.style.width = Math.min(target.progress_pct || 0, 100) + '%'; }, 100);
            // Color the bar based on ROAS class
            bar.className = 'progress-bar ' + (data.annual_roas_class || '');
        }
        if (label) {
            const current = annual.roas != null ? annual.roas.toFixed(1) + 'x' : 'N/A';
            label.textContent = `${current} — Target: ${target.minimum}x min / ${target.excellent}x excellent`;
        }
    };

    const renderRoiFunnel = (funnel) => {
        const tbody = document.getElementById('roiFunnelBody');
        const badge = document.getElementById('roiFunnelBadge');
        if (!tbody) return;

        if (badge) {
            badge.className = 'badge badge--live';
            badge.textContent = 'Pipeline 1';
        }

        const ytd = funnel.ytd_totals || {};
        let html = '';

        // Stage rows
        const stageRows = [
            { label: 'Demand Created', key: 'created' },
            { label: 'Demand Engaged', key: 'engaged' },
            { label: 'Demand Captured', key: 'captured' },
            { label: 'Demand Converted', key: 'converted' },
        ];

        const rateRows = [
            { label: 'Engaged Rate', key: 'engaged_rate', after: 'engaged' },
            { label: 'Captured Rate', key: 'captured_rate', after: 'captured' },
            { label: 'Converted Rate', key: 'converted_rate', after: 'converted' },
        ];

        stageRows.forEach(row => {
            const vals = funnel[row.key] || [];
            html += `<tr class="roi-stage-row">`;
            html += `<td class="roi-td-label"><strong>${row.label}</strong></td>`;
            vals.forEach(v => {
                html += `<td class="roi-td-num">${v || ''}</td>`;
            });
            html += `<td class="roi-td-total"><strong>${ytd[row.key] || 0}</strong></td>`;
            html += `</tr>`;

            // Insert rate row after its stage
            const rate = rateRows.find(r => r.after === row.key);
            if (rate) {
                const rateVals = funnel[rate.key] || [];
                html += `<tr class="roi-rate-row">`;
                html += `<td class="roi-td-label roi-rate-label">${rate.label}</td>`;
                rateVals.forEach(v => {
                    html += `<td class="roi-td-num roi-rate-cell">${v != null ? (v * 100).toFixed(1) + '%' : ''}</td>`;
                });
                const ytdRate = ytd[rate.key];
                html += `<td class="roi-td-total roi-rate-cell">${ytdRate != null ? (ytdRate * 100).toFixed(1) + '%' : ''}</td>`;
                html += `</tr>`;
            }
        });

        tbody.innerHTML = html;
    };

    const renderRoiRevenue = (data) => {
        const tbody = document.getElementById('roiRevenueBody');
        if (!tbody) return;

        const roas = data.roas || {};
        const annual = roas.annual || {};
        const thresholds = data.thresholds || {};
        let html = '';

        // Ad Spend row
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>Ad Spend</strong></td>';
        (roas.total_spend || []).forEach(v => {
            html += `<td class="roi-td-num">${v > 0 ? '$' + v.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) : ''}</td>`;
        });
        html += `<td class="roi-td-total"><strong>$${(annual.total_spend || 0).toLocaleString()}</strong></td>`;
        html += '</tr>';

        // LTV row with outlier flags
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>LTV</strong></td>';
        (roas.ltv || []).forEach((v, i) => {
            const outlier = (roas.ltv_outlier_flags || [])[i];
            const cls = outlier ? ' roi-outlier' : '';
            const warn = outlier ? ' <span class="roi-outlier-icon" title="LTV > $50,000 — outlier">&#9888;</span>' : '';
            html += `<td class="roi-td-num${cls}">${v > 0 ? '$' + v.toLocaleString() + warn : ''}</td>`;
        });
        html += '<td class="roi-td-total"></td>';
        html += '</tr>';

        // New Revenue row
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>New Revenue</strong></td>';
        (roas.monthly_new_revenue || []).forEach(v => {
            html += `<td class="roi-td-num">${v > 0 ? '$' + v.toLocaleString(undefined, {maximumFractionDigits: 0}) : ''}</td>`;
        });
        html += `<td class="roi-td-total"><strong>$${(annual.total_new_revenue || 0).toLocaleString()}</strong></td>`;
        html += '</tr>';

        // Cumulative ARR row
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>Cumulative ARR</strong></td>';
        (roas.cumulative_arr || []).forEach(v => {
            html += `<td class="roi-td-num">${v > 0 ? '$' + v.toLocaleString(undefined, {maximumFractionDigits: 0}) : ''}</td>`;
        });
        html += `<td class="roi-td-total"><strong>$${(annual.total_cumulative_arr || 0).toLocaleString()}</strong></td>`;
        html += '</tr>';

        // Blank separator
        html += '<tr class="roi-separator"><td colspan="14"></td></tr>';

        // ROAS rows
        const roasRows = [
            { label: 'ROAS A (Monthly New)', key: 'roas_a' },
            { label: 'ROAS B (Cumulative ARR)', key: 'roas_b' },
            { label: 'ROAS C (LTV-Weighted)', key: 'roas_c' },
        ];

        roasRows.forEach(row => {
            html += '<tr class="roi-roas-row">';
            html += `<td class="roi-td-label"><strong>${row.label}</strong></td>`;
            (roas[row.key] || []).forEach(v => {
                const cls = roasColorClass(v, thresholds);
                html += `<td class="roi-td-num ${cls}">${v != null ? v.toFixed(1) + 'x' : ''}</td>`;
            });
            // Annual total for ROAS C only
            if (row.key === 'roas_c' && annual.roas != null) {
                const cls = roasColorClass(annual.roas, thresholds);
                html += `<td class="roi-td-total ${cls}"><strong>${annual.roas.toFixed(1)}x</strong></td>`;
            } else {
                html += '<td class="roi-td-total"></td>';
            }
            html += '</tr>';
        });

        tbody.innerHTML = html;
    };

    const roasColorClass = (value, thresholds) => {
        if (value == null) return '';
        if (value >= (thresholds.roas_excellent || 8)) return 'roas-excellent';
        if (value >= (thresholds.roas_good || 4)) return 'roas-good';
        if (value >= (thresholds.roas_warning || 1)) return 'roas-warning';
        return 'roas-critical';
    };

    const renderRoiStatus = (connections) => {
        const acDot = document.getElementById('roiAcStatusDot');
        const acText = document.getElementById('roiAcStatusText');
        const gadsDot = document.getElementById('roiGadsStatusDot');
        const gadsText = document.getElementById('roiGadsStatusText');

        if (acDot) acDot.className = 'status-dot ' + (connections?.activecampaign ? 'connected' : 'disconnected');
        if (acText) acText.textContent = connections?.activecampaign ? 'ActiveCampaign: Connected' : 'ActiveCampaign: Not Connected';
        if (gadsDot) gadsDot.className = 'status-dot ' + (connections?.google_ads ? 'connected' : 'disconnected');
        if (gadsText) gadsText.textContent = connections?.google_ads ? 'Google Ads: Connected' : 'Google Ads: Not Connected';
    };

    const exportRoiCSV = () => {
        window.location.href = '/api/demand-gen-roi/export/csv';
        showToast('Exporting ROI CSV...');
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
                    <div class="alert-campaign">${alert.ac_url ? `<a href="${escapeHtml(alert.ac_url)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; text-decoration-style: dotted;" onclick="event.stopPropagation()">${escapeHtml(alert.campaign)}</a>` : escapeHtml(alert.campaign)}</div>
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
        switchTab,
        showCampaignDetail,
        dismissAlert,
        handleAlertAction,
        loadGadsData,
    };
})();

// ── Boot ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', MICDashboard.init);


// ═══════════════════════════════════════════════════════════════════════════
//  Time Intelligence & Section Layout (Agent 3)
// ═══════════════════════════════════════════════════════════════════════════

// ── Pipeline State ────────────────────────────────────────────────────────
const PipelineState = {
    selectedId: null,
};

// ── Date Helpers ──────────────────────────────────────────────────────────
function today() {
    return new Date().toISOString().split('T')[0];
}

function firstDayOfMonth(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getQuarterDates(d) {
    const q = Math.floor(d.getMonth() / 3);
    const startMonth = q * 3;
    const start = new Date(d.getFullYear(), startMonth, 1);
    const end = new Date(d.getFullYear(), startMonth + 3, 0);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

function getLastQuarterDates(d) {
    const q = Math.floor(d.getMonth() / 3);
    const lastQ = q === 0 ? 3 : q - 1;
    const year = q === 0 ? d.getFullYear() - 1 : d.getFullYear();
    const startMonth = lastQ * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

function getLastMonthDates(d) {
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

function getLastYearDates(d) {
    const year = d.getFullYear() - 1;
    return { start: `${year}-01-01`, end: `${year}-12-31` };
}

// ── Time State ────────────────────────────────────────────────────────────
const TimeState = {
    preset: 'qtd',
    startDate: null,
    endDate: null,
    compareMode: 'none',

    computeDates(preset) {
        const now = new Date();
        switch (preset) {
            case 'qtd':          return getQuarterDates(now);
            case 'mtd':          return { start: firstDayOfMonth(now), end: today() };
            case 'ytd':          return { start: `${now.getFullYear()}-01-01`, end: today() };
            case 'last_month':   return getLastMonthDates(now);
            case 'last_quarter': return getLastQuarterDates(now);
            case 'last_year':    return getLastYearDates(now);
            default:             return getQuarterDates(now);
        }
    },

    setPreset(preset) {
        this.preset = preset;
        const { start, end } = this.computeDates(preset);
        this.startDate = start;
        this.endDate = end;
        this._notify();
    },

    setCustomRange(start, end) {
        this.preset = 'custom';
        this.startDate = start;
        this.endDate = end;
        this._notify();
    },

    setCompareMode(mode) {
        this.compareMode = mode;
        this._notify();
    },

    toParams(extra = {}) {
        return new URLSearchParams({
            start_date: this.startDate,
            end_date: this.endDate,
            pipeline_id: PipelineState.selectedId || 1,
            ...extra,
        }).toString();
    },

    _listeners: [],
    subscribe(fn) { this._listeners.push(fn); },
    _notify() {
        this._listeners.forEach(fn => fn(this));
        this._persistState();
    },

    _persistState() {
        localStorage.setItem('mic_time_state', JSON.stringify({
            preset: this.preset,
            startDate: this.startDate,
            endDate: this.endDate,
            compareMode: this.compareMode,
        }));
    },

    restore() {
        try {
            const saved = JSON.parse(localStorage.getItem('mic_time_state') || '{}');
            if (saved.preset) {
                if (saved.preset === 'custom' && saved.startDate && saved.endDate) {
                    this.setCustomRange(saved.startDate, saved.endDate);
                } else {
                    this.setPreset(saved.preset || 'qtd');
                }
                this.compareMode = saved.compareMode || 'none';
            } else {
                this.setPreset('qtd');
            }
        } catch {
            this.setPreset('qtd');
        }
    }
};

// ── Section Loader ────────────────────────────────────────────────────────
async function loadSection(sectionId, endpoint, params, renderFn) {
    const body = document.getElementById(`body-${sectionId}`);
    const loading = document.getElementById(`loading-${sectionId}`);
    const error = document.getElementById(`error-${sectionId}`);

    if (!body) return;

    loading?.classList.remove('hidden');
    error?.classList.add('hidden');

    try {
        const resp = await fetch(`${endpoint}?${params}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        loading?.classList.add('hidden');
        renderFn(body, data);
    } catch (err) {
        loading?.classList.add('hidden');
        error?.classList.remove('hidden');
        if (error) error.querySelector('.error-msg').textContent =
            `Failed to load: ${err.message}`;
    }
}

// ── Section Subscriptions ─────────────────────────────────────────────────
function initSectionSubscriptions() {
    TimeState.subscribe((state) => {
        const params = state.toParams();

        if (typeof renderPipelineHealth === 'function')
            loadSection('pipeline-health', '/api/pipeline-health', params, renderPipelineHealth);
        if (typeof renderVelocity === 'function')
            loadSection('velocity', '/api/velocity', params, renderVelocity);
        if (typeof renderAcquisition === 'function')
            loadSection('acquisition', '/api/acquisition', params, renderAcquisition);
        if (typeof renderRepPerformance === 'function')
            loadSection('rep-performance', '/api/rep-performance', params, renderRepPerformance);
        if (typeof renderForecastWeighted === 'function')
            loadSection('forecast', '/api/forecast-weighted', params, renderForecastWeighted);
        if (typeof renderCohorts === 'function')
            loadSection('cohorts', '/api/cohorts',
                new URLSearchParams({ months: 12 }).toString(), renderCohorts);
    });
}

// ── Delta Badge ───────────────────────────────────────────────────────────
function renderDelta(container, delta) {
    if (!delta || delta.direction === undefined) return;
    const { value, pct, direction } = delta;
    const sign = direction === 'up' ? '+' : direction === 'down' ? '-' : '';
    const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
    const color = direction === 'up' ? 'var(--success)' :
                  direction === 'down' ? 'var(--error)' : 'var(--dgrey-100)';

    const badge = document.createElement('span');
    badge.className = 'delta-badge';
    badge.style.color = color;
    badge.textContent = `${sign}${Math.abs(pct).toFixed(1)}% ${arrow}`;
    badge.title = `${sign}${formatCurrency(Math.abs(value))} vs comparison period`;
    container.appendChild(badge);
}

function formatCurrency(val, currency = 'usd') {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(val);
}

// ── DOM Injection ─────────────────────────────────────────────────────────
function injectTimeIntelligenceUI() {
    const acTab = document.getElementById('tab-ac');
    if (!acTab) return;

    const metricsSection = document.getElementById('sectionMetrics');
    if (!metricsSection) return;

    // Time Intelligence Bar
    const timeBarHTML = `
    <div class="time-intelligence-bar" id="timeBar">
        <div class="time-presets">
            <button class="time-preset active" data-preset="qtd">QTD</button>
            <button class="time-preset" data-preset="mtd">MTD</button>
            <button class="time-preset" data-preset="ytd">YTD</button>
            <button class="time-preset" data-preset="last_month">Last Month</button>
            <button class="time-preset" data-preset="last_quarter">Last Quarter</button>
            <button class="time-preset" data-preset="last_year">Last Year</button>
            <button class="time-preset" data-preset="custom">Custom ▾</button>
        </div>
        <div class="time-custom-range hidden" id="customRange">
            <input type="date" id="customStart" />
            <span>\u2192</span>
            <input type="date" id="customEnd" />
            <button class="btn-apply-range" onclick="applyCustomRange()">Apply</button>
        </div>
        <div class="time-comparison">
            <span class="compare-label">Compare to:</span>
            <select id="compareMode">
                <option value="none">None</option>
                <option value="mom">Last Month</option>
                <option value="qoq">Last Quarter</option>
                <option value="yoy">Same Period Last Year</option>
                <option value="custom">Custom Period</option>
            </select>
        </div>
        <div class="time-active-period" id="activePeriodLabel">
            Q1 2026: Jan 1 \u2013 Mar 31
        </div>
    </div>`;

    // Section containers
    const sections = [
        { id: 'pipeline-health', icon: '\uD83D\uDCCA', title: 'Pipeline Health' },
        { id: 'velocity',        icon: '\u26A1',       title: 'Deal Velocity' },
        { id: 'acquisition',     icon: '\uD83D\uDC65', title: 'Contact Acquisition' },
        { id: 'rep-performance', icon: '\uD83C\uDFC6', title: 'Rep Performance' },
        { id: 'forecast',        icon: '\uD83D\uDCC8', title: 'Revenue Forecast' },
        { id: 'cohorts',         icon: '\uD83D\uDD04', title: 'Cohort Analysis' },
    ];

    const sectionsHTML = sections.map(s => `
    <section class="dashboard-section" id="section-${s.id}">
        <div class="section-header">
            <h2 class="section-title">
                <span class="section-icon">${s.icon}</span>
                ${s.title}
            </h2>
            <div class="section-actions">
                <span class="section-badge live">Live</span>
            </div>
        </div>
        <div class="section-body" id="body-${s.id}"></div>
        <div class="section-loading hidden" id="loading-${s.id}">
            <div class="skeleton-loader"></div>
        </div>
        <div class="section-error hidden" id="error-${s.id}">
            <span class="error-msg"></span>
        </div>
    </section>`).join('\n');

    // Insert time bar after metrics section
    metricsSection.insertAdjacentHTML('afterend', timeBarHTML);

    // Insert sections after time bar, before funnel
    const timeBarEl = document.getElementById('timeBar');
    timeBarEl.insertAdjacentHTML('afterend', sectionsHTML);
}

// ── Load CSS ──────────────────────────────────────────────────────────────
function loadTimeIntelligenceStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/time-intelligence.css';
    document.head.appendChild(link);
}

// ── Wire Up Controls ──────────────────────────────────────────────────────
function wireTimeControls() {
    document.querySelectorAll('.time-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (preset === 'custom') {
                document.getElementById('customRange').classList.toggle('hidden');
                return;
            }
            document.querySelectorAll('.time-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('customRange').classList.add('hidden');
            TimeState.setPreset(preset);
            updateActivePeriodLabel();
        });
    });

    document.getElementById('compareMode')?.addEventListener('change', (e) => {
        TimeState.setCompareMode(e.target.value);
    });
}

function applyCustomRange() {
    const start = document.getElementById('customStart').value;
    const end = document.getElementById('customEnd').value;
    if (!start || !end) return;
    document.querySelectorAll('.time-preset').forEach(b => b.classList.remove('active'));
    document.querySelector('.time-preset[data-preset="custom"]')?.classList.add('active');
    TimeState.setCustomRange(start, end);
    document.getElementById('customRange').classList.add('hidden');
    updateActivePeriodLabel();
}

function updateActivePeriodLabel() {
    const label = document.getElementById('activePeriodLabel');
    if (!label) return;
    const { startDate, endDate, preset } = TimeState;
    const presetLabels = {
        qtd: 'Quarter to Date', mtd: 'Month to Date', ytd: 'Year to Date',
        last_month: 'Last Month', last_quarter: 'Last Quarter',
        last_year: 'Last Year', custom: 'Custom Range',
    };
    label.textContent = `${presetLabels[preset] || preset}: ${startDate} \u2013 ${endDate}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Google Ads Time State
// ═══════════════════════════════════════════════════════════════════════════

const GadsTimeState = {
    preset: 'qtd',
    startDate: null,
    endDate: null,

    setPreset(preset) {
        this.preset = preset;
        const { start, end } = TimeState.computeDates(preset);
        this.startDate = start;
        this.endDate = end;
        this._notify();
        this._persist();
    },

    setCustomRange(start, end) {
        this.preset = 'custom_gads';
        this.startDate = start;
        this.endDate = end;
        this._notify();
        this._persist();
    },

    toParams() {
        return new URLSearchParams({
            start_date: this.startDate,
            end_date: this.endDate,
        }).toString();
    },

    _listeners: [],
    subscribe(fn) { this._listeners.push(fn); },
    _notify() { this._listeners.forEach(fn => fn(this)); },

    _persist() {
        localStorage.setItem('mic_gads_time_state', JSON.stringify({
            preset: this.preset,
            startDate: this.startDate,
            endDate: this.endDate,
        }));
    },

    restore() {
        try {
            const saved = JSON.parse(localStorage.getItem('mic_gads_time_state') || '{}');
            if (saved.preset === 'custom_gads' && saved.startDate && saved.endDate) {
                this.setCustomRange(saved.startDate, saved.endDate);
            } else {
                this.setPreset(saved.preset || 'qtd');
            }
        } catch {
            this.setPreset('qtd');
        }
    }
};

// ── Inject Google Ads Time Bar ────────────────────────────────────────────
function injectGadsTimeBar() {
    const gadsTab = document.getElementById('tab-gads');
    if (!gadsTab) return;

    const campaignsSection = document.getElementById('sectionCampaigns');
    if (!campaignsSection) return;

    const timeBarHTML = `
    <div class="time-intelligence-bar" id="timeBarGads">
        <div class="time-presets">
            <button class="time-preset-gads active" data-preset="qtd">QTD</button>
            <button class="time-preset-gads" data-preset="mtd">MTD</button>
            <button class="time-preset-gads" data-preset="ytd">YTD</button>
            <button class="time-preset-gads" data-preset="last_month">Last Month</button>
            <button class="time-preset-gads" data-preset="last_quarter">Last Quarter</button>
            <button class="time-preset-gads" data-preset="last_year">Last Year</button>
            <button class="time-preset-gads" data-preset="custom_gads">Custom \u25be</button>
        </div>
        <div class="time-custom-range hidden" id="customRangeGads">
            <input type="date" id="customStartGads" />
            <span>\u2192</span>
            <input type="date" id="customEndGads" />
            <button class="btn-apply-range" onclick="applyCustomRangeGads()">Apply</button>
        </div>
        <div class="time-active-period" id="activePeriodLabelGads">
            Q1 2026: Jan 1 \u2013 Mar 31
        </div>
    </div>`;

    campaignsSection.insertAdjacentHTML('beforebegin', timeBarHTML);
}

// ── Wire Google Ads Time Controls ─────────────────────────────────────────
function wireGadsTimeControls() {
    document.querySelectorAll('.time-preset-gads').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (preset === 'custom_gads') {
                document.getElementById('customRangeGads')?.classList.toggle('hidden');
                return;
            }
            document.querySelectorAll('.time-preset-gads')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('customRangeGads')?.classList.add('hidden');
            GadsTimeState.setPreset(preset);
            updateGadsActivePeriodLabel();
        });
    });
}

function applyCustomRangeGads() {
    const start = document.getElementById('customStartGads').value;
    const end = document.getElementById('customEndGads').value;
    if (!start || !end) return;
    document.querySelectorAll('.time-preset-gads').forEach(b => b.classList.remove('active'));
    document.querySelector('.time-preset-gads[data-preset="custom_gads"]')?.classList.add('active');
    GadsTimeState.setCustomRange(start, end);
    document.getElementById('customRangeGads')?.classList.add('hidden');
    updateGadsActivePeriodLabel();
}

function updateGadsActivePeriodLabel() {
    const label = document.getElementById('activePeriodLabelGads');
    if (!label) return;
    const presetLabels = {
        qtd: 'Quarter to Date', mtd: 'Month to Date', ytd: 'Year to Date',
        last_month: 'Last Month', last_quarter: 'Last Quarter',
        last_year: 'Last Year', custom_gads: 'Custom Range',
    };
    const { preset, startDate, endDate } = GadsTimeState;
    label.textContent = `${presetLabels[preset] || preset}: ${startDate} \u2013 ${endDate}`;
}

// ── Google Ads Time Subscriptions ─────────────────────────────────────────
function initGadsTimeSubscriptions() {
    GadsTimeState.subscribe(() => {
        // loadGadsData reads GadsTimeState.toParams() internally
        MICDashboard.loadGadsData();
        updateGadsActivePeriodLabel();
    });
}

// ── Boot Time Intelligence ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadTimeIntelligenceStyles();
    injectTimeIntelligenceUI();
    TimeState.restore();
    initSectionSubscriptions();
    updateActivePeriodLabel();
    TimeState._notify();

    // Google Ads time bar
    injectGadsTimeBar();
    wireGadsTimeControls();
    GadsTimeState.restore();
    initGadsTimeSubscriptions();
    updateGadsActivePeriodLabel();
});
