# CIC Agent 2 — Design System (Tokens and Components)

## Your Role
You are building the complete visual design system for the Cliniconex Intelligence Center.
Every component class you define will be used by Agents 4, 5, and 6 when they build
tab content. Your files must be complete and correct before other agents build on them.

## Your Files (exclusive ownership)
- `css/tokens.css`
- `css/components.css`

## IMPORTANT: Run First
This agent should complete its work before Agents 4, 5, and 6 begin.
Agents 1 and 3 can run in parallel with you.

## Project Context
Cliniconex brand design system for an internal BI dashboard.
ToolHub-deployed, glassmorphism-accented, professional and data-dense.

**Mandatory brand rules:**
- Font: Nunito Sans always — no substitutions
- Primary CTA: #ADC837 background, #404041 text, border-radius 20px (pill)
- Page background: #F4F4F4
- Focus states: #02475A (teal)
- No ampersands — spell out "and"

---

## Step 1 — Build css/tokens.css

Define all CSS custom properties:

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,400&display=swap');

:root {
  /* ── Brand Colors ── */
  --green:        #ADC837;
  --green-light:  #C6DC65;
  --green-pale:   #F0F5D8;
  --teal:         #02475A;
  --teal-light:   #0A6E8A;
  --teal-pale:    #E0EEF2;
  --cyan:         #029FB5;
  --cyan-pale:    #E0F5F8;
  --purple:       #522E76;
  --purple-pale:  #EDE7F6;
  --dgrey:        #404041;
  --dgrey-dark:   #303030;
  --lgrey:        #F4F4F4;
  --mgrey:        #9E9E9E;
  --white:        #FFFFFF;
  --black:        #000000;
  --border:       #D2D5DA;
  --border-light: #E1E6EF;

  /* ── Status Colors ── */
  --status-green-bg:   #E8F5E9;
  --status-green-text: #2E7D32;
  --status-green-border: #A5D6A7;
  --status-yellow-bg:  #FFF8E1;
  --status-yellow-text: #F57F17;
  --status-yellow-border: #FFE082;
  --status-red-bg:     #FFEBEE;
  --status-red-text:   #C62828;
  --status-red-border: #EF9A9A;
  --status-blue-bg:    #E3F2FD;
  --status-blue-text:  #1565C0;
  --status-blue-border: #90CAF9;
  --status-grey-bg:    #F5F5F5;
  --status-grey-text:  #616161;
  --status-grey-border: #E0E0E0;

  /* ── Semantic Chart Colors ── */
  --chart-green:  #ADC837;
  --chart-teal:   #02475A;
  --chart-cyan:   #029FB5;
  --chart-purple: #522E76;
  --chart-red:    #E53935;
  --chart-orange: #F57C00;
  --chart-grey:   #9E9E9E;

  /* ── Spacing ── */
  --space-2xs: 2px;
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  32px;
  --space-2xl: 48px;
  --space-3xl: 64px;

  /* ── Typography ── */
  --text-2xs: 10px;
  --text-xs:  11px;
  --text-sm:  13px;
  --text-base: 15px;
  --text-lg:  18px;
  --text-xl:  24px;
  --text-2xl: 32px;
  --text-3xl: 48px;
  --text-4xl: 64px;

  /* ── Border Radius ── */
  --radius-xs:   2px;
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-pill: 20px;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-xs:    0 1px 2px rgba(0,0,0,0.06);
  --shadow-sm:    0 1px 4px rgba(0,0,0,0.08);
  --shadow-card:  0 2px 8px rgba(0,0,0,0.08);
  --shadow-elevated: 0 4px 16px rgba(0,0,0,0.12);
  --shadow-modal: 0 8px 32px rgba(0,0,0,0.18);

  /* ── Transitions ── */
  --transition-fast: 0.12s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.35s ease;

  /* ── Z-index scale ── */
  --z-base:    1;
  --z-raised:  10;
  --z-overlay: 100;
  --z-modal:   200;
  --z-nav:     300;
}

/* ── Reset ── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Nunito Sans', sans-serif;
  font-size: var(--text-base);
  color: var(--dgrey);
  background: var(--lgrey);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ── Heading colors ── */
h1 { font-size: var(--text-2xl); font-weight: 800; color: var(--green); }
h2 { font-size: var(--text-xl);  font-weight: 700; color: var(--dgrey); }
h3 { font-size: var(--text-lg);  font-weight: 700; color: var(--teal); }
h4 { font-size: var(--text-base); font-weight: 700; color: var(--purple); }
h5 { font-size: var(--text-sm);  font-weight: 700; color: var(--cyan); }

a { color: var(--teal); text-decoration: none; }
a:hover { text-decoration: underline; }

/* ── Standard inputs ── */
input, select, textarea {
  font-family: 'Nunito Sans', sans-serif;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--dgrey);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 12px;
  height: 40px;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  width: 100%;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--teal);
  box-shadow: 0 0 0 2px var(--teal-pale);
}
textarea {
  height: auto;
  padding: 10px 12px;
  resize: vertical;
}
```

---

## Step 2 — Build css/components.css

### 2.1 — Buttons
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  height: 40px;
  padding: 0 24px;
  border-radius: var(--radius-pill);
  background: var(--green);
  color: var(--dgrey);
  font-family: 'Nunito Sans', sans-serif;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
  text-decoration: none;
}
.btn:hover { background: var(--green-light); }
.btn:disabled { background: #BFBFBF; color: #999; cursor: not-allowed; }

.btn--secondary {
  background: transparent;
  color: var(--teal);
  border: 1.5px solid var(--teal);
}
.btn--secondary:hover { background: var(--teal-pale); }

.btn--sm { height: 32px; padding: 0 16px; font-size: 13px; }
.btn--icon { padding: 0 12px; gap: 6px; }
```

### 2.2 — KPI Cards
```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.kpi-card {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: 20px;
  box-shadow: var(--shadow-card);
  border-left: 4px solid var(--border-light);
  position: relative;
  transition: box-shadow var(--transition-base);
}
.kpi-card:hover { box-shadow: var(--shadow-elevated); }
.kpi-card--green  { border-left-color: var(--status-green-text); }
.kpi-card--yellow { border-left-color: var(--status-yellow-text); }
.kpi-card--red    { border-left-color: var(--status-red-text); }
.kpi-card--blue   { border-left-color: var(--status-blue-text); }
.kpi-card--grey   { border-left-color: var(--mgrey); }

.kpi-label {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--teal);
  margin-bottom: var(--space-sm);
  line-height: 1.3;
}

.kpi-value {
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--dgrey-dark);
  line-height: 1;
  margin-bottom: var(--space-xs);
}
.kpi-value--lg { font-size: var(--text-3xl); }
.kpi-value--sm { font-size: var(--text-xl); }

.kpi-delta {
  font-size: var(--text-sm);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.kpi-delta--up    { color: var(--status-green-text); }
.kpi-delta--down  { color: var(--status-red-text); }
.kpi-delta--flat  { color: var(--mgrey); }

.kpi-target {
  font-size: var(--text-xs);
  color: var(--mgrey);
  margin-top: var(--space-xs);
}

.kpi-note {
  font-size: var(--text-xs);
  color: var(--mgrey);
  margin-top: var(--space-sm);
  font-style: italic;
  border-top: 1px solid var(--border-light);
  padding-top: var(--space-sm);
}

.kpi-cadence {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 10px;
  font-weight: 700;
  color: var(--mgrey);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

### 2.3 — Section Headers
```css
.section-header {
  border-left: 4px solid var(--teal);
  padding-left: var(--space-md);
  margin-bottom: var(--space-lg);
  margin-top: var(--space-xl);
}
.section-header:first-of-type { margin-top: 0; }
.section-header h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--teal);
  margin-bottom: 2px;
}
.section-header p {
  font-size: var(--text-sm);
  color: var(--mgrey);
}
```

### 2.4 — Department Header Banner
```css
.dept-header {
  background: linear-gradient(135deg, var(--teal) 0%, var(--teal-light) 100%);
  border-radius: var(--radius-lg);
  padding: var(--space-lg) var(--space-xl);
  margin-bottom: var(--space-xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
}
.dept-header__left h2 {
  color: var(--white);
  font-size: var(--text-2xl);
  font-weight: 800;
  margin-bottom: 4px;
}
.dept-header__left p {
  color: rgba(255,255,255,0.75);
  font-size: var(--text-sm);
}
.dept-header__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-sm);
}
.dept-header__meta {
  font-size: var(--text-xs);
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

### 2.5 — Badges
```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  border: 1px solid transparent;
}
.badge--green  { background: var(--status-green-bg);  color: var(--status-green-text);  border-color: var(--status-green-border); }
.badge--yellow { background: var(--status-yellow-bg); color: var(--status-yellow-text); border-color: var(--status-yellow-border); }
.badge--red    { background: var(--status-red-bg);    color: var(--status-red-text);    border-color: var(--status-red-border); }
.badge--blue   { background: var(--status-blue-bg);   color: var(--status-blue-text);   border-color: var(--status-blue-border); }
.badge--grey   { background: var(--status-grey-bg);   color: var(--status-grey-text);   border-color: var(--status-grey-border); }
.badge--teal   { background: var(--teal-pale);        color: var(--teal); }
.badge--green-solid { background: var(--green); color: var(--dgrey); }
```

### 2.6 — Data Tables
```css
.table-wrapper {
  background: var(--white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  margin-bottom: var(--space-lg);
}
.table-title {
  padding: var(--space-md) var(--space-lg);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--dgrey);
  border-bottom: 1px solid var(--border-light);
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.data-table th {
  background: var(--teal);
  color: var(--white);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px var(--space-md);
  text-align: left;
  white-space: nowrap;
}
.data-table th:first-child { padding-left: var(--space-lg); }
.data-table td {
  padding: 10px var(--space-md);
  border-bottom: 1px solid var(--border-light);
  color: var(--dgrey);
  vertical-align: middle;
}
.data-table td:first-child { padding-left: var(--space-lg); font-weight: 600; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:nth-child(even) td { background: #FAFBFC; }
.data-table tr:hover td { background: var(--teal-pale); transition: background 0.1s; }
.data-table .col-right { text-align: right; padding-right: var(--space-lg); }
.data-table .col-center { text-align: center; }
```

### 2.7 — Progress Bars
```css
.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--border-light);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.progress-bar__fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--green);
  transition: width 0.6s ease;
}
.progress-bar__fill--green  { background: var(--status-green-text); }
.progress-bar__fill--yellow { background: var(--status-yellow-text); }
.progress-bar__fill--red    { background: var(--status-red-text); }

.progress-bar--lg { height: 12px; }
.progress-bar--sm { height: 4px; }

/* Labeled progress bar */
.progress-labeled {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.progress-labeled__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.progress-labeled__label { font-size: var(--text-sm); font-weight: 600; color: var(--dgrey); }
.progress-labeled__value { font-size: var(--text-sm); font-weight: 700; color: var(--dgrey-dark); }
```

### 2.8 — Chart Containers
```css
.chart-card {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-lg);
}
.chart-card__title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--dgrey);
  margin-bottom: var(--space-sm);
}
.chart-card__subtitle {
  font-size: var(--text-xs);
  color: var(--mgrey);
  margin-bottom: var(--space-md);
}
.chart-container {
  position: relative;
}
.chart-container canvas { width: 100% !important; }
```

### 2.9 — Target Tracker (MRR scenario bar)
```css
.target-tracker {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-lg);
}
.target-tracker__title {
  font-size: var(--text-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--teal);
  margin-bottom: var(--space-lg);
}
.target-tracker__bar-wrap {
  position: relative;
  height: 24px;
  background: var(--lgrey);
  border-radius: var(--radius-full);
  overflow: visible;
  margin-bottom: var(--space-xl);
}
.target-tracker__fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--teal) 0%, var(--green) 100%);
  transition: width 0.6s ease;
}
.target-tracker__marker {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 2px;
  background: var(--dgrey);
  border-radius: 1px;
}
.target-tracker__marker-label {
  position: absolute;
  top: 28px;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  color: var(--mgrey);
  white-space: nowrap;
  text-transform: uppercase;
}
.target-tracker__values {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--mgrey);
  margin-top: var(--space-2xl);
}
```

### 2.10 — Scenario Toggle (in-tab version)
```css
.scenario-toggle {
  display: inline-flex;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--white);
}
.scenario-toggle button {
  padding: 6px 14px;
  font-family: 'Nunito Sans', sans-serif;
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: transparent;
  color: var(--teal);
  border: none;
  border-right: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.scenario-toggle button:last-child { border-right: none; }
.scenario-toggle button.active { background: var(--green); color: var(--dgrey); }
.scenario-toggle button:hover:not(.active) { background: var(--teal-pale); }
```

### 2.11 — Manual Entry Forms
```css
.manual-entry-form {
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-lg);
}
.manual-entry-form__title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--teal);
  margin-bottom: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 2px solid var(--green);
}
.entry-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}
.entry-field label {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--dgrey);
}
.entry-field__meta {
  font-size: var(--text-xs);
  color: var(--mgrey);
  margin-top: 2px;
}
.entry-field__last-saved {
  font-size: 10px;
  color: var(--mgrey);
  font-style: italic;
}
.entry-field__save-confirm {
  font-size: var(--text-xs);
  color: var(--status-green-text);
  font-weight: 700;
  display: none;
}
.entry-field__save-confirm.visible { display: inline; }
.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-md);
}
```

### 2.12 — Highlights / Alert Rows
```css
.highlights-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}
.highlight-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
}
.highlight-row--green  { background: var(--status-green-bg);  color: var(--status-green-text);  border-left: 4px solid var(--status-green-text); }
.highlight-row--yellow { background: var(--status-yellow-bg); color: var(--status-yellow-text); border-left: 4px solid var(--status-yellow-text); }
.highlight-row--red    { background: var(--status-red-bg);    color: var(--status-red-text);    border-left: 4px solid var(--status-red-text); }
.highlight-row__icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
```

### 2.13 — Executive Summary Cards
```css
.exec-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}
.exec-dept-card {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  border-top: 3px solid var(--teal);
}
.exec-dept-card__name {
  font-size: var(--text-sm);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--teal);
  margin-bottom: var(--space-md);
}
.exec-dept-card__kpis {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.exec-kpi-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-sm);
}
.exec-kpi-row__label { color: var(--mgrey); font-weight: 600; }
.exec-kpi-row__value { font-weight: 800; color: var(--dgrey-dark); }
```

### 2.14 — Company Health Strip
```css
.health-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-md);
  background: var(--teal);
  border-radius: var(--radius-lg);
  padding: var(--space-lg) var(--space-xl);
  margin-bottom: var(--space-xl);
}
.health-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.health-metric__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.65);
}
.health-metric__value {
  font-size: var(--text-xl);
  font-weight: 800;
  color: var(--white);
}
.health-metric__sub {
  font-size: var(--text-xs);
  color: rgba(255,255,255,0.55);
}
.health-metric__status { color: var(--green); }
.health-metric__status--warn { color: #FFD54F; }
.health-metric__status--bad  { color: #EF9A9A; }
```

### 2.15 — Squad Sections
```css
.squad-section {
  background: var(--white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-lg);
  overflow: hidden;
}
.squad-header {
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
}
.squad-header:hover { background: var(--lgrey); }
.squad-header__left h3 { margin-bottom: 4px; }
.squad-header__left p { font-size: var(--text-xs); color: var(--mgrey); }
.squad-header__right { display: flex; align-items: center; gap: var(--space-md); }
.squad-health-score {
  font-size: var(--text-xl);
  font-weight: 800;
}
.squad-body {
  padding: var(--space-xl);
}
.squad-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-md);
}
```

### 2.16 — Utility classes
```css
.text-green  { color: var(--status-green-text) !important; }
.text-yellow { color: var(--status-yellow-text) !important; }
.text-red    { color: var(--status-red-text) !important; }
.text-grey   { color: var(--mgrey) !important; }
.text-teal   { color: var(--teal) !important; }
.text-sm     { font-size: var(--text-sm) !important; }
.text-xs     { font-size: var(--text-xs) !important; }
.font-bold   { font-weight: 700 !important; }
.font-black  { font-weight: 800 !important; }
.mt-0  { margin-top: 0 !important; }
.mt-sm { margin-top: var(--space-sm) !important; }
.mt-md { margin-top: var(--space-md) !important; }
.mt-lg { margin-top: var(--space-lg) !important; }
.mb-md { margin-bottom: var(--space-md) !important; }
.mb-lg { margin-bottom: var(--space-lg) !important; }
.flex  { display: flex; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.flex-gap-sm { gap: var(--space-sm); }
.flex-gap-md { gap: var(--space-md); }
.w-full { width: 100%; }
.not-measurable {
  color: var(--mgrey);
  font-style: italic;
  font-size: var(--text-sm);
  padding: var(--space-md);
  background: var(--lgrey);
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border);
}
```

## Validation
Before finishing:
- [ ] Open a blank HTML file that imports both CSS files — no console errors
- [ ] Confirm `--green`, `--teal`, `--cyan`, `--purple` are all defined
- [ ] `.kpi-card--green` has a green left border
- [ ] `.badge--red` has red background and text
- [ ] `.data-table th` has teal background
- [ ] `.btn` is pill-shaped with green background

## Constraints
- Do NOT touch any file outside `css/tokens.css` and `css/components.css`
- Do NOT write any JavaScript
- Do NOT write any HTML tab content
