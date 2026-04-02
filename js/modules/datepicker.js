// ── CIC Modern Date Picker ──────────────────────────────────────
// Usage:
//   const dp = new CICDatePicker(triggerEl, options)
//   dp.onChange = (selection) => { /* { type, start, end, label } */ }

export class CICDatePicker {
  constructor(triggerEl, options = {}) {
    this.trigger  = triggerEl;
    this.options  = {
      mode: 'single',        // 'single' | 'range' | 'month'
      showQuickRanges: true,
      minDate: null,
      maxDate: new Date(),
      ...options
    };
    this.selection = { start: null, end: null };
    this._popover  = null;
    this._viewDate = new Date();
    this._open     = false;
    this._panelMode = 'calendar'; // 'calendar' | 'months'
    this.onChange  = null;

    this._init();
  }

  _init() {
    this.trigger.addEventListener('click', e => {
      e.stopPropagation();
      this._open ? this.close() : this.open();
    });
    document.addEventListener('click', e => {
      if (!this._popover?.contains(e.target) && e.target !== this.trigger) {
        this.close();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
    });
  }

  open() {
    if (!this._popover) this._buildPopover();
    this._positionPopover();
    this._popover.classList.add('open');
    this.trigger.classList.add('active');
    this._open = true;
    this._render();
  }

  close() {
    this._popover?.classList.remove('open');
    this.trigger.classList.remove('active');
    this._open = false;
  }

  _buildPopover() {
    const pop = document.createElement('div');
    pop.className = 'cic-datepicker-popover';
    pop.innerHTML = `
      <div class="dp-mode-tabs" id="dp-mode-tabs">
        <button class="dp-mode-tab active" data-panel="calendar">📅 Date</button>
        <button class="dp-mode-tab" data-panel="months">📆 Month</button>
      </div>
      <div id="dp-calendar-panel" class="dp-calendar"></div>
      <div id="dp-months-panel" class="dp-months" style="display:none"></div>
      ${this.options.showQuickRanges ? '<div class="dp-quick-ranges" id="dp-quick-ranges"></div>' : ''}
      <div class="dp-footer">
        <span class="dp-selected-display" id="dp-selected-display">No date selected</span>
        <button class="dp-apply-btn" id="dp-apply">Apply</button>
      </div>`;
    document.body.appendChild(pop);
    this._popover = pop;

    // Mode tab switching
    pop.querySelector('#dp-mode-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.dp-mode-tab');
      if (!btn) return;
      pop.querySelectorAll('.dp-mode-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      this._panelMode = btn.dataset.panel;
      pop.querySelector('#dp-calendar-panel').style.display =
        this._panelMode === 'calendar' ? 'block' : 'none';
      pop.querySelector('#dp-months-panel').style.display =
        this._panelMode === 'months' ? 'grid' : 'none';
      this._render();
    });

    // Quick ranges
    if (this.options.showQuickRanges) {
      this._renderQuickRanges();
    }

    // Apply button
    pop.querySelector('#dp-apply').addEventListener('click', () => {
      if (this.selection.start) {
        this._emitChange();
        this.close();
      }
    });
  }

  _render() {
    if (this._panelMode === 'calendar') this._renderCalendar();
    else this._renderMonths();
    this._updateDisplay();
  }

  _renderCalendar() {
    const panel = this._popover.querySelector('#dp-calendar-panel');
    if (!panel) return;

    const year  = this._viewDate.getFullYear();
    const month = this._viewDate.getMonth();
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];

    // First day of month
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let daysHtml = '';
    // Empty cells for days before month start
    for (let i = 0; i < firstDay; i++) {
      const prevDate = new Date(year, month, -(firstDay - i - 1));
      daysHtml += `<button class="dp-day dp-day--other-month"
        data-date="${prevDate.toISOString().slice(0,10)}">${prevDate.getDate()}</button>`;
    }
    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      const date   = new Date(year, month, d);
      const dateStr = date.toISOString().slice(0, 10);
      const isToday = date.toDateString() === today.toDateString();
      const isSel  = this.selection.start?.toDateString() === date.toDateString()
                  || this.selection.end?.toDateString() === date.toDateString();
      const inRange = this.selection.start && this.selection.end
                    && date > this.selection.start && date < this.selection.end;
      const isDisabled = (this.options.maxDate && date > this.options.maxDate)
                      || (this.options.minDate && date < this.options.minDate);

      const classes = ['dp-day',
        isToday ? 'dp-day--today' : '',
        isSel   ? 'dp-day--selected' : '',
        inRange ? 'dp-day--range-between' : '',
        isDisabled ? 'dp-day--disabled' : ''
      ].filter(Boolean).join(' ');

      daysHtml += `<button class="${classes}" data-date="${dateStr}"
        ${isDisabled ? 'disabled' : ''}>${d}</button>`;
    }

    panel.innerHTML = `
      <div class="dp-cal-header">
        <button class="dp-cal-nav" id="dp-prev">&#8249;</button>
        <span class="dp-cal-month-label">${monthNames[month]} ${year}</span>
        <button class="dp-cal-nav" id="dp-next">&#8250;</button>
      </div>
      <div class="dp-weekdays">
        ${dayNames.map(d => `<div class="dp-weekday">${d}</div>`).join('')}
      </div>
      <div class="dp-days">${daysHtml}</div>`;

    // Navigation
    panel.querySelector('#dp-prev').addEventListener('click', () => {
      this._viewDate = new Date(this._viewDate.getFullYear(),
        this._viewDate.getMonth() - 1, 1);
      this._renderCalendar();
    });
    panel.querySelector('#dp-next').addEventListener('click', () => {
      this._viewDate = new Date(this._viewDate.getFullYear(),
        this._viewDate.getMonth() + 1, 1);
      this._renderCalendar();
    });

    // Day click
    panel.querySelector('.dp-days').addEventListener('click', e => {
      const btn = e.target.closest('.dp-day:not(.dp-day--disabled)');
      if (!btn) return;
      const date = new Date(btn.dataset.date + 'T00:00:00');
      if (this.options.mode === 'range') {
        if (!this.selection.start || (this.selection.start && this.selection.end)) {
          this.selection = { start: date, end: null };
        } else {
          if (date < this.selection.start) {
            this.selection = { start: date, end: this.selection.start };
          } else {
            this.selection.end = date;
          }
        }
      } else {
        this.selection = { start: date, end: date };
      }
      this._renderCalendar();
      this._updateDisplay();
    });
  }

  _renderMonths() {
    const panel = this._popover.querySelector('#dp-months-panel');
    if (!panel) return;
    const year = this._viewDate.getFullYear();
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    const selMonth = this.selection.start?.getMonth();
    const selYear  = this.selection.start?.getFullYear();

    panel.innerHTML = `
      <div style="grid-column:1/-1;display:flex;justify-content:space-between;
        align-items:center;margin-bottom:8px;">
        <button class="dp-cal-nav" id="dp-year-prev">&#8249;</button>
        <strong style="font-family:'Nunito Sans',sans-serif;font-size:15px;">
          ${year}</strong>
        <button class="dp-cal-nav" id="dp-year-next">&#8250;</button>
      </div>
      ${months.map((m, i) => {
        const isSel = selMonth === i && selYear === year;
        return `<button class="dp-month-cell ${isSel ? 'selected' : ''}"
          data-month="${i}" data-year="${year}">${m}</button>`;
      }).join('')}`;

    panel.querySelector('#dp-year-prev').addEventListener('click', () => {
      this._viewDate = new Date(this._viewDate.getFullYear() - 1, 0, 1);
      this._renderMonths();
    });
    panel.querySelector('#dp-year-next').addEventListener('click', () => {
      this._viewDate = new Date(this._viewDate.getFullYear() + 1, 0, 1);
      this._renderMonths();
    });
    panel.querySelectorAll('.dp-month-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const m = parseInt(cell.dataset.month);
        const y = parseInt(cell.dataset.year);
        this.selection.start = new Date(y, m, 1);
        this.selection.end   = new Date(y, m + 1, 0);
        this._renderMonths();
        this._updateDisplay();
      });
    });
  }

  _renderQuickRanges() {
    const el = this._popover.querySelector('#dp-quick-ranges');
    if (!el) return;
    const ranges = [
      { label: 'Last Month',   id: 'last-month' },
      { label: 'Last Quarter', id: 'last-quarter' },
      { label: 'Last Year',    id: 'last-year' },
      { label: 'YTD',          id: 'ytd' }
    ];
    el.innerHTML = ranges.map(r =>
      `<button class="dp-quick-btn" data-range="${r.id}">${r.label}</button>`
    ).join('');

    el.addEventListener('click', e => {
      const btn = e.target.closest('.dp-quick-btn');
      if (!btn) return;
      el.querySelectorAll('.dp-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const now = new Date();
      const range = btn.dataset.range;
      if (range === 'last-month') {
        this.selection.start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        this.selection.end   = new Date(now.getFullYear(), now.getMonth(), 0);
      } else if (range === 'last-quarter') {
        const q = Math.floor((now.getMonth()) / 3);
        this.selection.start = new Date(now.getFullYear(), (q - 1) * 3, 1);
        this.selection.end   = new Date(now.getFullYear(), q * 3, 0);
      } else if (range === 'last-year') {
        this.selection.start = new Date(now.getFullYear() - 1, 0, 1);
        this.selection.end   = new Date(now.getFullYear() - 1, 11, 31);
      } else if (range === 'ytd') {
        this.selection.start = new Date(now.getFullYear(), 0, 1);
        this.selection.end   = now;
      }
      this._viewDate = new Date(this.selection.start);
      this._render();
    });
  }

  _updateDisplay() {
    const el = this._popover?.querySelector('#dp-selected-display');
    if (!el) return;
    if (!this.selection.start) { el.textContent = 'No date selected'; return; }
    const fmt = d => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    if (this.selection.end && this.selection.end.toDateString() !== this.selection.start.toDateString()) {
      el.textContent = `${fmt(this.selection.start)} \u2192 ${fmt(this.selection.end)}`;
    } else {
      el.textContent = fmt(this.selection.start);
    }
    // Update trigger label
    const triggerText = this.trigger.querySelector('.cic-datepicker-trigger__text');
    if (triggerText) triggerText.textContent = el.textContent;
  }

  _emitChange() {
    if (!this.onChange || !this.selection.start) return;
    this.onChange({
      type: this.options.mode,
      start: this.selection.start,
      end: this.selection.end || this.selection.start,
      label: this._popover?.querySelector('#dp-selected-display')?.textContent || ''
    });
  }

  _positionPopover() {
    if (!this._popover) return;
    const rect = this.trigger.getBoundingClientRect();
    this._popover.style.position = 'fixed';
    this._popover.style.top  = (rect.bottom + 6) + 'px';
    this._popover.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
  }

  setDate(date) {
    this.selection = { start: date, end: date };
    this._updateDisplay();
  }

  getSelection() { return this.selection; }
}


// ── Inline Manual Entry Helper ──────────────────────────────────
// Usage:
//   renderInlineEntry(containerEl, config)
//   config: { id, title, department, fields: [{key, label, type, placeholder, unit}] }

export async function renderInlineEntry(containerEl, config) {
  const { storage } = await import('../data/storage.js');

  // Load saved values first
  const savedValues = {};
  for (const f of config.fields) {
    const saved = await storage.get(config.department, f.key);
    if (saved) savedValues[f.key] = saved;
  }

  const hasValues = Object.keys(savedValues).length > 0;

  const section = document.createElement('div');
  section.className = `inline-entry-section ${hasValues ? 'has-values' : ''}`;
  section.id = `entry-section-${config.id}`;

  section.innerHTML = `
    <div class="inline-entry-header">
      <span class="inline-entry-title">\u270E ${config.title}</span>
      <button class="inline-entry-toggle" id="entry-toggle-${config.id}">
        ${hasValues ? '\u25BE Collapse' : '\u25BE Enter Data'}
      </button>
    </div>
    <div id="entry-fields-${config.id}" style="${hasValues ? '' : 'display:none'}">
      <div class="inline-entry-fields">
        ${config.fields.map(f => {
          const saved = savedValues[f.key];
          const savedDisplay = saved
            ? `Last saved: ${saved.value} on ${new Date(saved.updated).toLocaleDateString('en-CA')}`
            : 'Not yet entered';
          return `
            <div class="inline-entry-field">
              <label for="ie-${config.id}-${f.key}">${f.label}</label>
              <input type="${f.type || 'number'}"
                     id="ie-${config.id}-${f.key}"
                     data-key="${f.key}"
                     data-unit="${f.unit || 'number'}"
                     placeholder="${f.placeholder || ''}"
                     value="${saved?.value || ''}">
              <div class="inline-entry-field__saved">${savedDisplay}</div>
            </div>`;
        }).join('')}
      </div>
      <div class="inline-entry-actions">
        <button class="inline-entry-save-btn" id="entry-save-${config.id}">
          Save
        </button>
        <span class="inline-entry-confirm" id="entry-confirm-${config.id}">
          \u2713 Saved successfully
        </span>
      </div>
    </div>`;

  if (config.insertAfterSelector) {
    const anchor = containerEl.querySelector(config.insertAfterSelector);
    if (anchor) anchor.insertAdjacentElement('afterend', section);
    else containerEl.appendChild(section);
  } else {
    containerEl.appendChild(section);
  }

  // Toggle
  section.querySelector(`#entry-toggle-${config.id}`)
    ?.addEventListener('click', () => {
      const fields = section.querySelector(`#entry-fields-${config.id}`);
      const isOpen = fields.style.display !== 'none';
      fields.style.display = isOpen ? 'none' : 'block';
      section.querySelector(`#entry-toggle-${config.id}`).textContent =
        isOpen ? '\u25BE Enter Data' : '\u25BE Collapse';
    });

  // Save
  section.querySelector(`#entry-save-${config.id}`)
    ?.addEventListener('click', async () => {
      const inputs = section.querySelectorAll('input[data-key]');
      for (const input of inputs) {
        if (input.value !== '') {
          await storage.set(config.department, input.dataset.key, input.value);
          const savedEl = input.nextElementSibling;
          if (savedEl) {
            savedEl.textContent =
              `Last saved: ${input.value} on ${new Date().toLocaleDateString('en-CA')}`;
          }
        }
      }
      section.classList.add('has-values');
      const confirm = section.querySelector(`#entry-confirm-${config.id}`);
      if (confirm) {
        confirm.classList.add('visible');
        setTimeout(() => confirm.classList.remove('visible'), 3000);
      }
      // Dispatch event so parent module can react
      section.dispatchEvent(new CustomEvent('cic:entrysaved', {
        detail: { department: config.department, id: config.id },
        bubbles: true
      }));
    });
}
