/* ═══════════════════════════════════════════════════════════════════════════
   Cliniconex Marketing Intelligence Center — Chart Configurations
   ═══════════════════════════════════════════════════════════════════════════ */

const MICCharts = (() => {
    'use strict';

    // ── Theme-aware colors ──────────────────────────────────────────────
    const getColors = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            green:      '#ADC837',
            greenLight: '#C6DC65',
            teal:       '#02475A',
            cyan:       '#029FB5',
            purple:     '#522E76',
            danger:     '#EF4444',
            warning:    '#F59E0B',
            success:    '#10B981',
            text:       isDark ? '#C0C4CC' : '#404041',
            textMuted:  isDark ? '#7C8190' : '#6B7280',
            grid:       isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            tooltipBg:  isDark ? '#1E2130' : '#FFFFFF',
            tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        };
    };

    // ── Shared chart defaults ───────────────────────────────────────────
    const baseOptions = () => {
        const c = getColors();
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: c.tooltipBg,
                    titleColor: c.text,
                    bodyColor: c.textMuted,
                    borderColor: c.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { family: 'Nunito Sans', weight: '700', size: 13 },
                    bodyFont: { family: 'Nunito Sans', weight: '600', size: 12 },
                    displayColors: true,
                    boxPadding: 4,
                },
            },
            scales: {
                x: {
                    grid: { color: c.grid, drawBorder: false },
                    ticks: {
                        color: c.textMuted,
                        font: { family: 'Nunito Sans', size: 11, weight: '600' },
                        maxRotation: 0,
                    },
                    border: { display: false },
                },
                y: {
                    grid: { color: c.grid, drawBorder: false },
                    ticks: {
                        color: c.textMuted,
                        font: { family: 'Nunito Sans', size: 11, weight: '600' },
                    },
                    border: { display: false },
                },
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart',
            },
        };
    };

    // ── Chart instances registry ────────────────────────────────────────
    const instances = {};

    const destroy = (id) => {
        if (instances[id]) {
            instances[id].destroy();
            delete instances[id];
        }
    };

    const destroyAll = () => {
        Object.keys(instances).forEach(destroy);
    };

    // ── Spend chart ─────────────────────────────────────────────────────
    const createSpendChart = (canvasId, data) => {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const c = getColors();
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, 'rgba(173,200,55,0.3)');
        gradient.addColorStop(1, 'rgba(173,200,55,0.01)');

        const opts = baseOptions();
        opts.scales.y.ticks.callback = (v) => '$' + v.toLocaleString();
        opts.plugins.tooltip.callbacks = {
            label: (ctx) => ' $' + ctx.parsed.y.toLocaleString(),
        };

        instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'Daily Spend',
                    data: data.map(d => d.spend),
                    borderColor: c.green,
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: c.green,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                }],
            },
            options: opts,
        });

        return instances[canvasId];
    };

    // ── CPA chart ───────────────────────────────────────────────────────
    const createCPAChart = (canvasId, data) => {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const c = getColors();
        const opts = baseOptions();
        opts.scales.y.ticks.callback = (v) => '$' + v;
        opts.plugins.tooltip.callbacks = {
            label: (ctx) => ' $' + ctx.parsed.y.toFixed(2),
        };

        instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'CPA',
                    data: data.map(d => d.cpa),
                    borderColor: c.cyan,
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: c.cyan,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                }],
            },
            options: opts,
        });

        return instances[canvasId];
    };

    // ── Conversion Rate chart ───────────────────────────────────────────
    const createConversionChart = (canvasId, data) => {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const c = getColors();
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, 'rgba(82,46,118,0.25)');
        gradient.addColorStop(1, 'rgba(82,46,118,0.01)');

        const opts = baseOptions();
        opts.scales.y.ticks.callback = (v) => v + '%';
        opts.plugins.tooltip.callbacks = {
            label: (ctx) => ' ' + ctx.parsed.y.toFixed(2) + '%',
        };

        instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'Conversion Rate',
                    data: data.map(d => d.conversion_rate),
                    borderColor: c.purple,
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: c.purple,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                }],
            },
            options: opts,
        });

        return instances[canvasId];
    };

    // ── CTR chart ───────────────────────────────────────────────────────
    const createCTRChart = (canvasId, data) => {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const c = getColors();
        const opts = baseOptions();
        opts.scales.y.ticks.callback = (v) => v + '%';
        opts.plugins.tooltip.callbacks = {
            label: (ctx) => ' ' + ctx.parsed.y.toFixed(2) + '%',
        };

        instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'CTR',
                    data: data.map(d => d.ctr),
                    backgroundColor: data.map((_, i) => {
                        const ratio = i / data.length;
                        return `rgba(2,159,181,${0.3 + ratio * 0.5})`;
                    }),
                    borderRadius: 4,
                    borderSkipped: false,
                    maxBarThickness: 20,
                }],
            },
            options: opts,
        });

        return instances[canvasId];
    };

    // ── Sparkline (mini chart for table rows) ───────────────────────────
    const createSparkline = (canvas, data, color) => {
        if (!canvas) return null;
        const c = color || getColors().green;

        return new Chart(canvas, {
            type: 'line',
            data: {
                labels: data.map((_, i) => i),
                datasets: [{
                    data: data,
                    borderColor: c,
                    borderWidth: 1.5,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false,
                }],
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                animation: { duration: 800, easing: 'easeOutQuart' },
                elements: { line: { borderCapStyle: 'round' } },
            },
        });
    };

    // ── Public API ──────────────────────────────────────────────────────
    return {
        createSpendChart,
        createCPAChart,
        createConversionChart,
        createCTRChart,
        createSparkline,
        destroyAll,
        destroy,
        instances,
        getColors,
        baseOptions,
    };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   Agent 4 — Global Render Functions for Dashboard Sections
   ═══════════════════════════════════════════════════════════════════════════ */

var BRAND = {
    green:      '#ADC837',
    greenLight: '#C6DC65',
    teal:       '#02475A',
    cyan:       '#029FB5',
    purple:     '#522E76',
    dgrey:      '#404041',
    lgrey:      '#F4F4F4',
    neutral:    '#E1E6EF',
    error:      '#F44336',
    success:    '#4CAF50',
    warning:    '#BF6A02',
};

var BRAND_PALETTE = [BRAND.green, BRAND.teal, BRAND.cyan, BRAND.purple, BRAND.greenLight, '#888', '#bbb'];

// ── Comparison helper ─────────────────────────────────────────────────
async function fetchComparison(params) {
    if (typeof TimeState === 'undefined' || TimeState.compareMode === 'none') return null;
    try {
        const resp = await fetch(`/api/compare?mode=${TimeState.compareMode}&${params}`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

// ── Sortable table helpers ────────────────────────────────────────────
function makeSortable(table) {
    table.querySelectorAll('th[data-sort]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            const asc = th.dataset.order !== 'asc';
            table.querySelectorAll('th[data-sort]').forEach(h => {
                h.dataset.order = '';
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            th.dataset.order = asc ? 'asc' : 'desc';
            th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
            sortTableByColumn(table, col, asc);
        });
    });
}

function sortTableByColumn(table, col, asc) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const headers = Array.from(table.querySelectorAll('thead th'));
    const actualIndex = headers.findIndex(th => th.dataset.sort === col);
    if (actualIndex === -1) return;

    rows.sort((a, b) => {
        const cellA = a.children[actualIndex];
        const cellB = b.children[actualIndex];
        if (!cellA || !cellB) return 0;
        let va = cellA.getAttribute('data-value');
        let vb = cellB.getAttribute('data-value');
        if (va !== null && vb !== null) {
            va = parseFloat(va);
            vb = parseFloat(vb);
            if (!isNaN(va) && !isNaN(vb)) return asc ? va - vb : vb - va;
        }
        va = cellA.textContent.trim();
        vb = cellB.textContent.trim();
        const na = parseFloat(va.replace(/[^0-9.\-]/g, ''));
        const nb = parseFloat(vb.replace(/[^0-9.\-]/g, ''));
        if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    rows.forEach(r => tbody.appendChild(r));
}

// ── Shared helpers ────────────────────────────────────────────────────
function _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
}

function _fmtCurrency(val, currency) {
    if (typeof formatCurrency === 'function') return formatCurrency(val, currency);
    const n = Number(val) || 0;
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _emptyState(container, msg) {
    container.innerHTML = `
        <div style="text-align:center;padding:48px 24px;color:var(--text-muted);">
            <div style="font-size:36px;margin-bottom:12px;opacity:0.4;">📊</div>
            <p style="font-size:14px;font-weight:600;">${msg || 'No data available'}</p>
        </div>`;
}

function _tryRenderDelta(el, delta) {
    if (typeof renderDelta === 'function' && delta != null) {
        renderDelta(el, delta);
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. renderPipelineHealth(container, data)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderPipelineHealth(container, data) {
    if (!container) return;
    if (!data || (!data.stages && !data.at_risk_deals)) {
        _emptyState(container, 'No pipeline health data available');
        return;
    }

    const totalOpen = data.total_open || 0;
    const healthScore = data.health_score != null ? data.health_score : 0;
    const atRiskDeals = data.at_risk_deals || [];
    const atRiskCount = atRiskDeals.length;
    const atRiskValue = atRiskDeals.reduce((s, d) => s + (d.value || 0), 0);
    const stages = data.stages || [];

    const healthPct = Math.min(Math.max(healthScore, 0), 100);
    const healthColor = healthPct >= 70 ? BRAND.green : healthPct >= 40 ? BRAND.warning : BRAND.error;

    let html = `
    <div class="pipeline-health-grid">
        <div class="ph-summary-row">
            <div class="ph-summary-item">
                <span class="ph-summary-label">Total Open</span>
                <span class="ph-summary-value" id="ph-total-open">${totalOpen.toLocaleString()}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Health Score</span>
                <div class="health-score-ring" style="--health-pct:${healthPct};--health-color:${healthColor}">
                    <span class="health-score-ring__value">${healthPct}%</span>
                </div>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">At Risk</span>
                <span class="ph-summary-value">${atRiskCount} deals (${_fmtCurrency(atRiskValue)})</span>
            </div>
        </div>
        <div class="ph-body-row">
            <div class="ph-chart-col">
                <h4 class="ph-subtitle">By Stage</h4>
                <div style="height:280px;position:relative;">
                    <canvas id="ph-stage-chart"></canvas>
                </div>
            </div>
            <div class="ph-table-col">
                <h4 class="ph-subtitle">At-Risk Deals</h4>`;

    if (atRiskDeals.length === 0) {
        html += `<p style="color:var(--text-muted);font-size:13px;padding:16px 0;">No at-risk deals</p>`;
    } else {
        const top10 = [...atRiskDeals].sort((a, b) => (b.days_stalled || 0) - (a.days_stalled || 0)).slice(0, 10);
        html += `
                <div class="table-container" style="max-height:320px;overflow-y:auto;">
                <table class="data-table sortable-table">
                    <thead><tr>
                        <th data-sort="deal">Deal</th>
                        <th data-sort="stage">Stage</th>
                        <th data-sort="days" class="num">Days</th>
                        <th data-sort="value" class="num">Value</th>
                    </tr></thead>
                    <tbody>`;
        top10.forEach(deal => {
            const days = deal.days_stalled || 0;
            const rowClass = deal.overdue ? 'risk-row-overdue' : days > 30 ? 'risk-row-stalled' : '';
            const titleHtml = deal.ac_url
                ? `<a href="${_escapeHtml(deal.ac_url)}" target="_blank" rel="noopener noreferrer" class="deal-link">${_escapeHtml(deal.title || deal.name || 'Untitled')}</a>`
                : _escapeHtml(deal.title || deal.name || 'Untitled');
            html += `
                        <tr class="${rowClass}">
                            <td>${titleHtml}</td>
                            <td>${_escapeHtml(deal.stage || '')}</td>
                            <td class="num" data-value="${days}">${days}</td>
                            <td class="num" data-value="${deal.value || 0}">${_fmtCurrency(deal.value)}</td>
                        </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `</div></div></div>`;
    container.innerHTML = html;

    const tbl = container.querySelector('.sortable-table');
    if (tbl) makeSortable(tbl);

    if (stages.length > 0) {
        const ctx = document.getElementById('ph-stage-chart');
        if (ctx) {
            MICCharts.destroy('ph-stage-chart');
            const opts = MICCharts.baseOptions();
            opts.indexAxis = 'y';
            opts.scales.x.stacked = true;
            opts.scales.y.stacked = true;
            opts.plugins.legend = { display: true, position: 'bottom', labels: { font: { family: 'Nunito Sans', size: 11, weight: '600' }, usePointStyle: true, padding: 16 } };
            opts.plugins.tooltip.callbacks = {
                label: function(c) { return ' ' + c.dataset.label + ': ' + c.parsed.x + ' deals'; }
            };

            const labels = stages.map(s => s.name || s.stage || '');
            const healthy = stages.map(s => s.healthy || 0);
            const stalled = stages.map(s => s.stalled || 0);
            const overdue = stages.map(s => s.overdue || 0);

            MICCharts.instances['ph-stage-chart'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Healthy', data: healthy, backgroundColor: BRAND.green, borderRadius: 4, borderSkipped: false },
                        { label: 'Stalled', data: stalled, backgroundColor: BRAND.warning, borderRadius: 4, borderSkipped: false },
                        { label: 'Overdue', data: overdue, backgroundColor: BRAND.error, borderRadius: 4, borderSkipped: false },
                    ],
                },
                options: opts,
            });
        }
    }

    fetchComparison('section=pipeline_health').then(cmp => {
        if (!cmp) return;
        const el = document.getElementById('ph-total-open');
        if (el && cmp.total_open_delta != null) _tryRenderDelta(el, cmp.total_open_delta);
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. renderVelocity(container, data)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderVelocity(container, data) {
    if (!container) return;
    if (!data || !data.stages || data.stages.length === 0) {
        _emptyState(container, 'No velocity data available');
        return;
    }

    const stages = data.stages;
    const fastest = stages.reduce((a, b) => (a.avg_days_in_stage || 999) < (b.avg_days_in_stage || 999) ? a : b);
    const slowest = stages.reduce((a, b) => (a.avg_days_in_stage || 0) > (b.avg_days_in_stage || 0) ? a : b);
    const totalAvg = data.total_avg_days || (stages.reduce((s, st) => s + (st.avg_days_in_stage || 0), 0) / stages.length);
    const creationToClose = data.creation_to_close_avg_days || stages.reduce((s, st) => s + (st.avg_days_in_stage || 0), 0);
    const pipelineName = data.pipeline_name || '';

    let html = `
    <div class="velocity-grid">
        <div class="velocity-chart-col">
            <h4 class="ph-subtitle">Stage Velocity</h4>
            ${pipelineName ? `<p class="ph-subtitle-detail">${_escapeHtml(pipelineName)}</p>` : ''}
            <div style="height:${Math.max(stages.length * 48 + 60, 200)}px;position:relative;">
                <canvas id="velocity-bar-chart"></canvas>
            </div>
        </div>
        <div class="velocity-summary-row">
            <div class="ph-summary-item">
                <span class="ph-summary-label">Fastest Stage</span>
                <span class="ph-summary-value" style="color:${BRAND.green}">${_escapeHtml(fastest.name || fastest.stage || '')}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Slowest Stage</span>
                <span class="ph-summary-value" style="color:${BRAND.error}">${_escapeHtml(slowest.name || slowest.stage || '')}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Total Avg</span>
                <span class="ph-summary-value" id="velocity-total-avg">${totalAvg.toFixed(1)} days</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Avg Time: Creation → Close</span>
                <span class="ph-summary-value">${creationToClose.toFixed(1)} days</span>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;

    const ctx = document.getElementById('velocity-bar-chart');
    if (ctx) {
        MICCharts.destroy('velocity-bar-chart');
        const opts = MICCharts.baseOptions();
        opts.indexAxis = 'y';
        opts.plugins.legend = { display: false };
        opts.scales.x.title = { display: true, text: 'Avg Days in Stage', font: { family: 'Nunito Sans', size: 11, weight: '600' }, color: MICCharts.getColors().textMuted };
        const totalDays = stages.reduce((s, st) => s + (st.avg_days_in_stage || 0), 0);
        opts.plugins.tooltip.callbacks = {
            title: function(items) {
                return stages[items[0].dataIndex]?.stage_name || stages[items[0].dataIndex]?.name || '';
            },
            label: function(c) {
                const stageData = stages[c.dataIndex];
                const avg = stageData.avg_days_in_stage || 0;
                const pctOfTotal = totalDays > 0 ? ((avg / totalDays) * 100).toFixed(1) : '0';
                const lines = [
                    ` Avg: ${c.parsed.x} days`,
                    ` Deals: ${stageData.deal_count || 0}`,
                    ` ${pctOfTotal}% of total pipeline time`,
                ];
                const median = stageData.median_days_in_stage;
                if (median != null) lines.splice(1, 0, ` Median: ${median} days`);
                return lines;
            }
        };

        const labels = stages.map(s => s.stage_name || s.name || s.stage || '');
        const avgDays = stages.map(s => s.avg_days_in_stage || 0);
        const colors = avgDays.map(d => d < 7 ? BRAND.green : d <= 21 ? BRAND.warning : BRAND.error);

        MICCharts.instances['velocity-bar-chart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Avg Days',
                    data: avgDays,
                    backgroundColor: colors,
                    borderRadius: 4,
                    borderSkipped: false,
                    maxBarThickness: 28,
                }],
            },
            options: opts,
        });
    }

    fetchComparison('section=velocity').then(cmp => {
        if (!cmp) return;
        const el = document.getElementById('velocity-total-avg');
        if (el && cmp.total_avg_delta != null) _tryRenderDelta(el, cmp.total_avg_delta);
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. renderAcquisition(container, data)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderAcquisition(container, data) {
    if (!container) return;
    if (!data || (!data.by_source && !data.by_medium && !data.campaigns)) {
        _emptyState(container, 'No acquisition data available');
        return;
    }

    const sources = data.by_source || [];
    const mediums = data.by_medium || [];
    const campaigns = (data.campaigns || []).slice(0, 20);
    const totalContacts = data.total_contacts || campaigns.reduce((s, c) => s + (c.count || 0), 0) || 1;

    function topN(arr, n) {
        const sorted = [...arr].sort((a, b) => (b.count || 0) - (a.count || 0));
        const top = sorted.slice(0, n);
        const rest = sorted.slice(n);
        const otherCount = rest.reduce((s, r) => s + (r.count || 0), 0);
        if (otherCount > 0) top.push({ name: 'Other', count: otherCount });
        return top;
    }

    const topSources = topN(sources, 6);
    const topMediums = topN(mediums, 6);

    let html = `
    <div class="acquisition-grid">
        <div class="acq-donuts-row">
            <div class="acq-donut-col">
                <h4 class="ph-subtitle">By Source</h4>
                <div style="height:260px;position:relative;">
                    <canvas id="acq-source-donut"></canvas>
                </div>
            </div>
            <div class="acq-donut-col">
                <h4 class="ph-subtitle">By Medium</h4>
                <div style="height:260px;position:relative;">
                    <canvas id="acq-medium-donut"></canvas>
                </div>
            </div>
        </div>
        <div class="acq-campaigns-table">
            <h4 class="ph-subtitle">Top Campaigns</h4>`;

    if (campaigns.length === 0) {
        html += `<p style="color:var(--text-muted);font-size:13px;padding:16px 0;">No campaign data</p>`;
    } else {
        html += `
            <div class="table-container">
            <table class="data-table sortable-table">
                <thead><tr>
                    <th data-sort="campaign">Campaign</th>
                    <th data-sort="source">Source</th>
                    <th data-sort="medium">Medium</th>
                    <th data-sort="count" class="num">Count</th>
                    <th data-sort="pct" class="num">% of Total</th>
                </tr></thead>
                <tbody>`;
        campaigns.forEach(c => {
            const pct = totalContacts > 0 ? ((c.count || 0) / totalContacts * 100).toFixed(1) : '0.0';
            html += `
                    <tr>
                        <td>${_escapeHtml(c.name || c.campaign || '')}</td>
                        <td>${_escapeHtml(c.source || '')}</td>
                        <td>${_escapeHtml(c.medium || '')}</td>
                        <td class="num" data-value="${c.count || 0}">${(c.count || 0).toLocaleString()}</td>
                        <td class="num" data-value="${pct}">${pct}%</td>
                    </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;

    const tbl = container.querySelector('.sortable-table');
    if (tbl) makeSortable(tbl);

    const srcCtx = document.getElementById('acq-source-donut');
    if (srcCtx && topSources.length > 0) {
        MICCharts.destroy('acq-source-donut');
        MICCharts.instances['acq-source-donut'] = new Chart(srcCtx, {
            type: 'doughnut',
            data: {
                labels: topSources.map(s => s.name || 'Unknown'),
                datasets: [{
                    data: topSources.map(s => s.count || 0),
                    backgroundColor: BRAND_PALETTE.slice(0, topSources.length),
                    borderWidth: 2,
                    borderColor: 'var(--bg-card)',
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'right', labels: { font: { family: 'Nunito Sans', size: 11, weight: '600' }, usePointStyle: true, padding: 10 } },
                    tooltip: { callbacks: { label: function(c) { return ` ${c.label}: ${c.parsed.toLocaleString()}`; } } },
                },
                cutout: '60%',
            },
        });
    }

    const medCtx = document.getElementById('acq-medium-donut');
    if (medCtx && topMediums.length > 0) {
        MICCharts.destroy('acq-medium-donut');
        MICCharts.instances['acq-medium-donut'] = new Chart(medCtx, {
            type: 'doughnut',
            data: {
                labels: topMediums.map(m => m.name || 'Unknown'),
                datasets: [{
                    data: topMediums.map(m => m.count || 0),
                    backgroundColor: BRAND_PALETTE.slice(0, topMediums.length),
                    borderWidth: 2,
                    borderColor: 'var(--bg-card)',
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'right', labels: { font: { family: 'Nunito Sans', size: 11, weight: '600' }, usePointStyle: true, padding: 10 } },
                    tooltip: { callbacks: { label: function(c) { return ` ${c.label}: ${c.parsed.toLocaleString()}`; } } },
                },
                cutout: '60%',
            },
        });
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. renderRepPerformance(container, data)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderRepPerformance(container, data) {
    if (!container) return;
    if (!data || !data.reps || data.reps.length === 0) {
        _emptyState(container, 'No rep performance data available');
        return;
    }

    const reps = data.reps;

    function winRatePill(rate) {
        const pct = (rate * 100).toFixed(0);
        const cls = rate >= 0.5 ? 'win-rate-pill--green' : rate >= 0.25 ? 'win-rate-pill--amber' : 'win-rate-pill--red';
        return `<span class="win-rate-pill ${cls}">${pct}%</span>`;
    }

    let html = `
    <div class="rep-perf-grid">
        <div class="rep-table-col">
            <h4 class="ph-subtitle">Rep Leaderboard</h4>
            <div class="table-container">
            <table class="data-table sortable-table">
                <thead><tr>
                    <th data-sort="rep">Rep</th>
                    <th data-sort="open_deals" class="num">Open Deals</th>
                    <th data-sort="pipeline_value" class="num">Pipeline $</th>
                    <th data-sort="won_value" class="num">Won $</th>
                    <th data-sort="win_rate" class="num">Win Rate</th>
                    <th data-sort="avg_deal" class="num">Avg Deal $</th>
                </tr></thead>
                <tbody>`;
    reps.forEach(r => {
        const winRate = r.win_rate || 0;
        const avgDeal = r.avg_deal_value || 0;
        html += `
                <tr>
                    <td><strong>${_escapeHtml(r.name || r.rep || '')}</strong></td>
                    <td class="num" data-value="${r.open_deals || 0}">${(r.open_deals || 0).toLocaleString()}</td>
                    <td class="num" data-value="${r.pipeline_value || 0}">${_fmtCurrency(r.pipeline_value)}</td>
                    <td class="num" data-value="${r.won_value || 0}">${_fmtCurrency(r.won_value)}</td>
                    <td class="num" data-value="${winRate}">${winRatePill(winRate)}</td>
                    <td class="num" data-value="${avgDeal}">${_fmtCurrency(avgDeal)}</td>
                </tr>`;
    });
    html += `</tbody></table></div>
        </div>
        <div class="rep-chart-col">
            <h4 class="ph-subtitle">Pipeline Value by Rep</h4>
            <div style="height:${Math.max(reps.length * 40 + 60, 200)}px;position:relative;">
                <canvas id="rep-pipeline-chart"></canvas>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;

    const tbl = container.querySelector('.sortable-table');
    if (tbl) makeSortable(tbl);

    const ctx = document.getElementById('rep-pipeline-chart');
    if (ctx) {
        MICCharts.destroy('rep-pipeline-chart');
        const opts = MICCharts.baseOptions();
        opts.indexAxis = 'y';
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
        opts.scales.x.ticks = { ...opts.scales.x.ticks, callback: v => '$' + (v / 1000).toFixed(0) + 'k' };
        opts.plugins.legend = { display: true, position: 'bottom', labels: { font: { family: 'Nunito Sans', size: 11, weight: '600' }, usePointStyle: true, padding: 16 } };
        opts.plugins.tooltip.callbacks = {
            label: function(c) { return ` ${c.dataset.label}: $${c.parsed.x.toLocaleString()}`; }
        };

        const labels = reps.map(r => r.name || r.rep || '');
        const usdValues = reps.map(r => r.pipeline_usd || r.pipeline_value || 0);
        const cadValues = reps.map(r => r.pipeline_cad || 0);

        const datasets = [
            { label: 'USD', data: usdValues, backgroundColor: BRAND.teal, borderRadius: 4, borderSkipped: false },
        ];
        if (cadValues.some(v => v > 0)) {
            datasets.push({ label: 'CAD', data: cadValues, backgroundColor: BRAND.cyan, borderRadius: 4, borderSkipped: false });
        }

        MICCharts.instances['rep-pipeline-chart'] = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: opts,
        });
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. renderForecastWeighted(container, data)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderForecastWeighted(container, data) {
    if (!container) return;
    if (!data) {
        _emptyState(container, 'No forecast data available');
        return;
    }

    const rawPipeline = data.raw_pipeline || 0;
    const weighted = data.weighted_forecast || 0;
    const coverage = data.coverage_ratio || 0;
    const remaining = data.remaining_target || 0;
    const gap = data.gap_to_weighted || 0;
    const months = data.by_month || [];

    const coverageColor = coverage >= 3.0 ? BRAND.green : coverage >= 2.0 ? BRAND.warning : BRAND.error;
    const coverageCls = coverage >= 3.0 ? 'coverage--green' : coverage >= 2.0 ? 'coverage--amber' : 'coverage--red';

    const usdRaw = data.usd_raw || 0;
    const usdWeighted = data.usd_weighted || 0;
    const cadRaw = data.cad_raw || 0;
    const cadWeighted = data.cad_weighted || 0;
    const cadToUsd = data.cad_to_usd_rate || 0.73;

    // Currency display helper
    function fcFmt(val, cur) {
        if (cur === 'cad') return 'CA$' + Math.round(val).toLocaleString() + ' CAD';
        return '$' + Math.round(val).toLocaleString() + ' USD';
    }

    let html = `
    <div class="forecast-grid">
        <div class="forecast-currency-toggle" style="margin-bottom:12px;">
            <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:8px;">Currency:</span>
            <button class="fc-cur-btn fc-cur-btn--active" data-fc-cur="all">All (USD equiv)</button>
            <button class="fc-cur-btn" data-fc-cur="usd">USD</button>
            ${cadRaw > 0 ? '<button class="fc-cur-btn" data-fc-cur="cad">CAD</button>' : ''}
        </div>
        <div class="forecast-kpis">
            <div class="ph-summary-item">
                <span class="ph-summary-label">Raw Pipeline</span>
                <span class="ph-summary-value" id="fc-raw">${_fmtCurrency(rawPipeline)}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Weighted Forecast</span>
                <span class="ph-summary-value" id="fc-weighted">${_fmtCurrency(weighted)}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Coverage</span>
                <span class="ph-summary-value ${coverageCls}" style="color:${coverageColor}">${coverage.toFixed(1)}x</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Remaining Target</span>
                <span class="ph-summary-value">${_fmtCurrency(remaining)}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Gap to Weighted</span>
                <span class="ph-summary-value" style="color:${gap >= 0 ? BRAND.green : BRAND.error}">${_fmtCurrency(Math.abs(gap))} ${gap >= 0 ? 'surplus' : 'short'}</span>
            </div>
        </div>`;

    if (months.length > 0) {
        html += `
        <div class="forecast-chart-col">
            <h4 class="ph-subtitle">Close Date Distribution</h4>
            <div style="height:280px;position:relative;">
                <canvas id="forecast-month-chart"></canvas>
            </div>
        </div>`;
    }

    if (usdRaw > 0 || cadRaw > 0) {
        html += `
        <div class="forecast-currency-breakdown">
            <h4 class="ph-subtitle">Currency Breakdown</h4>
            <div class="ph-summary-row">
                <div class="ph-summary-item">
                    <span class="ph-summary-label">USD Raw</span>
                    <span class="ph-summary-value">${_fmtCurrency(usdRaw)}</span>
                </div>
                <div class="ph-summary-item">
                    <span class="ph-summary-label">USD Weighted</span>
                    <span class="ph-summary-value">${_fmtCurrency(usdWeighted)}</span>
                </div>
                <div class="ph-summary-item">
                    <span class="ph-summary-label">CAD Raw</span>
                    <span class="ph-summary-value">${_fmtCurrency(cadRaw)}</span>
                </div>
                <div class="ph-summary-item">
                    <span class="ph-summary-label">CAD Weighted</span>
                    <span class="ph-summary-value">${_fmtCurrency(cadWeighted)}</span>
                </div>
            </div>
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    if (months.length > 0) {
        const ctx = document.getElementById('forecast-month-chart');
        if (ctx) {
            MICCharts.destroy('forecast-month-chart');
            const opts = MICCharts.baseOptions();
            opts.scales.y.ticks = { ...opts.scales.y.ticks, callback: v => '$' + (v / 1000).toFixed(0) + 'k' };
            opts.plugins.legend = { display: true, position: 'bottom', labels: { font: { family: 'Nunito Sans', size: 11, weight: '600' }, usePointStyle: true, padding: 16 } };
            opts.plugins.tooltip.callbacks = {
                label: function(c) { return ` ${c.dataset.label}: $${c.parsed.y.toLocaleString()}`; }
            };

            MICCharts.instances['forecast-month-chart'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: months.map(m => m.month || m.label || ''),
                    datasets: [
                        { label: 'Raw Value', data: months.map(m => m.raw || m.value || 0), backgroundColor: 'rgba(173,200,55,0.35)', borderColor: BRAND.green, borderWidth: 1, borderRadius: 4, borderSkipped: false },
                        { label: 'Weighted Value', data: months.map(m => m.weighted || 0), backgroundColor: BRAND.teal, borderRadius: 4, borderSkipped: false },
                    ],
                },
                options: opts,
            });
        }
    }

    // Wire currency toggle
    container.querySelectorAll('.fc-cur-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.fc-cur-btn').forEach(b => b.classList.remove('fc-cur-btn--active'));
            btn.classList.add('fc-cur-btn--active');
            const cur = btn.dataset.fcCur;
            const rawEl = document.getElementById('fc-raw');
            const wtEl = document.getElementById('fc-weighted');
            if (cur === 'usd') {
                if (rawEl) rawEl.textContent = fcFmt(usdRaw, 'usd');
                if (wtEl) wtEl.textContent = fcFmt(usdWeighted, 'usd');
            } else if (cur === 'cad') {
                if (rawEl) rawEl.textContent = fcFmt(cadRaw, 'cad');
                if (wtEl) wtEl.textContent = fcFmt(cadWeighted, 'cad');
            } else { // all — convert CAD to USD
                const allRaw = usdRaw + cadRaw * cadToUsd;
                const allWt = usdWeighted + cadWeighted * cadToUsd;
                if (rawEl) rawEl.textContent = '$' + Math.round(allRaw).toLocaleString() + ' USD equiv';
                if (wtEl) wtEl.textContent = '$' + Math.round(allWt).toLocaleString() + ' USD equiv';
            }
        });
    });

    fetchComparison('section=forecast').then(cmp => {
        if (!cmp) return;
        const raw = document.getElementById('fc-raw');
        const wt = document.getElementById('fc-weighted');
        if (raw && cmp.raw_pipeline_delta != null) _tryRenderDelta(raw, cmp.raw_pipeline_delta);
        if (wt && cmp.weighted_delta != null) _tryRenderDelta(wt, cmp.weighted_delta);
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. renderCohorts(container, data)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderCohorts(container, data) {
    if (!container) return;
    if (!data || !data.cohorts || data.cohorts.length === 0) {
        _emptyState(container, 'No cohort data available');
        return;
    }

    const cohorts = data.cohorts.slice(0, 12);
    const maxConvRate = Math.max(...cohorts.map(c => c.conversion_rate || 0), 1);
    const trend = data.trend || 'stable';
    const best = data.best_cohort || cohorts.reduce((a, b) => (a.conversion_rate || 0) > (b.conversion_rate || 0) ? a : b);
    const avgDays = data.avg_days_to_convert || (cohorts.reduce((s, c) => s + (c.avg_days_to_convert || 0), 0) / cohorts.length);

    const trendArrow = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→';
    const trendColor = trend === 'improving' ? BRAND.green : trend === 'declining' ? BRAND.error : BRAND.warning;

    let html = `
    <div class="cohorts-grid">
        <div class="cohort-table-col">
            <h4 class="ph-subtitle">Cohort Performance</h4>
            <div class="table-container" style="max-height:400px;overflow-y:auto;">
            <table class="data-table sortable-table">
                <thead><tr>
                    <th data-sort="month">Month</th>
                    <th data-sort="contacts" class="num">Contacts</th>
                    <th data-sort="converted" class="num">Converted</th>
                    <th data-sort="conv_rate" class="num">Conv Rate</th>
                    <th data-sort="avg_days" class="num">Avg Days</th>
                    <th data-sort="won_value" class="num">Won $</th>
                </tr></thead>
                <tbody>`;
    cohorts.forEach(c => {
        const convRate = c.conversion_rate || 0;
        const barPct = maxConvRate > 0 ? (convRate / maxConvRate * 100) : 0;
        const barColor = convRate >= 25 ? BRAND.green : convRate >= 10 ? BRAND.warning : BRAND.error;
        html += `
                <tr>
                    <td>${_escapeHtml(c.month || c.cohort || '')}</td>
                    <td class="num" data-value="${c.contacts || 0}">${(c.contacts || 0).toLocaleString()}</td>
                    <td class="num" data-value="${c.converted || 0}">${(c.converted || 0).toLocaleString()}</td>
                    <td class="num cohort-bar-cell" data-value="${convRate}">
                        <div class="cohort-bar-bg">
                            <div class="cohort-bar-fill-inline" style="width:${barPct}%;background:${barColor}"></div>
                            <span class="cohort-bar-label">${convRate.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td class="num" data-value="${c.avg_days_to_convert || 0}">${(c.avg_days_to_convert || 0).toFixed(0)}</td>
                    <td class="num" data-value="${c.won_value || 0}">${_fmtCurrency(c.won_value)}</td>
                </tr>`;
    });
    html += `</tbody></table></div>
        </div>
        <div class="cohort-chart-col">
            <h4 class="ph-subtitle">Conversion Trend</h4>
            <p class="ph-subtitle-detail">Pipeline 1 · Prospect Demand Pipeline · HIRO conversions · ${_escapeHtml((cohorts[cohorts.length - 1]?.month || '') + ' – ' + (cohorts[0]?.month || ''))}</p>
            <div style="height:260px;position:relative;">
                <canvas id="cohort-trend-chart"></canvas>
            </div>
            <p class="ph-annotation">Conversion Rate = contacts that reached HIRO stage ÷ contacts created that month. Days to Convert = avg days from Contact Created to HIRO.</p>
        </div>
        <div class="cohort-badges-row">
            <div class="ph-summary-item">
                <span class="ph-summary-label">Trend</span>
                <span class="ph-summary-value" style="color:${trendColor}">${trend.charAt(0).toUpperCase() + trend.slice(1)} ${trendArrow}</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Best Cohort</span>
                <span class="ph-summary-value">${_escapeHtml(best.month || best.cohort || '')} (${(best.conversion_rate || 0).toFixed(0)}%)</span>
            </div>
            <div class="ph-summary-item">
                <span class="ph-summary-label">Avg Days to Convert</span>
                <span class="ph-summary-value">${avgDays.toFixed(0)} days</span>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;

    const tbl = container.querySelector('.sortable-table');
    if (tbl) makeSortable(tbl);

    const ctx = document.getElementById('cohort-trend-chart');
    if (ctx && cohorts.length > 0) {
        MICCharts.destroy('cohort-trend-chart');
        const chronological = [...cohorts].reverse();
        const opts = MICCharts.baseOptions();
        opts.scales.y.title = { display: true, text: 'Conversion Rate %', font: { family: 'Nunito Sans', size: 11, weight: '600' }, color: MICCharts.getColors().textMuted };
        opts.scales.y.ticks = { ...opts.scales.y.ticks, callback: v => v + '%' };
        opts.scales.y2 = {
            position: 'right',
            title: { display: true, text: 'Days to Convert', font: { family: 'Nunito Sans', size: 11, weight: '600' }, color: MICCharts.getColors().textMuted },
            grid: { display: false },
            ticks: { color: MICCharts.getColors().textMuted, font: { family: 'Nunito Sans', size: 11, weight: '600' } },
            border: { display: false },
        };
        opts.plugins.legend = { display: true, position: 'bottom', labels: { font: { family: 'Nunito Sans', size: 11, weight: '600' }, usePointStyle: true, padding: 16 } };

        MICCharts.instances['cohort-trend-chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chronological.map(c => c.month || c.cohort || ''),
                datasets: [
                    {
                        label: 'Conversion Rate',
                        data: chronological.map(c => c.conversion_rate || 0),
                        borderColor: BRAND.green,
                        backgroundColor: 'rgba(173,200,55,0.1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: BRAND.green,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Days to Convert',
                        data: chronological.map(c => c.avg_days_to_convert || 0),
                        borderColor: BRAND.teal,
                        borderWidth: 2,
                        borderDash: [6, 3],
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: BRAND.teal,
                        yAxisID: 'y2',
                    },
                ],
            },
            options: opts,
        });
    }
}

// ── Expose all render functions globally ─────────────────────────────
window.renderPipelineHealth = renderPipelineHealth;
window.renderVelocity = renderVelocity;
window.renderAcquisition = renderAcquisition;
window.renderForecastWeighted = renderForecastWeighted;
window.renderCohorts = renderCohorts;
window.fetchComparison = fetchComparison;
window.makeSortable = makeSortable;
