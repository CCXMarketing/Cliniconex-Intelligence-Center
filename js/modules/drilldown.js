// ── CIC Drilldown Modal Engine ──────────────────────────────────
// Called by any tab module: Drilldown.open({ title, data, type })

export const Drilldown = {
  _overlay: null,
  _chart: null,

  init() {
    // Create overlay and panel DOM once
    if (document.getElementById('drilldown-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'drilldown-overlay';
    overlay.id = 'drilldown-overlay';
    overlay.innerHTML = `
      <div class="drilldown-panel" id="drilldown-panel">
        <div class="drilldown-header">
          <div class="drilldown-header__left">
            <div class="drilldown-title" id="dd-title"></div>
            <div class="drilldown-subtitle" id="dd-subtitle"></div>
          </div>
          <button class="drilldown-close" id="drilldown-close">\u2715</button>
        </div>
        <div class="drilldown-meta" id="dd-meta"></div>
        <div class="drilldown-body" id="dd-body"></div>
      </div>`;

    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    document.getElementById('drilldown-close').addEventListener('click', () => this.close());

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open(config) {
    this.init();

    // Set title and subtitle
    document.getElementById('dd-title').textContent = config.title || '';
    document.getElementById('dd-subtitle').textContent = config.definition || '';

    // Meta bar: cadence, data source, accountable, OKR
    const meta = document.getElementById('dd-meta');
    meta.innerHTML = [
      config.cadence    ? `<div class="drilldown-meta-item">\uD83D\uDCC5 Cadence <span>${config.cadence}</span></div>` : '',
      config.dataSource ? `<div class="drilldown-meta-item">\uD83D\uDD0C Source <span>${config.dataSource}</span></div>` : '',
      config.accountable? `<div class="drilldown-meta-item">\uD83D\uDC64 Accountable <span>${config.accountable}</span></div>` : '',
      config.status     ? `<div class="drilldown-meta-item">\u25CF Status <span class="badge badge--${config.status}">${config.status.toUpperCase()}</span></div>` : '',
    ].join('');

    // Build body content
    const body = document.getElementById('dd-body');
    body.innerHTML = '';

    // Destroy previous chart
    if (this._chart) { this._chart.destroy(); this._chart = null; }

    // Primary value
    if (config.value != null) {
      const formattedVal = this._format(config.value, config.unit);
      const formattedTarget = config.target != null ? this._format(config.target, config.unit) : null;

      let deltaHtml = '';
      if (config.trend && config.trend.length >= 2) {
        const prev = config.trend[config.trend.length - 2];
        const curr = config.trend[config.trend.length - 1];
        const pct = ((curr - prev) / Math.abs(prev) * 100).toFixed(1);
        const dir = pct >= 0 ? 'up' : 'down';
        deltaHtml = `<div class="drilldown-primary__delta drilldown-primary__delta--${dir}">
          ${pct >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(pct)}% vs previous month
        </div>`;
      }

      body.innerHTML += `
        <div class="drilldown-primary">
          <div class="drilldown-primary__value">${formattedVal}</div>
          <div class="drilldown-primary__meta">
            ${deltaHtml}
            ${formattedTarget ? `<div class="drilldown-primary__target">Target: ${formattedTarget}</div>` : ''}
          </div>
        </div>`;
    }

    // OKR context
    if (config.okr) {
      body.innerHTML += `
        <div class="drilldown-context-box">
          <div class="drilldown-context-box__label">OKR / Key Result</div>
          <div class="drilldown-context-box__text">${config.okr}</div>
        </div>`;
    }

    // Trend chart
    if (config.trend && config.trend.length > 1) {
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Trend (Last ${config.trend.length} Months)</div>
          <div class="drilldown-chart-container">
            <canvas id="dd-chart"></canvas>
          </div>
        </div>`;

      // Render chart after DOM update
      setTimeout(() => {
        const canvas = document.getElementById('dd-chart');
        if (!canvas) return;
        this._chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: config.trendLabels || config.trend.map((_, i) => `M-${config.trend.length - 1 - i}`),
            datasets: [{
              label: config.title,
              data: config.trend,
              borderColor: '#ADC837',
              backgroundColor: 'rgba(173,200,55,0.1)',
              fill: true,
              tension: 0.4,
              pointBackgroundColor: '#ADC837',
              pointRadius: 5,
              borderWidth: 2
            },
            ...(config.target != null ? [{
              label: 'Target',
              data: config.trend.map(() => config.target),
              borderColor: '#E53935',
              borderDash: [5, 3],
              pointRadius: 0,
              fill: false,
              borderWidth: 1.5
            }] : [])
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { font: { family: 'Nunito Sans', size: 11 } } }
            },
            scales: {
              y: {
                ticks: {
                  callback: v => this._format(v, config.unit),
                  font: { family: 'Nunito Sans', size: 11 }
                }
              },
              x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
            }
          }
        });
      }, 50);
    }

    // Trend table
    if (config.trend && config.trendLabels) {
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Monthly Detail</div>
          <table class="drilldown-trend-table">
            <thead>
              <tr>
                <th>Month</th>
                <th class="col-right">Value</th>
                ${config.target != null ? '<th class="col-right">Target</th><th class="col-right">vs Target</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${config.trend.map((v, i) => {
                const label = config.trendLabels[i];
                const fmt = this._format(v, config.unit);
                const isCurrent = i === config.trend.length - 1;
                const vsTarget = config.target != null
                  ? ((v / config.target - 1) * 100).toFixed(1) + '%'
                  : '';
                return `<tr ${isCurrent ? 'style="font-weight:700"' : ''}>
                  <td>${label}${isCurrent ? ' \u2190' : ''}</td>
                  <td class="col-right">${fmt}</td>
                  ${config.target != null ? `
                    <td class="col-right">${this._format(config.target, config.unit)}</td>
                    <td class="col-right" style="color:${v >= config.target ? '#2E7D32' : '#C62828'}">${vsTarget}</td>
                  ` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Breakdown rows (segments, reps, partners etc.)
    if (config.breakdown && config.breakdown.length > 0) {
      const maxVal = Math.max(...config.breakdown.map(b => b.value || 0));
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">${config.breakdownTitle || 'Breakdown'}</div>
          <div class="drilldown-breakdown">
            ${config.breakdown.map(b => `
              <div class="drilldown-breakdown-row">
                <div class="drilldown-breakdown-row__label">${b.label}</div>
                <div class="drilldown-breakdown-row__bar">
                  <div class="drilldown-breakdown-row__fill" style="width:${maxVal > 0 ? Math.round((b.value/maxVal)*100) : 0}%"></div>
                </div>
                <div class="drilldown-breakdown-row__value">${this._format(b.value, config.unit)}</div>
                ${b.target != null ? `<div style="font-size:11px;color:#9E9E9E;width:80px;text-align:right">/ ${this._format(b.target, config.unit)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    // YTD section
    if (config.ytd != null) {
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Year-to-Date</div>
          <div class="drilldown-breakdown">
            <div class="drilldown-breakdown-row">
              <div class="drilldown-breakdown-row__label">YTD Actual</div>
              <div class="drilldown-breakdown-row__bar">
                <div class="drilldown-breakdown-row__fill" style="width:${config.ytdTarget ? Math.min(100, Math.round(config.ytd/config.ytdTarget*100)) : 50}%"></div>
              </div>
              <div class="drilldown-breakdown-row__value">${this._format(config.ytd, config.unit)}</div>
              ${config.ytdTarget ? `<div style="font-size:11px;color:#9E9E9E;width:80px;text-align:right">/ ${this._format(config.ytdTarget, config.unit)}</div>` : ''}
            </div>
          </div>
        </div>`;
    }

    // Note / gap
    if (config.note) {
      body.innerHTML += `<div class="drilldown-note">\u26A0 ${config.note}</div>`;
    }

    // Show modal
    requestAnimationFrame(() => {
      this._overlay.classList.add('visible');
    });
  },

  close() {
    if (this._overlay) this._overlay.classList.remove('visible');
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  },

  _format(n, unit) {
    if (n == null) return '\u2014';
    if (unit === 'currency') return CIC.formatCurrency(n);
    if (unit === 'percent')  return CIC.formatPercent(n);
    if (unit === 'multiplier') return n.toFixed(1) + 'x';
    if (unit === 'days')    return n + ' days';
    if (unit === 'hours')   return n + ' hrs';
    if (unit === 'score')   return n.toString();
    return n.toLocaleString();
  }
};
