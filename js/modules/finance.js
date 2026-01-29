// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.0.0
// History: Month → Day → Shifts + Day Report (Shift 1/2 + Total)
// Transactions: same as before
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function safeText(v) {
  // Minimal safety without changing your UX
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toLTDate(d) {
  return d.toLocaleDateString('lt-LT');
}

function toLTTime(d) {
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function dayKeyFromISO(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function monthKeyFromISO(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function hoursBetween(startISO, endISO) {
  const a = new Date(startISO).getTime();
  const b = new Date(endISO || new Date().toISOString()).getTime();
  const ms = Math.max(0, b - a);
  return Math.max(0.0, ms / (1000 * 60 * 60));
}

function fmtDuration(hrs) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return `${h}h ${m}m`;
}

function shiftMiles(s) {
  const a = Number(s.start_odo || 0);
  const b = Number(s.end_odo || 0);
  const dist = b - a;
  return Number.isFinite(dist) ? dist : 0;
}

function sum(arr, fn) {
  return arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);
}

function isSameDay(s1ISO, s2ISO) {
  return dayKeyFromISO(s1ISO) === dayKeyFromISO(s2ISO);
}

// ────────────────────────────────────────────────────────────────
// TRANSACTIONS (same behavior)
// ────────────────────────────────────────────────────────────────

export function openTxModal(dir, shiftId = null) {
  vibrate();
  txDraft.direction = dir;
  txDraft.category = dir === 'in' ? 'tips' : 'fuel';
  updateTxModalUI(dir);

  const inp = document.getElementById('tx-amount');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 100);
  }

  if (shiftId) document.getElementById('shift-details-modal')?.classList.add('hidden');
  openModal('tx-modal');
}

export async function confirmTx() {
  vibrate([20]);

  const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
  if (!amount || amount <= 0) return showToast('Įveskite sumą', 'warning');

  state.loading = true;
  try {
    const meta = {};
    if (txDraft.category === 'fuel') {
      meta.gallons = parseFloat(document.getElementById('tx-gal')?.value || 0) || 0;
      meta.odometer = parseInt(document.getElementById('tx-odo')?.value || 0, 10) || 0;
    }

    await db.from('expenses').insert({
      user_id: state.user.id,
      shift_id: state.activeShift?.id || null,
      type: txDraft.direction === 'in' ? 'income' : 'expense',
      category: txDraft.category,
      amount,
      ...meta,
      created_at: new Date().toISOString()
    });

    closeModals();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    showToast(e?.message || 'Klaida', 'error');
  } finally {
    state.loading = false;
  }
}

export function setExpType(cat, el) {
  txDraft.category = cat;
  document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  const f = document.getElementById('fuel-fields');
  if (f) cat === 'fuel' ? f.classList.remove('hidden') : f.classList.add('hidden');
}

function updateTxModalUI(dir) {
  const t = document.getElementById('tx-title');
  if (t) t.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';

  document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
  document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
  document.getElementById('fuel-fields')?.classList.add('hidden');
}

// ────────────────────────────────────────────────────────────────
// AUDIT ENGINE (Month → Day → Shifts)
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
  const listEl = document.getElementById('audit-list');
  if (!state.user?.id || !listEl) return;

  try {
    const [shiftsRes, expensesRes] = await Promise.all([
      db
        .from('finance_shifts')
        .select('*, vehicles(name)')
        .eq('user_id', state.user.id)
        .order('start_time', { ascending: false }),
      db
        .from('expenses')
        .select('*')
        .eq('user_id', state.user.id)
    ]);

    const shifts = shiftsRes.data || [];
    const expenses = expensesRes.data || [];

    if (!shifts.length) {
      listEl.innerHTML = '<div class="text-center py-10 opacity-30">Nėra duomenų</div>';
      return;
    }

    // cache for modal
    window._auditData = { shifts, expenses };

    const grouped = buildMonthDayGroups(shifts, expenses);
    listEl.innerHTML = renderHistory(grouped);
    updateDeleteButtonLocal();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = 'Klaida';
  }
}

function buildMonthDayGroups(shifts, expenses) {
  // index expenses by shift
  const expByShift = {};
  for (const e of expenses) {
    if (!e.shift_id) continue;
    const k = String(e.shift_id);
    if (!expByShift[k]) expByShift[k] = [];
    expByShift[k].push(e);
  }

  // Month → Day → { shifts[] + totals }
  const months = {}; // { '2026-01': { year, month, days: { '2026-01-28': {...} }, net } }

  for (const s of shifts) {
    const mk = monthKeyFromISO(s.start_time);
    const dk = dayKeyFromISO(s.start_time);

    const d = new Date(s.start_time);
    const y = d.getFullYear();
    const m = d.getMonth();

    if (!months[mk]) {
      months[mk] = { year: y, monthIndex: m, monthKey: mk, net: 0, days: {} };
    }
    if (!months[mk].days[dk]) {
      const dayDate = new Date(`${dk}T12:00:00`);
      months[mk].days[dk] = {
        dayKey: dk,
        dateObj: dayDate,
        net: 0,
        shifts: []
      };
    }

    const sExp = expByShift[String(s.id)] || [];
    const income = sExp.filter(x => x.type === 'income');
    const expense = sExp.filter(x => x.type === 'expense');

    const incSum = sum(income, x => x.amount);
    const expSum = sum(expense, x => x.amount);

    const gross = Math.max(incSum, Number(s.gross_earnings || 0));
    const net = gross - expSum;

    const dist = shiftMiles(s);
    const hrs = hoursBetween(s.start_time, s.end_time);

    months[mk].days[dk].shifts.push({
      ...s,
      _date: new Date(s.start_time),
      _end: s.end_time ? new Date(s.end_time) : null,
      _exp: sExp,
      _income: income,
      _expense: expense,
      _gross: gross,
      _net: net,
      _expSum: expSum,
      _dist: dist,
      _hrs: hrs
    });

    months[mk].days[dk].net += net;
    months[mk].net += net;
  }

  // Sort shifts inside each day by start_time ascending (Shift 1, Shift 2)
  for (const mk of Object.keys(months)) {
    for (const dk of Object.keys(months[mk].days)) {
      months[mk].days[dk].shifts.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }
  }

  return months;
}

function renderHistory(months) {
  const monthsLT = ['SAUSIS','VASARIS','KOVAS','BALANDIS','GEGUŽĖ','BIRŽELIS','LIEPA','RUGPJŪTIS','RUGSĖJIS','SPALIS','LAPKRITIS','GRUODIS'];

  const monthEntries = Object.values(months).sort((a, b) => {
    // newest first
    if (a.year !== b.year) return b.year - a.year;
    return b.monthIndex - a.monthIndex;
  });

  return monthEntries.map(mo => {
    const monthTitle = monthsLT[mo.monthIndex] || mo.monthKey;

    // month days newest first (by date)
    const dayEntries = Object.values(mo.days).sort((a, b) => b.dateObj - a.dateObj);

    const daysHtml = dayEntries.map(day => renderDayBlock(day)).join('');

    return `
      <div class="history-month">
        <div class="month-head">
          <div class="month-left">${monthTitle}</div>
          <div class="month-line"></div>
          <div class="month-right">${formatCurrency(mo.net)}</div>
        </div>
        ${daysHtml}
      </div>
    `;
  }).join('');
}

function renderDayBlock(day) {
  const dayLabel = day.dateObj.toLocaleDateString('lt-LT', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayNet = day.net;

  return `
    <div class="day-block">
      <div class="day-head" onclick="openDayDetails('${day.dayKey}')">
        <div class="day-title">${safeText(dayLabel)}</div>
        <div class="day-sum">${formatCurrency(dayNet)}</div>
      </div>
      <div class="day-shifts">
        ${day.shifts.map((s, idx) => renderShiftStrip(s, idx + 1)).join('')}
      </div>
    </div>
  `;
}

function renderShiftStrip(s, numberLabel) {
  const t1 = toLTTime(new Date(s.start_time));
  const t2 = s.end_time ? toLTTime(new Date(s.end_time)) : '...';
  const dur = fmtDuration(s._hrs);
  const dist = Math.max(0, Number(s._dist || 0));
  const vehicle = safeText(s.vehicles?.name || 'Vehicle');

  const net = Number(s._net || 0);
  const netCls = net >= 0 ? 'net-pos' : 'net-neg';

  // IMPORTANT: date font stronger than time (CSS classes)
  // Keep checkbox for delete selection.
  return `
    <div class="os-strip" onclick="openShiftDetails('${s.id}')">
      <div class="os-strip-left">
        <input type="checkbox"
          class="log-checkbox"
          onclick="event.stopPropagation(); updateDeleteButtonLocal()"
          value="shift:${s.id}"
        />
        <div class="os-strip-main">
          <div class="os-strip-top">
            <div class="os-strip-date">SHIFT ${numberLabel}</div>
            <div class="os-strip-time">${t1}–${t2}</div>
            <div class="os-strip-dur">${dur}</div>
          </div>

          <div class="os-strip-sub">
            <span><i class="fa-solid fa-car-side"></i> ${vehicle}</span>
            <span class="os-sub-dot">•</span>
            <span><i class="fa-solid fa-road"></i> ${dist} mi</span>
          </div>
        </div>
      </div>

      <div class="os-strip-right">
        <div class="os-strip-net ${netCls}">${formatCurrency(net)}</div>
      </div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// DAY DETAILS MODAL (Shift 1/2 + Total Day)
// ────────────────────────────────────────────────────────────────

function calcFuelStats(expenseList, dist) {
  const fuel = expenseList.find(e => e.category === 'fuel');
  const gal = fuel ? (parseFloat(fuel.gallons) || 0) : 0;
  const mpg = (gal > 0 && dist > 0) ? (dist / gal) : null;
  return { gal, mpg };
}

function renderDayReport(dayKey) {
  const shifts = window._auditData?.shifts || [];
  const expenses = window._auditData?.expenses || [];

  // day shifts by same calendar day
  const dayShifts = shifts
    .filter(s => isSameDay(s.start_time, `${dayKey}T00:00:00`))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  if (!dayShifts.length) {
    return `<div class="rep-card"><div class="rep-bigdate">${safeText(dayKey)}</div><div class="rep-small">No data</div></div>`;
  }

  // Build per shift economics
  const perShift = dayShifts.map((s, idx) => {
    const sExp = expenses.filter(e => String(e.shift_id) === String(s.id));
    const income = sExp.filter(e => e.type === 'income');
    const expense = sExp.filter(e => e.type === 'expense');

    const incSum = sum(income, e => e.amount);
    const expSum = sum(expense, e => e.amount);
    const gross = Math.max(incSum, Number(s.gross_earnings || 0));
    const net = gross - expSum;

    const dist = Math.max(0, shiftMiles(s));
    const hrs = hoursBetween(s.start_time, s.end_time);

    const { gal, mpg } = calcFuelStats(expense, dist);

    return {
      idx: idx + 1,
      shift: s,
      income,
      expense,
      gross,
      expSum,
      net,
      dist,
      hrs,
      gal,
      mpg
    };
  });

  // Totals for day
  const dayGross = sum(perShift, x => x.gross);
  const dayExp = sum(perShift, x => x.expSum);
  const dayNet = dayGross - dayExp;
  const dayMiles = sum(perShift, x => x.dist);
  const dayHours = sum(perShift, x => x.hrs);
  const dayGal = sum(perShift, x => x.gal);
  const dayMpg = (dayGal > 0 && dayMiles > 0) ? (dayMiles / dayGal) : null;

  const dateObj = new Date(`${dayKey}T12:00:00`);
  const bigDate = dateObj.toLocaleDateString('lt-LT', { weekday: 'long', month: 'long', day: 'numeric' });

  const shiftsHtml = perShift.map(ps => {
    const s = ps.shift;
    const t1 = toLTTime(new Date(s.start_time));
    const t2 = s.end_time ? toLTTime(new Date(s.end_time)) : '...';
    const vehicle = safeText(s.vehicles?.name || 'Vehicle');

    const mpgLine = ps.mpg ? ps.mpg.toFixed(1) : '—';

    const incLines = ps.income.length
      ? ps.income.map(i => `<div class="rep-row"><div class="rep-key">${safeText(i.category)}</div><div class="rep-val">${formatCurrency(i.amount || 0)}</div></div>`).join('')
      : `<div class="rep-row"><div class="rep-key">App</div><div class="rep-val">${formatCurrency(ps.gross)}</div></div>`;

    const expLines = ps.expense.length
      ? ps.expense.map(e => {
          const extra = e.category === 'fuel' && e.gallons ? ` (${Number(e.gallons)}g)` : '';
          return `<div class="rep-row"><div class="rep-key">${safeText(e.category)}${safeText(extra)}</div><div class="rep-val rep-muted">-${formatCurrency(e.amount || 0)}</div></div>`;
        }).join('')
      : `<div class="rep-row"><div class="rep-key">None</div><div class="rep-val rep-muted">—</div></div>`;

    return `
      <div class="rep-section">
        <div class="rep-title">SHIFT ${ps.idx}</div>

        <div class="rep-row rep-strong">
          <div class="rep-key">${vehicle}</div>
          <div class="rep-val">${t1}–${t2}</div>
        </div>

        <div class="rep-metrics">
          <div class="rep-metric">
            <div class="rep-mcap">HOURS</div>
            <div class="rep-mval">${fmtDuration(ps.hrs)}</div>
          </div>
          <div class="rep-metric">
            <div class="rep-mcap">MILES</div>
            <div class="rep-mval">${ps.dist}</div>
          </div>
          <div class="rep-metric">
            <div class="rep-mcap">MPG</div>
            <div class="rep-mval">${mpgLine}</div>
          </div>
        </div>

        <div class="rep-divider soft"></div>

        <div class="rep-title">EARNINGS</div>
        ${incLines}
        <div class="rep-row rep-strong">
          <div class="rep-key">TOTAL</div>
          <div class="rep-val">${formatCurrency(ps.gross)}</div>
        </div>

        <div class="rep-divider soft"></div>

        <div class="rep-title">EXPENSES</div>
        ${expLines}
        <div class="rep-row rep-strong">
          <div class="rep-key">TOTAL</div>
          <div class="rep-val rep-muted">-${formatCurrency(ps.expSum)}</div>
        </div>

        <div class="rep-divider"></div>
      </div>
    `;
  }).join('');

  const dayMpgLine = dayMpg ? dayMpg.toFixed(1) : '—';

  return `
    <div class="rep-card">
      <div class="rep-head">
        <div>
          <div class="rep-bigdate">${safeText(bigDate)}</div>
          <div class="rep-small">Day total (all shifts)</div>
        </div>
        <div class="rep-duration">
          <div class="rep-durcap">TOTAL HOURS</div>
          <div class="rep-durval">${fmtDuration(dayHours)}</div>
        </div>
      </div>

      <div class="rep-netbox">
        <div>
          <div class="rep-row rep-strong">
            <div class="rep-key">EARNINGS</div>
            <div class="rep-val">${formatCurrency(dayGross)}</div>
          </div>
          <div class="rep-row rep-strong">
            <div class="rep-key">EXPENSES</div>
            <div class="rep-val rep-muted">-${formatCurrency(dayExp)}</div>
          </div>

          <div class="rep-metrics">
            <div class="rep-metric">
              <div class="rep-mcap">MILES</div>
              <div class="rep-mval">${dayMiles}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">GAL</div>
              <div class="rep-mval">${dayGal ? dayGal.toFixed(2) : '—'}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">MPG</div>
              <div class="rep-mval">${dayMpgLine}</div>
            </div>
          </div>
        </div>

        <div class="rep-net-right">${formatCurrency(dayNet)}</div>
      </div>

      ${shiftsHtml}

      <button class="btn-primary-os rep-close" onclick="closeModals()">CLOSE</button>
    </div>
  `;
}

export function openDayDetails(dayKey) {
  vibrate([10]);
  const target = document.getElementById('shift-details-content');
  if (!target) return;

  target.innerHTML = renderDayReport(dayKey);
  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// SHIFT DETAILS MODAL (single shift) - keep your existing behavior
// ────────────────────────────────────────────────────────────────

export function openShiftDetails(id) {
  vibrate([10]);

  const shifts = window._auditData?.shifts || [];
  const expenses = window._auditData?.expenses || [];
  const s = shifts.find(x => String(x.id) === String(id));
  if (!s) return;

  const sExp = expenses.filter(e => String(e.shift_id) === String(id));
  const income = sExp.filter(e => e.type === 'income');
  const expense = sExp.filter(e => e.type === 'expense');

  const incSum = sum(income, x => x.amount);
  const expSum = sum(expense, x => x.amount);
  const gross = Math.max(incSum, Number(s.gross_earnings || 0));
  const net = gross - expSum;

  const dist = Math.max(0, shiftMiles(s));
  const hrs = hoursBetween(s.start_time, s.end_time);

  const { gal, mpg } = calcFuelStats(expense, dist);
  const mpgLine = mpg ? mpg.toFixed(1) : '—';

  const vehicleName = safeText(s.vehicles?.name || 'Unknown');
  const dateStr = toLTDate(new Date(s.start_time));
  const t1 = toLTTime(new Date(s.start_time));
  const t2 = s.end_time ? toLTTime(new Date(s.end_time)) : '...';

  const html = `
    <div class="rep-card">
      <div class="rep-head">
        <div>
          <div class="rep-bigdate">${safeText(dateStr)}</div>
          <div class="rep-small">${vehicleName} • ${t1}–${t2}</div>
        </div>
        <div class="rep-duration">
          <div class="rep-durcap">HOURS</div>
          <div class="rep-durval">${fmtDuration(hrs)}</div>
        </div>
      </div>

      <div class="rep-netbox">
        <div>
          <div class="rep-row rep-strong">
            <div class="rep-key">EARNINGS</div>
            <div class="rep-val">${formatCurrency(gross)}</div>
          </div>
          <div class="rep-row rep-strong">
            <div class="rep-key">EXPENSES</div>
            <div class="rep-val rep-muted">-${formatCurrency(expSum)}</div>
          </div>

          <div class="rep-metrics">
            <div class="rep-metric">
              <div class="rep-mcap">MILES</div>
              <div class="rep-mval">${dist}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">GAL</div>
              <div class="rep-mval">${gal ? gal.toFixed(2) : '—'}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">MPG</div>
              <div class="rep-mval">${mpgLine}</div>
            </div>
          </div>
        </div>

        <div class="rep-net-right">${formatCurrency(net)}</div>
      </div>

      <button class="btn-primary-os rep-close" onclick="closeModals()">CLOSE</button>
    </div>
  `;

  const target = document.getElementById('shift-details-content');
  if (target) target.innerHTML = html;

  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE (same as before)
// ────────────────────────────────────────────────────────────────

export function toggleSelectAll() { /* optional */ }

export function requestLogDelete() {
  const checked = document.querySelectorAll('.log-checkbox:checked');
  if (checked.length) {
    itemsToDelete = Array.from(checked).map(el => ({
      type: el.value.split(':')[0],
      id: el.value.split(':')[1]
    }));
    const c = document.getElementById('del-modal-count');
    if (c) c.textContent = String(itemsToDelete.length);
    openModal('delete-modal');
  }
}

export async function confirmLogDelete() {
  state.loading = true;
  try {
    const sIds = itemsToDelete.filter(i => i.type === 'shift').map(i => i.id);
    const tIds = itemsToDelete.filter(i => i.type === 'tx').map(i => i.id);

    if (sIds.length) {
      await db.from('expenses').delete().in('shift_id', sIds);
      await db.from('finance_shifts').delete().in('id', sIds);
    }
    if (tIds.length) {
      await db.from('expenses').delete().in('id', tIds);
    }

    closeModals();
    refreshAudit();
  } catch (e) {
    showToast('Error', 'error');
  } finally {
    state.loading = false;
  }
}

export function updateDeleteButtonLocal() {
  const c = document.querySelectorAll('.log-checkbox:checked').length;
  document.getElementById('btn-delete-logs')?.classList.toggle('hidden', c === 0);
  const el = document.getElementById('delete-count');
  if (el) el.textContent = String(c);
}

export function exportAI() {}

// Make Day modal callable without touching app.js
if (typeof window !== 'undefined') {
  window.openDayDetails = openDayDetails;
}
