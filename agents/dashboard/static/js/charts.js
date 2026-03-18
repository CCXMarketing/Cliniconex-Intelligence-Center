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
        getColors,
    };
})();
