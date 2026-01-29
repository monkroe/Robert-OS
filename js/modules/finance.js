// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.1.0
// History (Month headers + compact strips) + Report Modal (clean)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

// ────────────────────────────────────────────────────────────────
// XSS SAFETY
// ────────────────────────────────────────────────────────────────
function escapeHtml(input) {
  const s = String(input ?? '');
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ────────────────────────────────────────────────────────────────
// TRANSACTIONS
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
// AUDIT / HISTORY
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

    // cache for modal/details
    window._auditData = { shifts, expenses };

    const grouped = groupByYearMonth(shifts, expenses);
    listEl.innerHTML = renderHistory(grouped);
    updateDeleteButtonLocal();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = 'Klaida';
  }
}

function groupByYearMonth(shifts, expenses) {
  const years = {};
  const expensesByShift = {};

  expenses.forEach(e => {
    if (e.shift_id) (expensesByShift[e.shift_id] = expensesByShift[e.shift_id] || []).push(e);
  });

  shifts.forEach(shift => {
    const date = new Date(shift.start_time);
    const y = date.getFullYear();
    const m = date.getMonth();

    if (!years[y]) years[y] = { net: 0, months: {} };
    if (!years[y].months[m]) years[y].months[m] = { net: 0, items: [] };

    const sExp = expensesByShift[shift.id] || [];

    const inc = sExp.filter(e => e.type === 'income').reduce((a, b) => a + (b.amount || 0), 0);
    const exp = sExp.filter(e => e.type === 'expense').reduce((a, b) => a + (b.amount || 0), 0);

    // gross: prefer incomes total if present, else shift.gross_earnings
    const gross = Math.max(inc, shift.gross_earnings || 0);
    const net = gross - exp;

    years[y].net += net;
    years[y].months[m].net += net;

    years[y].months[m].items.push({
      ...shift,
      _date: date,
      gross,
      exp,
      net
    });
  });

  return years;
}

function monthNameLT(idx) {
  const months = ['SAUSIS','VASARIS','KOVAS','BALANDIS','GEGUŽĖ','BIRŽELIS','LIEPA','RUGPJŪTIS','RUGSĖJIS','SPALIS','LAPKRITIS','GRUODIS'];
  return months[idx] || 'MĖNUO';
}

function renderHistory(data) {
  return Object.entries(data)
    .sort((a, b) => b[0] - a[0])
    .map(([y, yD]) => {
      const monthsHtml = Object.entries(yD.months)
        .sort((a, b) => b[0] - a[0])
        .map(([m, mD]) => renderMonthSection(Number(y), Number(m), mD))
        .join('');

      return `
        <div class="history-year">
          <div class="history-year-row">
            <div class="history-year-left">${y}</div>
            <div class="history-year-right">${formatCurrency(yD.net)}</div>
          </div>
          ${monthsHtml}
        </div>
      `;
    })
    .join('');
}

function renderMonthSection(y, m, mD) {
  const title = monthNameLT(m);
  const items = (mD.items || []).sort((a, b) => b._date - a._date);

  return `
    <div class="history-month">
      <div class="month-head">
        <div class="month-left">${title}</div>
        <div class="month-line"></div>
        <div class="month-right">${formatCurrency(mD.net)}</div>
      </div>
      <div class="month-items">
        ${items.map(s => renderShiftStrip(s)).join('')}
      </div>
    </div>
  `;
}

function fmtTime(t) {
  return new Date(t).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDurationFromMs(ms) {
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.round((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hrs}h ${mins}m`;
}

function renderShiftStrip(s) {
  const dateStr = new Date(s.start_time).toLocaleDateString('lt-LT');
  const t1 = fmtTime(s.start_time);
  const t2 = s.end_time ? fmtTime(s.end_time) : '...';

  const durMs = (s.end_time ? new Date(s.end_time) : new Date()) - new Date(s.start_time);
  const dur = fmtDurationFromMs(Math.max(0, durMs));

  const vehicle = escapeHtml(s.vehicles?.name || '—');

  const dist = Math.max(0, (s.end_odo || 0) - (s.start_odo || 0));
  const net = Number(s.net || 0);
  const netCls = net >= 0 ? 'net-pos' : 'net-neg';

  return `
    <div onclick="openShiftDetails('${s.id}')" class="os-strip">
      <div class="os-strip-left">
        <input type="checkbox"
          onclick="event.stopPropagation(); updateDeleteButtonLocal()"
          value="shift:${s.id}"
          class="log-checkbox" />

        <div class="os-strip-main">
          <div class="os-strip-top">
            <span class="os-strip-date">${dateStr}</span>
            <span class="os-strip-time">${t1}–${t2}</span>
            <span class="os-strip-dur">(${dur})</span>
          </div>

          <div class="os-strip-sub">
            <span class="os-sub-item">
              <i class="fa-solid fa-car"></i>
              ${vehicle}
            </span>
            <span class="os-sub-dot">•</span>
            <span class="os-sub-item">
              <i class="fa-solid fa-road"></i>
              ${dist} mi
            </span>
          </div>
        </div>
      </div>

      <div class="os-strip-right">
        <div class="os-strip-net ${netCls}">
          ${formatCurrency(net)}
        </div>
        <div class="os-strip-netcap">NET PROFIT</div>
      </div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// REPORT MODAL (clean)
// ────────────────────────────────────────────────────────────────

function calcShiftEconomics(s, expensesAll) {
  const sExp = expensesAll.filter(e => String(e.shift_id) === String(s.id));
  const income = sExp.filter(e => e.type === 'income');
  const expense = sExp.filter(e => e.type === 'expense');

  const incomeSum = income.reduce((a, b) => a + (b.amount || 0), 0);
  const gross = Math.max(incomeSum, s.gross_earnings || 0);
  const totalExp = expense.reduce((a, b) => a + (b.amount || 0), 0);
  const net = gross - totalExp;

  const dist = Math.max(0, (s.end_odo || 0) - (s.start_odo || 0));
  const durMs = (s.end_time ? new Date(s.end_time) : new Date()) - new Date(s.start_time);
  const hrs = Math.max(0.1, durMs / (1000 * 60 * 60));

  const fuel = expense.find(e => e.category === 'fuel');
  const gal = fuel ? (parseFloat(fuel.gallons) || 0) : 0;
  const mpg = (gal > 0 && dist > 0) ? (dist / gal) : null;

  const perHour = net / hrs;
  const perMile = dist > 0 ? (net / dist) : null;

  return { sExp, income, expense, gross, totalExp, net, dist, hrs, gal, mpg, perHour, perMile };
}

function fmtMoney(n) {
  return formatCurrency(Number(n || 0));
}

function fmtBigDate(d) {
  // didelė data kaip report (TUE, JAN 27)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase();
}

function fmtHours(hrs) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs % 1) * 60);
  return `${h}h ${m}m`;
}

export function openShiftDetails(id) {
  vibrate([10]);

  const shifts = window._auditData?.shifts || [];
  const expenses = window._auditData?.expenses || [];
  const s = shifts.find(x => String(x.id) === String(id));
  if (!s) return;

  const eco = calcShiftEconomics(s, expenses);

  const start = new Date(s.start_time);
  const end = s.end_time ? new Date(s.end_time) : null;

  const bigDate = fmtBigDate(start);
  const dateSmall = start.toLocaleDateString('lt-LT');
  const timeRange = `${fmtTime(s.start_time)} - ${end ? fmtTime(s.end_time) : '...'}`;
  const duration = fmtHours(eco.hrs);

  const vehicleName = escapeHtml(s.vehicles?.name || '—');
  const weather = escapeHtml(s.weather || '—');

  const netCls = eco.net >= 0 ? 'net-pos' : 'net-neg';

  // income lines
  const incomeLines = eco.income.length
    ? eco.income.map(i => `
        <div class="rep-row">
          <div class="rep-key">${escapeHtml(i.category || 'income')}</div>
          <div class="rep-val">${fmtMoney(i.amount || 0)}</div>
        </div>
      `).join('')
    : `
        <div class="rep-row">
          <div class="rep-key">App (Uber)</div>
          <div class="rep-val">${fmtMoney(eco.gross)}</div>
        </div>
      `;

  // expense lines
  const expLines = eco.expense.length
    ? eco.expense.map(e => {
        const extra = e.category === 'fuel' && e.gallons ? ` <span class="rep-sub">(${Number(e.gallons)} gal)</span>` : '';
        return `
          <div class="rep-row">
            <div class="rep-key">${escapeHtml(e.category || 'expense')}${extra}</div>
            <div class="rep-val">${fmtMoney(e.amount || 0)}</div>
          </div>
        `;
      }).join('')
    : `
      <div class="rep-row">
        <div class="rep-key rep-muted">No expenses recorded</div>
        <div class="rep-val rep-muted">${fmtMoney(0)}</div>
      </div>
    `;

  const mpgText = eco.mpg ? eco.mpg.toFixed(1) : 'N/A';
  const perMileText = eco.perMile != null ? fmtMoney(eco.perMile) : 'N/A';
  const perHourText = fmtMoney(eco.perHour);

  const html = `
    <div class="rep-card">
      <div class="rep-head">
        <div>
          <div class="rep-bigdate">${bigDate}</div>
          <div class="rep-small">${dateSmall} • ${timeRange}</div>
        </div>
        <div class="rep-duration">
          <div class="rep-durcap">DURATION</div>
          <div class="rep-durval">${duration}</div>
        </div>
      </div>

      <div class="rep-divider"></div>

      <div class="rep-info">
        <div class="rep-row">
          <div class="rep-key"><i class="fa-solid fa-road"></i> Distance</div>
          <div class="rep-val">${eco.dist} mi</div>
        </div>
        <div class="rep-row">
          <div class="rep-key"><i class="fa-solid fa-car"></i> Vehicle</div>
          <div class="rep-val">${vehicleName}</div>
        </div>
        <div class="rep-row">
          <div class="rep-key"><i class="fa-solid fa-cloud-sun"></i> Weather</div>
          <div class="rep-val">${weather}</div>
        </div>
      </div>

      <div class="rep-section">
        <div class="rep-title">EARNINGS</div>
        ${incomeLines}
        <div class="rep-divider soft"></div>
        <div class="rep-row rep-strong">
          <div class="rep-key">TOTAL</div>
          <div class="rep-val">${fmtMoney(eco.gross)}</div>
        </div>
      </div>

      <div class="rep-section">
        <div class="rep-title">EXPENSES</div>
        ${expLines}
        <div class="rep-divider soft"></div>
        <div class="rep-row rep-strong">
          <div class="rep-key">TOTAL</div>
          <div class="rep-val">${fmtMoney(eco.totalExp)}</div>
        </div>
      </div>

      <div class="rep-netbox">
        <div class="rep-net-left">
          <div class="rep-title">NET PROFIT</div>
          <div class="rep-metrics">
            <div class="rep-metric">
              <div class="rep-mcap">$/hr</div>
              <div class="rep-mval">${perHourText}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">$/mi</div>
              <div class="rep-mval">${perMileText}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">MPG</div>
              <div class="rep-mval">${mpgText}</div>
            </div>
          </div>
        </div>
        <div class="rep-net-right ${netCls}">
          ${fmtMoney(eco.net)}
        </div>
      </div>

      <button class="rep-close btn-bento" onclick="closeModals()">CLOSE REPORT</button>
    </div>
  `;

  const target = document.getElementById('shift-details-content');
  if (target) target.innerHTML = html;

  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE (palikta kaip tavo bazė)
// ────────────────────────────────────────────────────────────────
export function toggleSelectAll() { /* optional */ }

export function requestLogDelete() {
  const checked = document.querySelectorAll('.log-checkbox:checked');
  if (checked.length) {
    itemsToDelete = Array.from(checked).map(el => ({ type: el.value.split(':')[0], id: el.value.split(':')[1] }));
    const c = document.getElementById('del-modal-count');
    if (c) c.textContent = itemsToDelete.length;
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
  if (el) el.textContent = c;
}

export function exportAI() { /* optional */ }

// expose for inline onclick
if (typeof window !== 'undefined') {
  window.openShiftDetails = openShiftDetails;
  window.toggleAccordion = window.toggleAccordion || (() => {});
}
