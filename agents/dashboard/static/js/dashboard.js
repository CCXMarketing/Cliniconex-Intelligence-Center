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
        isRefreshing: false,
        activeTab: localStorage.getItem('mic_active_tab') || 'ac',
        gadsLoaded: false,  // lazy-load flag — don't fetch until tab is opened
        roiLoaded: false,   // lazy-load flag for Demand Gen ROI tab
    };

    // ── Tab Switching ─────────────────────────────────────────────────
    const switchTab = (tabName) => {
        // Hide exec dashboard when switching to a tab
        const execEl = document.getElementById('exec-dashboard');
        if (execEl) execEl.classList.add('hidden');

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
        // Show exec dashboard as default landing page
        // All tab-content starts hidden; exec-dashboard starts visible
        loadAcData();                // always load AC data on boot
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
                if (typeof ExecDashboard !== 'undefined') ExecDashboard.closeModal();
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

    // Auto-refresh removed — use the manual Refresh button (R) instead

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
        loadRoiData,
    };
})();

// ── Boot ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', MICDashboard.init);


// ═══════════════════════════════════════════════════════════════════════════
//  ROI Inline Editing
// ═══════════════════════════════════════════════════════════════════════════

const ROIEditor = (() => {
    'use strict';

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const FUNNEL_KEYS = ['demand_created','demand_engaged','demand_captured','demand_converted'];
    const FUNNEL_LABELS = { demand_created: 'Demand Created', demand_engaged: 'Demand Engaged', demand_captured: 'Demand Captured', demand_converted: 'Demand Converted' };

    let editMode = false;
    let roiData = null;       // full roi_data.json
    let liveGadsSpend = {};   // month -> cost from Google Ads API
    let selectedYear = '2026';

    // ── Init ──────────────────────────────────────────────────────────
    function init() {
        document.getElementById('roi-edit-btn')?.addEventListener('click', toggleEditMode);
        document.getElementById('roi-cancel-btn')?.addEventListener('click', cancelEdit);
        document.getElementById('roi-year-selector')?.addEventListener('change', (e) => {
            selectedYear = e.target.value;
            loadROIData();
        });
        document.getElementById('roiAddPlatformBtn')?.addEventListener('click', () => {
            document.getElementById('roiAddPlatformForm').style.display = 'flex';
        });
        document.getElementById('roiAddPlatformSubmit')?.addEventListener('click', addPlatform);
        loadROIData();
    }

    // ── Load Data ─────────────────────────────────────────────────────
    async function loadROIData() {
        try {
            const resp = await fetch('/api/roi-data');
            if (!resp.ok) return;
            roiData = await resp.json();
        } catch { return; }

        // Populate year selector with available years
        const yearSel = document.getElementById('roi-year-selector');
        if (yearSel && roiData.years) {
            const years = Object.keys(roiData.years).sort().reverse();
            const existing = Array.from(yearSel.options).map(o => o.value);
            years.forEach(y => {
                if (!existing.includes(y)) {
                    yearSel.add(new Option(y, y));
                }
            });
            yearSel.value = selectedYear;
        }

        // Ensure year data exists
        if (!roiData.years[selectedYear]) {
            roiData.years[selectedYear] = { months: {} };
            MONTHS.forEach(m => {
                const adSpend = {};
                (roiData.platforms || []).forEach(p => adSpend[p] = 0);
                roiData.years[selectedYear].months[m] = {
                    ad_spend: adSpend, new_revenue: 0, arr: 0,
                    funnel: { demand_created: 0, demand_engaged: 0, demand_captured: 0, demand_converted: 0 }
                };
            });
        }

        // Fetch live Google Ads spend for this year
        await fetchLiveGadsSpend();

        // Show LTV in hero card
        const ltvDisplay = document.getElementById('roiLtvDisplay');
        const ltvRow = document.getElementById('roiLtvEditRow');
        if (ltvDisplay) ltvDisplay.textContent = '$' + (roiData.ltv_per_conversion || 0).toLocaleString();
        if (ltvRow) ltvRow.style.display = '';

        if (editMode) renderEditMode();
    }

    async function fetchLiveGadsSpend() {
        liveGadsSpend = {};
        try {
            const resp = await fetch('/api/demand-gen-roi?year=' + selectedYear);
            if (!resp.ok) return;
            const payload = await resp.json();
            const spendArr = payload?.roas?.total_spend || [];
            MONTHS.forEach((m, i) => {
                if (spendArr[i] > 0) liveGadsSpend[m] = spendArr[i];
            });
        } catch { /* ignore */ }
    }

    // ── Toggle Edit ───────────────────────────────────────────────────
    function toggleEditMode() {
        if (!editMode) {
            enterEditMode();
        } else {
            saveChanges();
        }
    }

    function enterEditMode() {
        if (!roiData) return;
        editMode = true;
        document.getElementById('roi-edit-btn').innerHTML = '&#128190; Save Changes';
        document.getElementById('roi-cancel-btn').style.display = '';
        document.getElementById('roiAddPlatformArea').style.display = '';

        // LTV input
        const ltvInput = document.getElementById('roiLtvInput');
        const ltvDisplay = document.getElementById('roiLtvDisplay');
        if (ltvInput && ltvDisplay) {
            ltvInput.value = roiData.ltv_per_conversion || 0;
            ltvInput.style.display = '';
            ltvDisplay.style.display = 'none';
            ltvInput.addEventListener('input', recalculate);
        }

        renderEditMode();
    }

    function cancelEdit() {
        editMode = false;
        document.getElementById('roi-edit-btn').innerHTML = '&#9998; Edit Data';
        document.getElementById('roi-cancel-btn').style.display = 'none';
        document.getElementById('roiAddPlatformArea').style.display = 'none';
        document.getElementById('roiAddPlatformForm').style.display = 'none';

        const ltvInput = document.getElementById('roiLtvInput');
        const ltvDisplay = document.getElementById('roiLtvDisplay');
        if (ltvInput) ltvInput.style.display = 'none';
        if (ltvDisplay) ltvDisplay.style.display = '';

        // Reload original display from the live API
        MICDashboard.loadRoiData();
    }

    // ── Save ──────────────────────────────────────────────────────────
    async function saveChanges() {
        if (!roiData) return;
        const yearData = roiData.years[selectedYear];

        // Collect values from inputs
        MONTHS.forEach(m => {
            const md = yearData.months[m];
            (roiData.platforms || []).forEach(p => {
                if (p === 'Google Ads' && liveGadsSpend[m]) return; // skip live row
                const input = document.querySelector(`input[data-field="ad_spend"][data-platform="${p}"][data-month="${m}"]`);
                if (input) md.ad_spend[p] = parseFloat(input.value) || 0;
            });
            const revInput = document.querySelector(`input[data-field="new_revenue"][data-month="${m}"]`);
            if (revInput) md.new_revenue = parseFloat(revInput.value) || 0;
            const arrInput = document.querySelector(`input[data-field="arr"][data-month="${m}"]`);
            if (arrInput) md.arr = parseFloat(arrInput.value) || 0;
            FUNNEL_KEYS.forEach(fk => {
                const fInput = document.querySelector(`input[data-field="${fk}"][data-month="${m}"]`);
                if (fInput) md.funnel[fk] = parseInt(fInput.value) || 0;
            });
        });

        // LTV
        const ltvInput = document.getElementById('roiLtvInput');
        if (ltvInput) roiData.ltv_per_conversion = parseFloat(ltvInput.value) || 0;

        // POST to save roi_data.json
        const btn = document.getElementById('roi-edit-btn');
        try {
            const resp = await fetch('/api/roi-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roiData),
            });
            if (!resp.ok) throw new Error('Save failed');
        } catch (e) {
            btn.innerHTML = '&#10007; Error: ' + e.message;
            setTimeout(() => { btn.innerHTML = '&#128190; Save Changes'; }, 3000);
            return;
        }

        // Also persist LTV + ad spend to thresholds.yaml via /api/demand-gen-roi/config
        try {
            const configPayload = {};
            // Build ltv_monthly: YYYY-MM → value from conversions * ltv
            const ltv = roiData.ltv_per_conversion || 0;
            const ltvMonthly = {};
            const adSpendOverrides = {};
            MONTHS.forEach((m, i) => {
                const monthKey = selectedYear + '-' + String(i + 1).padStart(2, '0');
                const md = yearData.months[m] || {};
                const conv = md.funnel?.demand_converted || 0;
                if (conv > 0) ltvMonthly[monthKey] = conv * ltv;
                // Sum all platform spend for the month
                let totalSpend = 0;
                (roiData.platforms || []).forEach(p => {
                    totalSpend += md.ad_spend?.[p] || 0;
                });
                if (totalSpend > 0) adSpendOverrides[monthKey] = totalSpend;
            });
            if (Object.keys(ltvMonthly).length) configPayload.ltv_monthly = ltvMonthly;
            if (Object.keys(adSpendOverrides).length) configPayload.ad_spend = adSpendOverrides;

            if (Object.keys(configPayload).length) {
                const cfgResp = await fetch('/api/demand-gen-roi/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(configPayload),
                });
                if (!cfgResp.ok) {
                    const err = await cfgResp.json().catch(() => ({}));
                    console.warn('Config save warning:', err.error || 'unknown');
                }
            }
        } catch (e) {
            console.warn('Config save warning:', e.message);
        }

        editMode = false;
        btn.innerHTML = '&#10003; Saved';
        setTimeout(() => { btn.innerHTML = '&#9998; Edit Data'; }, 2000);
        document.getElementById('roi-cancel-btn').style.display = 'none';
        document.getElementById('roiAddPlatformArea').style.display = 'none';
        document.getElementById('roiAddPlatformForm').style.display = 'none';
        const ltvDisp = document.getElementById('roiLtvDisplay');
        if (ltvInput) ltvInput.style.display = 'none';
        if (ltvDisp) ltvDisp.style.display = '';

        // Refresh the ROI tab with new data
        MICDashboard.loadRoiData();
        roiToast('ROI data saved');
    }

    // ── Add Platform ──────────────────────────────────────────────────
    async function addPlatform() {
        const nameInput = document.getElementById('roiNewPlatformName');
        const name = (nameInput?.value || '').trim();
        if (!name) return;

        try {
            const resp = await fetch('/api/roi-data/add-platform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: name }),
            });
            if (!resp.ok) {
                const err = await resp.json();
                alert(err.error || 'Failed to add platform');
                return;
            }
        } catch { return; }

        nameInput.value = '';
        document.getElementById('roiAddPlatformForm').style.display = 'none';
        await loadROIData();
        renderEditMode();
    }

    // ── Render Edit Mode ──────────────────────────────────────────────
    function renderEditMode() {
        if (!roiData) return;
        const yearData = roiData.years[selectedYear];
        if (!yearData) return;

        renderFunnelEdit(yearData);
        renderRevenueEdit(yearData);
    }

    function makeInput(value, attrs) {
        const parts = Object.entries(attrs).map(([k,v]) => `data-${k}="${v}"`).join(' ');
        return `<input type="number" value="${value}" ${parts} class="roi-edit-input" />`;
    }

    function renderFunnelEdit(yearData) {
        const tbody = document.getElementById('roiFunnelBody');
        if (!tbody) return;

        let html = '';
        FUNNEL_KEYS.forEach((fk, fIdx) => {
            html += '<tr class="roi-stage-row">';
            html += `<td class="roi-td-label"><strong>${FUNNEL_LABELS[fk]}</strong></td>`;
            let ytd = 0;
            MONTHS.forEach(m => {
                const val = yearData.months[m]?.funnel?.[fk] || 0;
                ytd += val;
                html += `<td class="roi-td-num roi-editable-cell">${makeInput(val, { field: fk, month: m })}</td>`;
            });
            html += `<td class="roi-td-total"><strong class="roi-calc" data-calc="funnel_ytd_${fk}">${ytd}</strong></td>`;
            html += '</tr>';

            // Rate rows (read-only calculated)
            if (fIdx > 0) {
                const rateKey = fk.replace('demand_', '') + '_rate';
                html += '<tr class="roi-rate-row">';
                html += `<td class="roi-td-label roi-rate-label">${fk.replace('demand_', '').replace(/^\w/, c => c.toUpperCase())} Rate</td>`;
                const prevKey = FUNNEL_KEYS[fIdx - 1];
                MONTHS.forEach(m => {
                    const prev = yearData.months[m]?.funnel?.[prevKey] || 0;
                    const cur = yearData.months[m]?.funnel?.[fk] || 0;
                    const rate = prev > 0 ? ((cur / prev) * 100).toFixed(1) + '%' : '';
                    html += `<td class="roi-td-num roi-rate-cell"><span class="roi-calc" data-calc="${rateKey}_${m}">${rate}</span></td>`;
                });
                html += '<td class="roi-td-total roi-rate-cell"><span class="roi-calc" data-calc="funnel_ytd_rate_' + fk + '"></span></td>';
                html += '</tr>';
            }
        });

        tbody.innerHTML = html;
        tbody.querySelectorAll('input').forEach(inp => inp.addEventListener('input', recalculate));
    }

    function renderRevenueEdit(yearData) {
        const tbody = document.getElementById('roiRevenueBody');
        if (!tbody) return;

        const platforms = roiData.platforms || [];
        const ltv = parseFloat(document.getElementById('roiLtvInput')?.value) || roiData.ltv_per_conversion || 0;
        let html = '';

        // Per-platform ad spend rows
        platforms.forEach(p => {
            const isLiveGads = (p === 'Google Ads' && Object.keys(liveGadsSpend).length > 0);
            html += '<tr class="roi-stage-row">';
            html += `<td class="roi-td-label"><strong>${p}</strong>${isLiveGads ? ' <span class="roi-live-tag">Live from Google Ads</span>' : ''}</td>`;
            let total = 0;
            MONTHS.forEach(m => {
                const liveVal = isLiveGads ? (liveGadsSpend[m] || 0) : 0;
                const storedVal = yearData.months[m]?.ad_spend?.[p] || 0;
                const val = isLiveGads ? liveVal : storedVal;
                total += val;
                if (isLiveGads) {
                    html += `<td class="roi-td-num roi-live-cell">${val > 0 ? '$' + Math.round(val).toLocaleString() : ''}</td>`;
                } else {
                    html += `<td class="roi-td-num roi-editable-cell">${makeInput(storedVal, { field: 'ad_spend', platform: p, month: m })}</td>`;
                }
            });
            html += `<td class="roi-td-total"><strong class="roi-calc" data-calc="spend_total_${p}">$${Math.round(total).toLocaleString()}</strong></td>`;
            html += '</tr>';
        });

        // Total Ad Spend row (calculated)
        html += '<tr class="roi-stage-row" style="border-top: 2px solid var(--border-color);">';
        html += '<td class="roi-td-label"><strong>Total Ad Spend</strong></td>';
        MONTHS.forEach(m => {
            html += `<td class="roi-td-num"><strong class="roi-calc" data-calc="total_spend_${m}"></strong></td>`;
        });
        html += '<td class="roi-td-total"><strong class="roi-calc" data-calc="annual_total_spend"></strong></td>';
        html += '</tr>';

        // LTV Revenue row (calculated)
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>LTV Revenue</strong></td>';
        MONTHS.forEach(m => {
            html += `<td class="roi-td-num"><span class="roi-calc" data-calc="ltv_${m}"></span></td>`;
        });
        html += '<td class="roi-td-total"><strong class="roi-calc" data-calc="annual_ltv"></strong></td>';
        html += '</tr>';

        // New Revenue row (editable)
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>New Revenue</strong></td>';
        let totalNewRev = 0;
        MONTHS.forEach(m => {
            const val = yearData.months[m]?.new_revenue || 0;
            totalNewRev += val;
            html += `<td class="roi-td-num roi-editable-cell">${makeInput(val, { field: 'new_revenue', month: m })}</td>`;
        });
        html += `<td class="roi-td-total"><strong class="roi-calc" data-calc="annual_new_revenue">$${totalNewRev.toLocaleString()}</strong></td>`;
        html += '</tr>';

        // Cumulative ARR row (editable)
        html += '<tr class="roi-stage-row">';
        html += '<td class="roi-td-label"><strong>ARR</strong></td>';
        let totalArr = 0;
        MONTHS.forEach(m => {
            const val = yearData.months[m]?.arr || 0;
            totalArr += val;
            html += `<td class="roi-td-num roi-editable-cell">${makeInput(val, { field: 'arr', month: m })}</td>`;
        });
        html += `<td class="roi-td-total"><strong class="roi-calc" data-calc="annual_arr">$${totalArr.toLocaleString()}</strong></td>`;
        html += '</tr>';

        // Separator
        html += '<tr class="roi-separator"><td colspan="14"></td></tr>';

        // ROAS rows (calculated)
        html += renderRoasRowCalc('ROAS A (Monthly New)', 'roas_a');
        html += renderRoasRowCalc('ROAS B (Cumulative ARR)', 'roas_b');
        html += renderRoasRowCalc('ROAS C (LTV-Weighted)', 'roas_c');

        tbody.innerHTML = html;
        tbody.querySelectorAll('input').forEach(inp => inp.addEventListener('input', recalculate));
        recalculate();
    }

    function renderRoasRowCalc(label, key) {
        let html = '<tr class="roi-roas-row">';
        html += `<td class="roi-td-label"><strong>${label}</strong></td>`;
        MONTHS.forEach(m => {
            html += `<td class="roi-td-num"><span class="roi-calc" data-calc="${key}_${m}"></span></td>`;
        });
        html += `<td class="roi-td-total"><strong class="roi-calc" data-calc="${key}_annual"></strong></td>`;
        html += '</tr>';
        return html;
    }

    // ── Recalculate ───────────────────────────────────────────────────
    function recalculate() {
        if (!roiData) return;
        const yearData = roiData.years[selectedYear];
        if (!yearData) return;

        const platforms = roiData.platforms || [];
        const ltv = parseFloat(document.getElementById('roiLtvInput')?.value) || roiData.ltv_per_conversion || 0;

        let annualSpend = 0, annualLtv = 0, annualNewRev = 0, annualArr = 0;
        const monthlySpend = {}, monthlyConversions = {};

        MONTHS.forEach(m => {
            // Total spend for this month
            let mSpend = 0;
            platforms.forEach(p => {
                const isLiveGads = (p === 'Google Ads' && liveGadsSpend[m]);
                let val;
                if (isLiveGads) {
                    val = liveGadsSpend[m] || 0;
                } else {
                    const inp = document.querySelector(`input[data-field="ad_spend"][data-platform="${p}"][data-month="${m}"]`);
                    val = inp ? (parseFloat(inp.value) || 0) : (yearData.months[m]?.ad_spend?.[p] || 0);
                }
                mSpend += val;
            });
            monthlySpend[m] = mSpend;
            annualSpend += mSpend;

            // Conversions for LTV
            const convInput = document.querySelector(`input[data-field="demand_converted"][data-month="${m}"]`);
            const conv = convInput ? (parseInt(convInput.value) || 0) : (yearData.months[m]?.funnel?.demand_converted || 0);
            monthlyConversions[m] = conv;
            const mLtv = conv * ltv;
            annualLtv += mLtv;

            // New Revenue
            const revInput = document.querySelector(`input[data-field="new_revenue"][data-month="${m}"]`);
            const mRev = revInput ? (parseFloat(revInput.value) || 0) : (yearData.months[m]?.new_revenue || 0);
            annualNewRev += mRev;

            // ARR
            const arrInput = document.querySelector(`input[data-field="arr"][data-month="${m}"]`);
            const mArr = arrInput ? (parseFloat(arrInput.value) || 0) : (yearData.months[m]?.arr || 0);
            annualArr += mArr;

            // Set calculated cells
            setCalc(`total_spend_${m}`, mSpend > 0 ? '$' + Math.round(mSpend).toLocaleString() : '');
            setCalc(`ltv_${m}`, mLtv > 0 ? '$' + mLtv.toLocaleString() : '');

            // ROAS A: new_revenue / spend
            const roasA = mSpend > 0 ? mRev / mSpend : null;
            setCalcRoas(`roas_a_${m}`, roasA);

            // ROAS C: ltv / spend
            const roasC = mSpend > 0 ? mLtv / mSpend : null;
            setCalcRoas(`roas_c_${m}`, roasC);
        });

        // Cumulative ARR for ROAS B
        let cumArr = 0, cumSpend = 0;
        MONTHS.forEach(m => {
            const arrInput = document.querySelector(`input[data-field="arr"][data-month="${m}"]`);
            cumArr += arrInput ? (parseFloat(arrInput.value) || 0) : (yearData.months[m]?.arr || 0);
            cumSpend += monthlySpend[m];
            const roasB = cumSpend > 0 ? cumArr / cumSpend : null;
            setCalcRoas(`roas_b_${m}`, roasB);
        });

        // Annuals
        setCalc('annual_total_spend', annualSpend > 0 ? '$' + Math.round(annualSpend).toLocaleString() : '$0');
        setCalc('annual_ltv', annualLtv > 0 ? '$' + annualLtv.toLocaleString() : '$0');
        setCalc('annual_new_revenue', '$' + annualNewRev.toLocaleString());
        setCalc('annual_arr', '$' + annualArr.toLocaleString());

        // Annual ROAS
        const annualRoasA = annualSpend > 0 ? annualNewRev / annualSpend : null;
        setCalcRoas('roas_a_annual', annualRoasA);
        const annualRoasB = annualSpend > 0 ? annualArr / annualSpend : null;
        setCalcRoas('roas_b_annual', annualRoasB);
        const annualRoasC = annualSpend > 0 ? annualLtv / annualSpend : null;
        setCalcRoas('roas_c_annual', annualRoasC);

        // Funnel YTD totals
        FUNNEL_KEYS.forEach((fk, fIdx) => {
            let ytd = 0;
            MONTHS.forEach(m => {
                const inp = document.querySelector(`input[data-field="${fk}"][data-month="${m}"]`);
                ytd += inp ? (parseInt(inp.value) || 0) : 0;
            });
            setCalc(`funnel_ytd_${fk}`, ytd);

            // Funnel rates
            if (fIdx > 0) {
                const prevKey = FUNNEL_KEYS[fIdx - 1];
                MONTHS.forEach(m => {
                    const prevInp = document.querySelector(`input[data-field="${prevKey}"][data-month="${m}"]`);
                    const curInp = document.querySelector(`input[data-field="${fk}"][data-month="${m}"]`);
                    const prev = prevInp ? (parseInt(prevInp.value) || 0) : 0;
                    const cur = curInp ? (parseInt(curInp.value) || 0) : 0;
                    const rateKey = fk.replace('demand_', '') + '_rate';
                    setCalc(`${rateKey}_${m}`, prev > 0 ? ((cur / prev) * 100).toFixed(1) + '%' : '');
                });
            }
        });

        // Platform spend totals
        platforms.forEach(p => {
            let total = 0;
            MONTHS.forEach(m => {
                const isLiveGads = (p === 'Google Ads' && liveGadsSpend[m]);
                if (isLiveGads) {
                    total += liveGadsSpend[m] || 0;
                } else {
                    const inp = document.querySelector(`input[data-field="ad_spend"][data-platform="${p}"][data-month="${m}"]`);
                    total += inp ? (parseFloat(inp.value) || 0) : 0;
                }
            });
            setCalc(`spend_total_${p}`, '$' + Math.round(total).toLocaleString());
        });
    }

    function setCalc(key, value) {
        const el = document.querySelector(`.roi-calc[data-calc="${key}"]`);
        if (el) el.textContent = value;
    }

    function setCalcRoas(key, value) {
        const el = document.querySelector(`.roi-calc[data-calc="${key}"]`);
        if (!el) return;
        if (value != null && isFinite(value)) {
            el.textContent = value.toFixed(1) + 'x';
            el.className = 'roi-calc ' + roasClass(value);
        } else {
            el.textContent = '';
            el.className = 'roi-calc';
        }
    }

    function roasClass(v) {
        if (v >= 8) return 'roas-excellent';
        if (v >= 4) return 'roas-good';
        if (v >= 1) return 'roas-warning';
        return 'roas-critical';
    }

    function roiToast(msg) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); }, 3000);
    }

    return { init, loadROIData };
})();

document.addEventListener('DOMContentLoaded', ROIEditor.init);


// ═══════════════════════════════════════════════════════════════════════════
//  Executive Dashboard
// ═══════════════════════════════════════════════════════════════════════════

const ExecDashboard = (() => {
    'use strict';

    let _data = {};

    // ── Show / Hide ───────────────────────────────────────────────────
    function show() {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const execEl = document.getElementById('exec-dashboard');
        if (execEl) execEl.classList.remove('hidden');
        const btn = document.querySelector('[data-tab="exec"]');
        if (btn) btn.classList.add('active');
        load();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── Load All Data ─────────────────────────────────────────────────
    async function load() {
        const endpoints = [
            fetch('/api/metrics').then(r => r.json()),
            fetch('/api/forecast-weighted').then(r => r.json()),
            fetch('/api/campaigns').then(r => r.json()),
            fetch('/api/pipeline-health').then(r => r.json()),
            fetch('/api/funnel').then(r => r.json()),
            fetch('/api/roi-data').then(r => r.json()),
        ];
        const results = await Promise.allSettled(endpoints);
        const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

        _data = {
            metrics: val(0),
            forecast: val(1),
            campaigns: val(2),
            pipelineHealth: val(3),
            funnel: val(4),
            roiData: val(5),
        };

        renderStatusBar();
        renderRevenueCard();
        renderEfficiencyCard();
        renderPipelineCard();
        renderFunnelCard();
        bindCards();
    }

    // ── Quarter Status Bar ────────────────────────────────────────────
    function renderStatusBar() {
        const m = _data.metrics;
        const f = _data.forecast;
        if (!m) return;

        setText('execQuarter', m.quarter + ' ' + (m.date_range?.start?.substring(0, 4) || ''));
        const daysEl = document.getElementById('execDays');
        if (daysEl) {
            daysEl.textContent = m.days_remaining + ' days remaining';
            daysEl.className = 'exec-status-bar__days' +
                (m.days_remaining <= 14 ? ' exec-days--red' : m.days_remaining <= 30 ? ' exec-days--amber' : '');
        }

        const fill = document.getElementById('execProgressFill');
        const label = document.getElementById('execProgressLabel');
        if (fill) {
            const pct = Math.min(m.pct_complete, 100);
            setTimeout(() => fill.style.width = pct + '%', 50);
            fill.className = 'exec-progress-fill' +
                (m.status === 'on_track' ? ' exec-fill--green' : m.status === 'monitor' ? ' exec-fill--amber' : ' exec-fill--red');
        }
        if (label) {
            label.textContent = '$' + Math.round(m.pipeline_value).toLocaleString() +
                ' of $' + Math.round(m.revenue_target).toLocaleString() +
                '  ·  ' + m.pct_complete.toFixed(1) + '%';
        }

        const badge = document.getElementById('execStatusBadge');
        if (badge) {
            const labels = { on_track: 'ON TRACK', monitor: 'MONITOR', behind: 'BEHIND PACE' };
            badge.textContent = labels[m.status] || m.status;
            badge.className = 'exec-status-badge exec-badge--' + m.status;
        }

        const fcEl = document.getElementById('execForecast');
        if (fcEl && f) {
            const gap = Math.max((m.revenue_target || 0) - (m.pipeline_value || 0), 0);
            fcEl.innerHTML = `Forecast: <strong>$${Math.round(f.weighted_forecast || 0).toLocaleString()}</strong> weighted` +
                `  ·  Coverage: <strong>${(f.coverage_ratio || 0).toFixed(1)}x</strong>` +
                `  ·  Gap: <strong>$${Math.round(gap).toLocaleString()}</strong>`;
        }
    }

    // ── Revenue Card ──────────────────────────────────────────────────
    function renderRevenueCard() {
        const card = document.getElementById('execCardRevenue');
        const m = _data.metrics;
        if (!card) return;
        if (!m) { card.innerHTML = cardError('Revenue data unavailable'); return; }

        const pct = m.pct_complete || 0;
        const status = m.status || 'behind';
        card.className = 'exec-card exec-card--' + status;
        card.innerHTML = `
            <div class="exec-card-title">Revenue vs Target</div>
            <div class="exec-card-metric">$${Math.round(m.pipeline_value).toLocaleString()}</div>
            <div class="exec-card-secondary">of $${fmtCompact(m.revenue_target)} target · ${pct.toFixed(1)}%</div>
            <div class="exec-card-secondary">${m.deals || 0} deals · ${m.contacts || 0} contacts</div>
            <canvas class="exec-sparkline" id="execSparkline" width="240" height="50"></canvas>
            <div class="exec-card-link">View Details &rarr;</div>`;
        renderSparkline();
    }

    function renderSparkline() {
        const canvas = document.getElementById('execSparkline');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Use forecast by_close_date as data points, fall back to simple curve
        const f = _data.forecast;
        let points = [];
        if (f && f.by_close_date && f.by_close_date.length > 1) {
            points = f.by_close_date.map(d => d.weighted_value || 0);
        } else {
            // Generate a simple 6-point placeholder from pipeline value
            const val = _data.metrics?.pipeline_value || 0;
            for (let i = 0; i < 6; i++) points.push(val * (0.3 + Math.random() * 0.7));
        }
        if (points.length < 2) return;

        const max = Math.max(...points, 1);
        const step = w / (points.length - 1);
        const pad = 4;

        ctx.beginPath();
        ctx.strokeStyle = '#ADC837';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        points.forEach((v, i) => {
            const x = i * step;
            const y = h - pad - ((v / max) * (h - pad * 2));
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Fill gradient
        const last = points.length - 1;
        ctx.lineTo(last * step, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(173,200,55,0.25)');
        grad.addColorStop(1, 'rgba(173,200,55,0)');
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // ── Efficiency Card ───────────────────────────────────────────────
    function renderEfficiencyCard() {
        const card = document.getElementById('execCardEfficiency');
        const c = _data.campaigns;
        const roi = _data.roiData;
        if (!card) return;
        if (!c) { card.innerHTML = cardError('Campaign data unavailable'); return; }

        const camps = c.campaigns || [];
        const totalSpend = camps.reduce((s, x) => s + (x.cost || 0), 0);
        const totalConv = camps.reduce((s, x) => s + (x.conversions || 0), 0);
        const avgCpa = totalConv > 0 ? totalSpend / totalConv : 0;
        const ltv = roi?.ltv_per_conversion || 29000;
        const ltvRev = totalConv * ltv;
        const roas = totalSpend > 0 ? ltvRev / totalSpend : 0;

        const cpaStatus = avgCpa === 0 ? 'on_track' : avgCpa <= 100 ? 'on_track' : avgCpa <= 200 ? 'monitor' : 'behind';
        card.className = 'exec-card exec-card--' + cpaStatus;
        card.innerHTML = `
            <div class="exec-card-title">Marketing Efficiency</div>
            <div class="exec-card-metric">${roas > 0 ? roas.toFixed(1) + 'x' : '—'} <span class="exec-card-metric-label">ROAS</span></div>
            <div class="exec-card-secondary">CPA: $${Math.round(avgCpa).toLocaleString()} ${cpaIcon(cpaStatus)}</div>
            <div class="exec-card-secondary">Spend: $${Math.round(totalSpend).toLocaleString()}</div>
            <div class="exec-card-secondary">${totalConv} conversions · ${camps.length} campaigns</div>
            <div class="exec-card-link">View Details &rarr;</div>`;
    }

    // ── Pipeline Card ─────────────────────────────────────────────────
    function renderPipelineCard() {
        const card = document.getElementById('execCardPipeline');
        const ph = _data.pipelineHealth;
        if (!card) return;
        if (!ph || ph.error) { card.innerHTML = cardError('Pipeline data unavailable'); return; }

        const totalDeals = ph.total_deals || 0;
        const stalled = ph.stalled_deals?.length || 0;
        const score = ph.health_score ?? ph.score ?? null;
        const avgVel = ph.avg_velocity_days ?? ph.velocity?.avg_days ?? null;
        const status = score != null ? (score >= 70 ? 'on_track' : score >= 40 ? 'monitor' : 'behind') : 'monitor';
        card.className = 'exec-card exec-card--' + status;
        card.innerHTML = `
            <div class="exec-card-title">Pipeline Health</div>
            <div class="exec-card-metric">${totalDeals} <span class="exec-card-metric-label">Open Deals</span></div>
            <div class="exec-card-secondary">${stalled > 0 ? stalled + ' Stalled &#9888;' : 'No stalled deals'}</div>
            ${score != null ? `<div class="exec-card-secondary">Health Score: ${Math.round(score)}%</div>` : ''}
            ${avgVel != null ? `<div class="exec-card-secondary">Avg velocity: ${avgVel.toFixed(1)} days</div>` : ''}
            <div class="exec-card-link">View Details &rarr;</div>`;
    }

    // ── Funnel Card ───────────────────────────────────────────────────
    function renderFunnelCard() {
        const card = document.getElementById('execCardFunnel');
        const f = _data.funnel;
        if (!card) return;
        if (!f) { card.innerHTML = cardError('Funnel data unavailable'); return; }

        const stages = f.stages || [];
        const rates = f.conversion_rates || {};
        const overallRate = rates.overall != null ? (rates.overall * 100).toFixed(1) + '%' : '—';
        const topStages = stages.slice(0, 4);
        const funnelLine = topStages.map(s => `${s.name || s.stage}: ${s.count}`).join(' → ');
        const status = (rates.overall || 0) >= 0.1 ? 'on_track' : (rates.overall || 0) >= 0.05 ? 'monitor' : 'behind';
        card.className = 'exec-card exec-card--' + status;
        card.innerHTML = `
            <div class="exec-card-title">Funnel Conversion</div>
            <div class="exec-card-metric">${overallRate} <span class="exec-card-metric-label">Overall</span></div>
            <div class="exec-card-secondary exec-funnel-flow">${funnelLine || 'No funnel data'}</div>
            <div class="exec-card-secondary">Avg deal: $${Math.round(f.avg_deal_size || 0).toLocaleString()}</div>
            <div class="exec-card-link">View Details &rarr;</div>`;
    }

    // ── Card click → modal ────────────────────────────────────────────
    function bindCards() {
        document.querySelectorAll('.exec-card[data-modal]').forEach(card => {
            card.onclick = () => openModal(card.dataset.modal);
        });
    }

    // ── Modal System ──────────────────────────────────────────────────
    function openModal(type) {
        const overlay = document.getElementById('execModal');
        const title = document.getElementById('execModalTitle');
        const body = document.getElementById('execModalBody');
        if (!overlay) return;

        const titles = {
            revenue: 'Revenue vs Target',
            efficiency: 'Marketing Efficiency',
            pipeline: 'Pipeline Health',
            funnel: 'Funnel Conversion',
        };
        title.textContent = titles[type] || type;
        body.innerHTML = '<div class="exec-modal-loading">Loading...</div>';
        overlay.classList.add('exec-modal-open');
        document.body.style.overflow = 'hidden';

        // Close handlers
        document.getElementById('execModalClose').onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        // Render content
        switch (type) {
            case 'revenue': renderRevenueModal(body); break;
            case 'efficiency': renderEfficiencyModal(body); break;
            case 'pipeline': renderPipelineModal(body); break;
            case 'funnel': renderFunnelModal(body); break;
        }
    }

    function closeModal() {
        const overlay = document.getElementById('execModal');
        if (overlay) overlay.classList.remove('exec-modal-open');
        document.body.style.overflow = '';
    }

    // ── Revenue Modal ─────────────────────────────────────────────────
    function renderRevenueModal(body) {
        const m = _data.metrics;
        const f = _data.forecast;
        if (!m) { body.innerHTML = '<p>No revenue data available.</p>'; return; }

        const gap = Math.max((m.revenue_target || 0) - (m.pipeline_value || 0), 0);
        const dailyPace = m.days_remaining > 0 ? gap / m.days_remaining : 0;

        let forecastHtml = '';
        if (f && f.by_close_date?.length) {
            forecastHtml = `<h3>Forecast by Close Date</h3>
            <table class="exec-modal-table"><thead><tr><th>Month</th><th>Deals</th><th>Raw Value</th><th>Weighted</th></tr></thead><tbody>` +
            f.by_close_date.map(d => `<tr><td>${d.month}</td><td>${d.deals}</td><td>$${Math.round(d.raw_value).toLocaleString()}</td><td>$${Math.round(d.weighted_value).toLocaleString()}</td></tr>`).join('') +
            `</tbody></table>`;
        }

        body.innerHTML = `
            <div class="exec-modal-kpi-row">
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Pipeline Value</div><div class="exec-modal-kpi-value">$${Math.round(m.pipeline_value).toLocaleString()}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Target</div><div class="exec-modal-kpi-value">$${Math.round(m.revenue_target).toLocaleString()}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Gap</div><div class="exec-modal-kpi-value">$${Math.round(gap).toLocaleString()}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Progress</div><div class="exec-modal-kpi-value">${m.pct_complete.toFixed(1)}%</div></div>
            </div>
            <div class="exec-modal-progress-bar"><div class="exec-modal-progress-fill" style="width:${Math.min(m.pct_complete, 100)}%"></div></div>
            <div class="exec-modal-section">
                <h3>Required Pace</h3>
                <p><strong>$${Math.round(dailyPace).toLocaleString()}</strong> per day needed to close the gap in <strong>${m.days_remaining}</strong> days</p>
                <p>Deals: <strong>${m.deals}</strong> · Contacts: <strong>${m.contacts}</strong></p>
            </div>
            <div class="exec-modal-section">${forecastHtml}</div>
            ${f ? `<div class="exec-modal-section"><h3>Coverage</h3><p>Weighted forecast: <strong>$${Math.round(f.weighted_forecast).toLocaleString()}</strong> · Coverage ratio: <strong>${f.coverage_ratio?.toFixed(1) || '0'}x</strong></p></div>` : ''}
            <div class="exec-modal-nav" onclick="ExecDashboard.closeModal(); MICDashboard.switchTab('ac');">Open in ActiveCampaign Metrics tab &rarr;</div>`;
    }

    // ── Efficiency Modal ──────────────────────────────────────────────
    function renderEfficiencyModal(body) {
        const c = _data.campaigns;
        const roi = _data.roiData;
        if (!c) { body.innerHTML = '<p>No campaign data available.</p>'; return; }

        const camps = c.campaigns || [];
        const totalSpend = camps.reduce((s, x) => s + (x.cost || 0), 0);
        const totalConv = camps.reduce((s, x) => s + (x.conversions || 0), 0);
        const ltv = roi?.ltv_per_conversion || 29000;
        const roas = totalSpend > 0 ? (totalConv * ltv) / totalSpend : 0;

        let tableHtml = camps.map(cp => `<tr>
            <td>${escapeHtml(cp.name)}</td>
            <td>$${Math.round(cp.cost).toLocaleString()}</td>
            <td>${cp.conversions}</td>
            <td>$${Math.round(cp.cpa).toLocaleString()}</td>
            <td><span class="exec-cpa-pill exec-cpa-pill--${cp.cpa_status}">${cp.cpa_status}</span></td>
        </tr>`).join('');

        body.innerHTML = `
            <div class="exec-modal-kpi-row">
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Total Spend</div><div class="exec-modal-kpi-value">$${Math.round(totalSpend).toLocaleString()}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Conversions</div><div class="exec-modal-kpi-value">${totalConv}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">ROAS</div><div class="exec-modal-kpi-value">${roas.toFixed(1)}x</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Avg CPA</div><div class="exec-modal-kpi-value">$${totalConv > 0 ? Math.round(totalSpend / totalConv).toLocaleString() : '—'}</div></div>
            </div>
            <div class="exec-modal-section">
                <h3>Campaign Breakdown</h3>
                <table class="exec-modal-table"><thead><tr><th>Campaign</th><th>Spend</th><th>Conv</th><th>CPA</th><th>Status</th></tr></thead>
                <tbody>${tableHtml || '<tr><td colspan="5">No campaigns</td></tr>'}</tbody></table>
            </div>
            <div class="exec-modal-nav" onclick="ExecDashboard.closeModal(); MICDashboard.switchTab('gads');">Open in Google Ads Metrics tab &rarr;</div>`;
    }

    // ── Pipeline Modal ────────────────────────────────────────────────
    function renderPipelineModal(body) {
        const ph = _data.pipelineHealth;
        if (!ph || ph.error) { body.innerHTML = '<p>Pipeline data unavailable.</p>'; return; }

        const stalled = ph.stalled_deals || [];
        const byStage = ph.by_stage || ph.stages || [];
        const score = ph.health_score ?? ph.score ?? null;

        let stalledHtml = stalled.slice(0, 15).map(d => `<tr>
            <td>${escapeHtml(d.title || d.name || 'Deal')}</td>
            <td>${d.stage_name || d.stage || '—'}</td>
            <td>${d.days_stalled || d.days_in_stage || '—'}</td>
            <td>$${Math.round(parseFloat(d.value || 0)).toLocaleString()}</td>
            <td>${escapeHtml(d.owner_name || d.owner || '—')}</td>
        </tr>`).join('');

        let stageHtml = byStage.map(s => `<tr>
            <td>${escapeHtml(s.name || s.stage_name || '—')}</td>
            <td>${s.deal_count ?? s.deals ?? '—'}</td>
            <td>$${Math.round(parseFloat(s.total_value || s.value || 0)).toLocaleString()}</td>
        </tr>`).join('');

        body.innerHTML = `
            ${score != null ? `<div class="exec-modal-kpi-row">
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Health Score</div><div class="exec-modal-kpi-value">${Math.round(score)}%</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Total Deals</div><div class="exec-modal-kpi-value">${ph.total_deals || 0}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Stalled</div><div class="exec-modal-kpi-value">${stalled.length}</div></div>
            </div>` : ''}
            ${stalled.length ? `<div class="exec-modal-section"><h3>Stalled Deals</h3>
            <table class="exec-modal-table"><thead><tr><th>Deal</th><th>Stage</th><th>Days</th><th>Value</th><th>Owner</th></tr></thead>
            <tbody>${stalledHtml}</tbody></table></div>` : ''}
            ${byStage.length ? `<div class="exec-modal-section"><h3>By Stage</h3>
            <table class="exec-modal-table"><thead><tr><th>Stage</th><th>Deals</th><th>Value</th></tr></thead>
            <tbody>${stageHtml}</tbody></table></div>` : ''}
            <div class="exec-modal-nav" onclick="ExecDashboard.closeModal(); MICDashboard.switchTab('ac');">Open in ActiveCampaign Metrics tab &rarr;</div>`;
    }

    // ── Funnel Modal ──────────────────────────────────────────────────
    function renderFunnelModal(body) {
        const f = _data.funnel;
        if (!f) { body.innerHTML = '<p>Funnel data unavailable.</p>'; return; }

        const stages = f.stages || [];
        const maxCount = Math.max(...stages.map(s => s.count || 0), 1);
        let barsHtml = stages.map(s => {
            const pct = ((s.count || 0) / maxCount * 100).toFixed(0);
            return `<div class="exec-funnel-bar-row">
                <span class="exec-funnel-bar-label">${escapeHtml(s.name || s.stage)}</span>
                <div class="exec-funnel-bar-track"><div class="exec-funnel-bar-fill" style="width:${pct}%"></div></div>
                <span class="exec-funnel-bar-count">${s.count || 0}</span>
                <span class="exec-funnel-bar-rate">${s.rate_from_previous != null ? (s.rate_from_previous * 100).toFixed(1) + '%' : ''}</span>
            </div>`;
        }).join('');

        const rates = f.conversion_rates || {};
        body.innerHTML = `
            <div class="exec-modal-kpi-row">
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Pipeline Value</div><div class="exec-modal-kpi-value">$${Math.round(f.pipeline_value || 0).toLocaleString()}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Avg Deal Size</div><div class="exec-modal-kpi-value">$${Math.round(f.avg_deal_size || 0).toLocaleString()}</div></div>
                <div class="exec-modal-kpi"><div class="exec-modal-kpi-label">Overall Rate</div><div class="exec-modal-kpi-value">${rates.overall != null ? (rates.overall * 100).toFixed(1) + '%' : '—'}</div></div>
            </div>
            <div class="exec-modal-section"><h3>Funnel Stages</h3>${barsHtml || '<p>No stages</p>'}</div>
            <div class="exec-modal-nav" onclick="ExecDashboard.closeModal(); MICDashboard.switchTab('ac');">Open in ActiveCampaign Metrics tab &rarr;</div>`;
    }

    // ── Helpers ────────────────────────────────────────────────────────
    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function fmtCompact(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
        return n?.toLocaleString() || '0';
    }
    function cpaIcon(status) {
        return status === 'on_track' ? '<span class="exec-cpa-dot exec-cpa-dot--green"></span>' :
               status === 'monitor' ? '<span class="exec-cpa-dot exec-cpa-dot--amber"></span>' :
               '<span class="exec-cpa-dot exec-cpa-dot--red"></span>';
    }
    function cardError(msg) { return `<div class="exec-card-title">Error</div><div class="exec-card-secondary">${msg}</div>`; }

    return { show, closeModal, load };
})();

// Boot exec dashboard as default view
document.addEventListener('DOMContentLoaded', () => {
    // Activate Overview tab button
    const execBtn = document.querySelector('[data-tab="exec"]');
    if (execBtn) execBtn.classList.add('active');
    // Remove active from AC tab button (was set in HTML)
    document.querySelectorAll('.tab-btn:not([data-tab="exec"])').forEach(b => b.classList.remove('active'));
    ExecDashboard.show();
});


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

// ── Date Range Picker ─────────────────────────────────────────────────────
class DateRangePicker {
    constructor(containerId, onChange) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.onChange = onChange;
        this.currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        this.hoverDate = null;
        this.startDate = null;
        this.endDate = null;
        this.selecting = false;
        this.isOpen = false;
        this._boundClose = this._handleOutsideClick.bind(this);
        this._render();
    }

    setValue(startStr, endStr) {
        this.startDate = startStr ? this._parseDate(startStr) : null;
        this.endDate = endStr ? this._parseDate(endStr) : null;
        this.selecting = false;
        this._updateTriggerLabel();
        if (this.isOpen) this._renderCalendar();
    }

    getValue() {
        return {
            start: this.startDate ? this._fmt(this.startDate) : null,
            end: this.endDate ? this._fmt(this.endDate) : null,
        };
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.panel.classList.add('drp-panel--open');
        this._renderCalendar();
        document.addEventListener('mousedown', this._boundClose);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.panel.classList.remove('drp-panel--open');
        document.removeEventListener('mousedown', this._boundClose);
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    destroy() {
        document.removeEventListener('mousedown', this._boundClose);
        if (this.container) this.container.innerHTML = '';
    }

    // ── Private ──────────────────────────────────────────────────────

    _parseDate(str) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    _fmt(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _fmtLabel(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    _sameDay(a, b) {
        return a && b && a.getFullYear() === b.getFullYear() &&
               a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    _isToday(date) {
        return this._sameDay(date, new Date());
    }

    _handleOutsideClick(e) {
        if (!this.container.contains(e.target)) this.close();
    }

    _render() {
        this.container.classList.add('date-range-picker');

        // Trigger button
        this.trigger = document.createElement('button');
        this.trigger.className = 'drp-trigger';
        this.trigger.type = 'button';
        this.trigger.addEventListener('click', () => this.toggle());
        this.container.appendChild(this.trigger);
        this._updateTriggerLabel();

        // Calendar panel
        this.panel = document.createElement('div');
        this.panel.className = 'drp-panel';
        this.container.appendChild(this.panel);
    }

    _updateTriggerLabel() {
        if (!this.trigger) return;
        const startLabel = this.startDate ? this._fmtLabel(this.startDate) : 'Start date';
        const endLabel = this.endDate ? this._fmtLabel(this.endDate) : 'End date';
        this.trigger.innerHTML = `<span class="drp-trigger-icon">\uD83D\uDCC5</span> ${startLabel} <span class="drp-trigger-arrow">\u2192</span> ${endLabel} <span class="drp-trigger-caret">\u25BE</span>`;
    }

    _renderCalendar() {
        const left = this.currentMonth;
        const right = new Date(left.getFullYear(), left.getMonth() + 1, 1);

        this.panel.innerHTML = `
            <div class="drp-months">
                <div class="drp-month">
                    ${this._renderMonthHeader(left, true)}
                    ${this._renderWeekdays()}
                    <div class="drp-days" data-month="left"></div>
                </div>
                <div class="drp-month">
                    ${this._renderMonthHeader(right, false)}
                    ${this._renderWeekdays()}
                    <div class="drp-days" data-month="right"></div>
                </div>
            </div>
            <div class="drp-actions">
                <button type="button" class="drp-clear">Clear</button>
                <button type="button" class="drp-apply">Apply</button>
            </div>`;

        this._fillDays(this.panel.querySelector('[data-month="left"]'), left);
        this._fillDays(this.panel.querySelector('[data-month="right"]'), right);

        // Nav arrows
        this.panel.querySelector('.drp-nav-prev').addEventListener('click', () => {
            this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
            this._renderCalendar();
        });
        this.panel.querySelector('.drp-nav-next').addEventListener('click', () => {
            this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
            this._renderCalendar();
        });

        // Actions
        this.panel.querySelector('.drp-clear').addEventListener('click', () => {
            this.startDate = null;
            this.endDate = null;
            this.selecting = false;
            this._updateTriggerLabel();
            this._renderCalendar();
        });
        this.panel.querySelector('.drp-apply').addEventListener('click', () => {
            if (this.startDate && this.endDate) {
                this._updateTriggerLabel();
                this.close();
                this.onChange(this._fmt(this.startDate), this._fmt(this.endDate));
            }
        });
    }

    _renderMonthHeader(date, showPrev) {
        const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return `<div class="drp-month-header">
            ${showPrev ? '<button type="button" class="drp-nav-btn drp-nav-prev">\u2190</button>' : '<span class="drp-nav-spacer"></span>'}
            <span class="drp-month-title">${label}</span>
            ${!showPrev ? '<button type="button" class="drp-nav-btn drp-nav-next">\u2192</button>' : '<span class="drp-nav-spacer"></span>'}
        </div>`;
    }

    _renderWeekdays() {
        return '<div class="drp-weekdays">' +
            ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<span>${d}</span>`).join('') +
            '</div>';
    }

    _fillDays(grid, monthDate) {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        // Previous month padding
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const el = document.createElement('span');
            el.className = 'drp-day other-month';
            el.textContent = day;
            grid.appendChild(el);
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const el = document.createElement('span');
            el.className = 'drp-day';
            el.textContent = d;

            if (this._isToday(date)) el.classList.add('today');
            if (this._sameDay(date, this.startDate)) el.classList.add('selected-start');
            if (this._sameDay(date, this.endDate)) el.classList.add('selected-end');
            if (this.startDate && this.endDate && date > this.startDate && date < this.endDate) {
                el.classList.add('in-range');
            }

            el.addEventListener('click', () => this._onDayClick(date));
            el.addEventListener('mouseenter', () => this._onDayHover(date));
            grid.appendChild(el);
        }

        // Next month padding
        const totalCells = firstDay + daysInMonth;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let i = 1; i <= remaining; i++) {
            const el = document.createElement('span');
            el.className = 'drp-day other-month';
            el.textContent = i;
            grid.appendChild(el);
        }
    }

    _onDayClick(date) {
        if (!this.selecting) {
            // First click — set start
            this.startDate = date;
            this.endDate = null;
            this.selecting = true;
        } else {
            // Second click — set end
            this.endDate = date;
            this.selecting = false;
            // Swap if needed
            if (this.endDate < this.startDate) {
                [this.startDate, this.endDate] = [this.endDate, this.startDate];
            }
        }
        this._renderCalendar();
    }

    _onDayHover(date) {
        if (!this.selecting || !this.startDate) return;
        // Update range preview
        const days = this.panel.querySelectorAll('.drp-day:not(.other-month)');
        days.forEach(el => {
            el.classList.remove('in-range', 'selected-end');
        });
        let previewStart = this.startDate;
        let previewEnd = date;
        if (previewEnd < previewStart) [previewStart, previewEnd] = [previewEnd, previewStart];

        days.forEach(el => {
            // Reconstruct the date from the element
            const dayNum = parseInt(el.textContent);
            const grid = el.closest('.drp-days');
            const isLeft = grid.dataset.month === 'left';
            const m = isLeft ? this.currentMonth.getMonth() : this.currentMonth.getMonth() + 1;
            const y = isLeft ? this.currentMonth.getFullYear() :
                      (m > 11 ? this.currentMonth.getFullYear() + 1 : this.currentMonth.getFullYear());
            const actualMonth = m > 11 ? 0 : m;
            const cellDate = new Date(y, actualMonth, dayNum);

            if (this._sameDay(cellDate, previewEnd)) {
                el.classList.add('selected-end');
            } else if (cellDate > previewStart && cellDate < previewEnd) {
                el.classList.add('in-range');
            }
        });
    }
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
        <div id="ac-date-picker-container"></div>
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
                if (typeof acPicker !== 'undefined') acPicker.open();
                return;
            }
            document.querySelectorAll('.time-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            TimeState.setPreset(preset);
            updateActivePeriodLabel();
        });
    });

    document.getElementById('compareMode')?.addEventListener('change', (e) => {
        TimeState.setCompareMode(e.target.value);
    });
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
        <div id="gads-date-picker-container"></div>
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
                if (typeof gadsPicker !== 'undefined') gadsPicker.open();
                return;
            }
            document.querySelectorAll('.time-preset-gads')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            GadsTimeState.setPreset(preset);
            updateGadsActivePeriodLabel();
        });
    });
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

// ── Date Picker Instances ─────────────────────────────────────────────────
let acPicker, gadsPicker;

// ── Boot Time Intelligence ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadTimeIntelligenceStyles();
    injectTimeIntelligenceUI();

    // AC date picker
    acPicker = new DateRangePicker('ac-date-picker-container', (start, end) => {
        document.querySelectorAll('.time-preset').forEach(b => b.classList.remove('active'));
        document.querySelector('.time-preset[data-preset="custom"]')?.classList.add('active');
        TimeState.setCustomRange(start, end);
        updateActivePeriodLabel();
    });

    wireTimeControls();
    TimeState.restore();
    initSectionSubscriptions();
    updateActivePeriodLabel();
    TimeState._notify();

    // Sync AC picker with restored state
    if (TimeState.preset === 'custom' && TimeState.startDate && TimeState.endDate) {
        acPicker.setValue(TimeState.startDate, TimeState.endDate);
    }

    // Google Ads time bar
    injectGadsTimeBar();

    gadsPicker = new DateRangePicker('gads-date-picker-container', (start, end) => {
        document.querySelectorAll('.time-preset-gads').forEach(b => b.classList.remove('active'));
        document.querySelector('.time-preset-gads[data-preset="custom_gads"]')?.classList.add('active');
        GadsTimeState.setCustomRange(start, end);
        updateGadsActivePeriodLabel();
    });

    wireGadsTimeControls();
    GadsTimeState.restore();
    initGadsTimeSubscriptions();
    updateGadsActivePeriodLabel();

    // Sync Gads picker with restored state
    if (GadsTimeState.preset === 'custom_gads' && GadsTimeState.startDate && GadsTimeState.endDate) {
        gadsPicker.setValue(GadsTimeState.startDate, GadsTimeState.endDate);
    }
});
