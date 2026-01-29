// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.6.2 (RESTORE 1.8 LOOK + REPORT)
// - No Tailwind dependency for audit UI
// - Compact shift strips + Month header with line + Month total
// - Report modal (big date + big NET + small details)
// - Monochrome FontAwesome icons (no emoji)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

// ────────────────────────────────────────────────────────────────
// TX MODAL (paliekam kaip buvo, minimaliai tvarkingai)
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
    let meta = {};
    if (txDraft.category === 'fuel') {
      meta.gallons = parseFloat(document.getElementById('tx-gal')?.value) || 0;
      meta.odometer = parseInt(document.getElementById('tx-odo')?.value) || 0;
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
    showToast(e.message || 'Klaida', 'error');
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
// AUDIT ENGINE (HISTORY)
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
  const listEl = document.getElementById('audit-list');
  if (!state.user?.id || !listEl) return;

  try {
    const [shiftsRes, expensesRes] = await Promise.all([
      db.from('finance_shifts')
        .select('*, vehicles(name)')
        .eq('user_id', state.user.id)
        .order('start_time', { ascending: false }),
      db.from('expenses')
        .select('*')
        .eq('user_id', state.user.id)
    ]);

    const shifts = shiftsRes.data || [];
    const expenses = expensesRes.data || [];

    if (!shifts.length) {
      listEl.innerHTML = `<div class="os-empty">Nėra duomenų</div>`;
      return;
    }

    window._auditData = { shifts, expenses }; // cache for modal
    const grouped = groupData(shifts, expenses);
    listEl.innerHTML = renderHierarchy(grouped);
    updateDeleteButtonLocal();
  } catch (e) {
    listEl.innerHTML = `<div class="os-empty">Klaida</div>`;
  }
}

function groupData(shifts, expenses) {
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

    // gross: jei yra income įrašų - imam juos, kitaip shift.gross_earnings
    const gross = Math.max(inc, shift.gross_earnings || 0);
    const net = gross - exp;

    years[y].net += net;
    years[y].months[m].net += net;
    years[y].months[m].items.push({
      ...shift,
      _date: date,
      sExp,
      net,
      gross,
      exp
    });
  });

  return years;
}

// ────────────────────────────────────────────────────────────────
// RENDERERS (no tailwind classes)
// ────────────────────────────────────────────────────────────────

function renderHierarchy(data) {
  const monthsLT = ['SAUSIS','VASARIS','KOVAS','BALANDIS','GEGUŽĖ','BIRŽELIS','LIEPA','RUGPJŪTIS','RUGSĖJIS','SPALIS','LAPKRITIS','GRUODIS'];

  return Object.entries(data)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([y, yD]) => {
      const monthsHtml = Object.entries(yD.months)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([m, mD]) => {
          const items = (mD.items || [])
            .sort((a, b) => b._date - a._date)
            .map(s => renderShiftStrip(s))
            .join('');

          return `
            <section class="history-month">
              <div class="month-head">
                <div class="month-left">${monthsLT[Number(m)]}</div>
                <div class="month-line"></div>
                <div class="month-right">${formatCurrency(mD.net)}</div>
              </div>
              <div class="month-items">${items}</div>
            </section>
          `;
        })
        .join('');

      return `
        <section class="history-year">
          <div class="history-year-row">
            <span>${y}</span>
            <span>${formatCurrency(yD.net)}</span>
          </div>
          ${monthsHtml}
        </section>
      `;
    })
    .join('');
}

function renderShiftStrip(s) {
  const d = s._date;
  const dateStr = d.toLocaleDateString('lt-LT');
  const t1 = new Date(s.start_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
  const t2 = s.end_time
    ? new Date(s.end_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
    : '...';

  const durMin = calcDurationMinutes(s.start_time, s.end_time);
  const durStr = durMinToLabel(durMin);

  const vehicleName = s.vehicles?.name || '—';
  const miles = calcMiles(s);

  const netCls = s.net >= 0 ? 'net-pos' : 'net-neg';

  // NOTE: checkbox click must not open modal
  return `
    <div class="os-strip" onclick="openShiftDetails('${escapeAttr(s.id)}')">
      <div class="os-strip-left">
        <input
          type="checkbox"
          class="log-checkbox"
          value="shift:${escapeAttr(s.id)}"
          onclick="event.stopPropagation(); updateDeleteButtonLocal()"
          aria-label="Select shift"
        />
        <div class="os-strip-main">
          <div class="os-strip-top">
            <div class="os-strip-date">${escapeHtml(dateStr)}</div>
            <div class="os-strip-time">${escapeHtml(t1)} - ${escapeHtml(t2)}</div>
            <div class="os-strip-dur">(${escapeHtml(durStr)})</div>
          </div>

          <div class="os-strip-sub">
            <span class="os-sub">
              <i class="fa-solid fa-car"></i>
              ${escapeHtml(vehicleName)}
            </span>
            <span class="os-sub-dot">•</span>
            <span class="os-sub">
              <i class="fa-solid fa-road"></i>
              ${escapeHtml(String(miles))} mi
            </span>
          </div>
        </div>
      </div>

      <div class="os-strip-right">
        <div class="os-strip-net ${netCls}">${formatCurrency(s.net)}</div>
        <div class="os-strip-netcap">NET PROFIT</div>
      </div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// REPORT MODAL (restore “white card / report” vibe, theme-safe)
// ────────────────────────────────────────────────────────────────

export function openShiftDetails(id) {
  vibrate([10]);
  const data = window._auditData;
  if (!data?.shifts?.length) return;

  const s = data.shifts.find(x => String(x.id) === String(id));
  if (!s) return;

  const sExp = (data.expenses || []).filter(e => String(e.shift_id) === String(id));
  const income = sExp.filter(e => e.type === 'income');
  const expense = sExp.filter(e => e.type === 'expense');

  const gross = Math.max(income.reduce((a, b) => a + (b.amount || 0), 0), s.gross_earnings || 0);
  const totalExp = expense.reduce((a, b) => a + (b.amount || 0), 0);
  const net = gross - totalExp;

  const miles = calcMiles(s);
  const durMin = calcDurationMinutes(s.start_time, s.end_time);
  const hrs = Math.max(0.1, durMin / 60);

  // fuel stats (optional)
  const fuel = expense.find(e => e.category === 'fuel');
  const gal = fuel ? (parseFloat(fuel.gallons) || 0) : 0;
  const mpg = (gal > 0 && miles > 0) ? (miles / gal).toFixed(1) : '—';

  const netPerHr = (net / hrs);
  const netPerMi = (net / Math.max(1, miles));

  const bigDate = new Date(s.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const timeRange = `${new Date(s.start_time).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'})} - ${s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'}) : '...'}`;

  const vehicleName = s.vehicles?.name || '—';
  const weather = s.weather || '—';

  const html = `
    <div class="rep-card">
      <div class="rep-head">
        <div>
          <div class="rep-bigdate">${escapeHtml(bigDate)}</div>
          <div class="rep-small">${escapeHtml(timeRange)}</div>
        </div>

        <div class="rep-duration">
          <div class="rep-durcap">DURATION</div>
          <div class="rep-durval">${escapeHtml(durMinToLong(durMin))}</div>
        </div>
      </div>

      <div class="rep-divider"></div>

      <div class="rep-info">
        <div class="rep-row">
          <div class="rep-key"><i class="fa-solid fa-road"></i> Distance</div>
          <div class="rep-val">${escapeHtml(String(miles))} mi</div>
        </div>
        <div class="rep-row">
          <div class="rep-key"><i class="fa-solid fa-car"></i> Vehicle</div>
          <div class="rep-val">${escapeHtml(vehicleName)}</div>
        </div>
        <div class="rep-row">
          <div class="rep-key"><i class="fa-solid fa-cloud"></i> Weather</div>
          <div class="rep-val">${escapeHtml(weather)}</div>
        </div>
      </div>

      <div class="rep-section">
        <div class="rep-title">EARNINGS</div>
        <div class="rep-row rep-strong">
          <div class="rep-key">GROSS</div>
          <div class="rep-val">${formatCurrency(gross)}</div>
        </div>
      </div>

      <div class="rep-section">
        <div class="rep-title">EXPENSES</div>
        <div class="rep-row rep-strong">
          <div class="rep-key">TOTAL</div>
          <div class="rep-val">${formatCurrency(totalExp)}</div>
        </div>
      </div>

      <div class="rep-netbox">
        <div>
          <div class="rep-title" style="margin-bottom:8px;">NET PROFIT</div>
          <div class="rep-metrics">
            <div class="rep-metric">
              <div class="rep-mcap">$/hr</div>
              <div class="rep-mval">${formatCurrency(netPerHr)}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">$/mi</div>
              <div class="rep-mval">${formatCurrency(netPerMi)}</div>
            </div>
            <div class="rep-metric">
              <div class="rep-mcap">MPG</div>
              <div class="rep-mval">${escapeHtml(String(mpg))}</div>
            </div>
          </div>
        </div>

        <div class="rep-net-right ${net >= 0 ? 'net-pos' : 'net-neg'}">
          ${formatCurrency(net)}
        </div>
      </div>

      <button class="btn-primary-os rep-close" onclick="closeModals()">CLOSE REPORT</button>
    </div>
  `;

  const holder = document.getElementById('shift-details-content');
  if (holder) holder.innerHTML = html;

  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE LOGIC (list only)
// ────────────────────────────────────────────────────────────────
export function toggleSelectAll() {
  const all = document.querySelectorAll('.log-checkbox');
  const checked = document.querySelectorAll('.log-checkbox:checked');
  const willCheck = checked.length !== all.length;
  all.forEach(cb => cb.checked = willCheck);
  updateDeleteButtonLocal();
}

export function requestLogDelete() {
  const checked = document.querySelectorAll('.log-checkbox:checked');
  if (checked.length) {
    itemsToDelete = Array.from(checked).map(el => ({ type: el.value.split(':')[0], id: el.value.split(':')[1] }));
    const cnt = document.getElementById('del-modal-count');
    if (cnt) cnt.textContent = String(itemsToDelete.length);
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
    if (tIds.length) await db.from('expenses').delete().in('id', tIds);

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
  const dc = document.getElementById('delete-count');
  if (dc) dc.textContent = String(c);
}

export function exportAI() {
  // paliekam tuščią (kaip pas tave)
}

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────

function calcMiles(s) {
  const a = Number(s.start_odo || 0);
  const b = Number(s.end_odo || 0);
  const dist = Math.max(0, b - a);
  return dist;
}

function calcDurationMinutes(start, end) {
  try {
    const t1 = new Date(start).getTime();
    const t2 = end ? new Date(end).getTime() : Date.now();
    const ms = Math.max(0, t2 - t1);
    return Math.round(ms / (1000 * 60));
  } catch {
    return 0;
  }
}

function durMinToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function durMinToLong(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(str) {
  // minimal for attributes
  return escapeHtml(str).replaceAll('`', '&#96;');
}
