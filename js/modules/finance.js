// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.1.1
// Fixes: safe select(*), month totals like OS 2.2, bento-like cards,
//        smaller time typography, fuel odometer guard
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
// FORMAT HELPERS
// ────────────────────────────────────────────────────────────────
function fmtHM(d) {
  return new Date(d).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function fmtLTDate(d) {
  // 2026-01-28 (kaip tavo screenshot)
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

function fmtDurationFromTimes(startISO, endISO) {
  if (!startISO || !endISO) return '…';
  const ms = Math.max(0, new Date(endISO).getTime() - new Date(startISO).getTime());
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtDurationHours(hrs) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs % 1) * 60);
  return `${h}h ${m}m`;
}

function money(n) {
  return formatCurrency(Number(n || 0));
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

export async function confirmTx() {
  vibrate([20]);

  const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
  if (!amount || amount <= 0) return showToast('Įveskite sumą', 'warning');

  const meta = {};
  if (txDraft.category === 'fuel') {
    meta.gallons = parseFloat(document.getElementById('tx-gal')?.value || 0) || 0;
    meta.odometer = parseInt(document.getElementById('tx-odo')?.value || 0, 10) || 0;

    // ✅ fuel odometer guard vs active shift start_odo
    if (state.activeShift?.id) {
      const startOdo = Number(state.activeShift.start_odo || 0);
      const odo = Number(meta.odometer || 0);

      if (odo > 0 && odo < startOdo) {
        return showToast(`Kuro rida per maža: ${odo} < start ${startOdo}`, 'warning');
      }
    }
  }

  state.loading = true;
  try {
    const { error } = await db.from('expenses').insert({
      user_id: state.user.id,
      shift_id: state.activeShift?.id || null,
      type: txDraft.direction === 'in' ? 'income' : 'expense',
      category: txDraft.category,
      amount,
      ...meta,
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    closeModals();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    showToast(e?.message || 'Klaida išsaugant', 'error');
  } finally {
    state.loading = false;
  }
}

// ────────────────────────────────────────────────────────────────
// AUDIT
// ────────────────────────────────────────────────────────────────
export async function refreshAudit() {
  const listEl = document.getElementById('audit-list');
  if (!state.user?.id || !listEl) return;

  try {
    // ✅ SAFE SELECT (prevents “missing old data” due to schema mismatch)
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

    if (shiftsRes.error) throw shiftsRes.error;
    if (expensesRes.error) throw expensesRes.error;

    const shifts = shiftsRes.data || [];
    const expenses = expensesRes.data || [];

    if (!shifts.length) {
      listEl.innerHTML = '<div class="text-center py-10 opacity-30">Nėra duomenų</div>';
      return;
    }

    window._auditData = { shifts, expenses };
    const grouped = groupData(shifts, expenses);
    listEl.innerHTML = renderHierarchy(grouped);
    updateDeleteButtonLocal();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = '<div class="text-center py-10 opacity-30">Klaida</div>';
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
    const inc = sExp.filter(e => e.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const exp = sExp.filter(e => e.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);

    const gross = Math.max(inc, Number(shift.gross_earnings) || 0);
    const net = gross - exp;

    years[y].net += net;
    years[y].months[m].net += net;

    years[y].months[m].items.push({
      ...shift,
      _date: date,
      net,
      gross,
      exp
    });
  });

  return years;
}

// ────────────────────────────────────────────────────────────────
// HISTORY RENDER (OS 2.2-like month totals)
// ────────────────────────────────────────────────────────────────
function renderHierarchy(data) {
  const monthsLT = ['SAUSIS','VASARIS','KOVAS','BALANDIS','GEGUŽĖ','BIRŽELIS','LIEPA','RUGPJŪTIS','RUGSĖJIS','SPALIS','LAPKRITIS','GRUODIS'];

  return Object.entries(data)
    .sort((a, b) => b[0] - a[0])
    .map(([y, yD]) => `
      <div class="mb-5">
        <div class="flex justify-between px-2 text-xs opacity-50 font-bold mb-2">
          <span>${y}</span><span>${formatCurrency(yD.net)}</span>
        </div>

        ${Object.entries(yD.months)
          .sort((a, b) => b[0] - a[0])
          .map(([m, mD]) => `
            <div class="mb-4">
              <!-- Month header like screenshot: SAUSIS — line — total -->
              <div class="px-2 flex items-end gap-3">
                <div class="text-teal-500 font-black text-2xl tracking-tight">${monthsLT[m]}</div>
                <div class="flex-1 border-b border-white/10 opacity-60 translate-y-[-6px]"></div>
                <div class="font-black text-lg tracking-tight">${formatCurrency(mD.net)}</div>
              </div>

              <div class="mt-3">
                ${mD.items.sort((a, b) => b._date - a._date).map(s => renderShiftCard(s)).join('')}
              </div>
            </div>
          `).join('')}
      </div>
    `).join('');
}

function renderStatusBadge(status) {
  if (status !== 'active' && status !== 'paused') return '';
  const label = status === 'active' ? 'ACTIVE' : 'PAUSED';
  const cls = status === 'active' ? 'status-badge status-active' : 'status-badge status-paused';
  return `<span class="${cls}">${label}</span>`;
}

// Bento-like: smaller time, less bold, cleaner layout
function renderShiftCard(s) {
  const dateStr = fmtLTDate(s.start_time);
  const t1 = fmtHM(s.start_time);
  const t2 = s.end_time ? fmtHM(s.end_time) : '…';

  const dur = s.end_time
    ? fmtDurationFromTimes(s.start_time, s.end_time)
    : (s.status === 'paused' ? 'PAUSED' : 'ACTIVE');

  const startOdo = Number(s.start_odo || 0);
  const endOdo = Number(s.end_odo || 0);
  const dist = (endOdo > 0 && endOdo >= startOdo) ? (endOdo - startOdo) : 0;

  const gross = Number(s.gross || s.gross_earnings || 0);
  const expSum = Number(s.exp || 0);
  const net = Number(s.net || 0);

  const vehicleName = escapeHtml(s.vehicles?.name || '—');
  const badge = renderStatusBadge(s.status);
  const netCls = net >= 0 ? 'text-green-400' : 'text-red-400';

  return `
    <div onclick="openShiftDetails('${s.id}')"
         class="os-card cursor-pointer border border-white/10 rounded-2xl px-4 py-3 mb-3 flex justify-between items-start">
      <div class="flex items-start gap-3 min-w-0">
        <input type="checkbox"
               onclick="event.stopPropagation(); updateDeleteButtonLocal()"
               value="shift:${s.id}"
               class="log-checkbox w-5 h-5 rounded border-gray-600 bg-transparent text-teal-500 mt-1">

        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-calendar text-teal-500 opacity-70 text-sm"></i>
            <div class="text-sm font-bold opacity-80">${dateStr}</div>
            ${badge}
          </div>

          <!-- smaller time line -->
          <div class="text-xl font-extrabold tracking-tight leading-tight mt-1">
            ${t1} - ${t2}
            <span class="text-sm font-bold opacity-55 ml-2">(${dur})</span>
          </div>

          <div class="flex items-center gap-4 mt-2 text-sm opacity-70">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-road opacity-70"></i>
              <span>${dist} mi</span>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <i class="fa-solid fa-car opacity-70"></i>
              <span class="truncate">${vehicleName}</span>
            </div>
          </div>

          <div class="flex items-center gap-4 mt-2 text-[11px] font-bold uppercase tracking-widest opacity-55">
            <span>Gross: ${money(gross)}</span>
            <span>Exp: ${money(expSum)}</span>
          </div>
        </div>
      </div>

      <div class="text-right pl-3">
        <div class="text-3xl font-black ${netCls} leading-none">${money(net)}</div>
        <div class="text-[11px] font-black uppercase tracking-widest opacity-55 mt-1">NET PROFIT</div>
      </div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// SHIFT DETAILS MODAL (kept from previous, still theme-safe)
// ────────────────────────────────────────────────────────────────
function calcShiftEconomics(s, expensesAll) {
  const sExp = expensesAll.filter(e => String(e.shift_id) === String(s.id));
  const income = sExp.filter(e => e.type === 'income');
  const expense = sExp.filter(e => e.type === 'expense');

  const incomeSum = income.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const gross = Math.max(incomeSum, Number(s.gross_earnings) || 0);
  const totalExp = expense.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const net = gross - totalExp;

  const dist = Math.max(0, (Number(s.end_odo) || 0) - (Number(s.start_odo) || 0));
  const durMs = new Date(s.end_time || new Date()) - new Date(s.start_time);
  const hrs = Math.max(0.1, durMs / (1000 * 60 * 60));

  const fuel = expense.find(e => e.category === 'fuel');
  const gal = fuel ? (parseFloat(fuel.gallons) || 0) : 0;
  const mpg = (gal > 0 && dist > 0) ? (dist / gal) : null;

  const perHour = net / hrs;
  const perMile = dist > 0 ? (net / dist) : null;

  return { sExp, income, expense, gross, totalExp, net, dist, hrs, gal, mpg, perHour, perMile };
}

function fmtTimeRange(s) {
  const t1 = fmtHM(s.start_time);
  const t2 = s.end_time ? fmtHM(s.end_time) : '…';
  return { t1, t2 };
}

function renderAccItem(key, title, iconClass, lines, isOpen = false) {
  const safe = escapeHtml(lines);
  return `
    <div class="acc-item">
      <button class="acc-header" onclick="toggleAccordion('${key}')">
        <div class="acc-head-left">
          <i class="fa-solid ${iconClass} acc-ico"></i>
          <span class="acc-title">${escapeHtml(title)}</span>
        </div>
        <i class="fa-solid fa-chevron-down acc-chevron ${isOpen ? 'open' : ''}"></i>
      </button>
      <div id="acc-${key}" class="acc-panel ${isOpen ? 'open' : ''}">
        <div class="acc-body">
          <pre class="ascii-pre ascii-soft">${safe}</pre>
        </div>
      </div>
    </div>
  `;
}

export function toggleAccordion(key) {
  const panel = document.getElementById(`acc-${key}`);
  const btn = panel?.previousElementSibling;
  const chev = btn?.querySelector('.acc-chevron');
  if (!panel) return;

  const open = panel.classList.contains('open');
  panel.classList.toggle('open', !open);
  chev?.classList.toggle('open', !open);
}

export function openShiftDetails(id) {
  vibrate([10]);

  const shifts = window._auditData?.shifts || [];
  const expenses = window._auditData?.expenses || [];
  const s = shifts.find(x => String(x.id) === String(id));
  if (!s) return;

  const eco = calcShiftEconomics(s, expenses);
  const { t1, t2 } = fmtTimeRange(s);

  const vehicleName = escapeHtml(s.vehicles?.name || '—');
  const dateStr = fmtLTDate(s.start_time);
  const weather = escapeHtml(s.weather || '—');

  const headBlock =
`${dateStr}
${t1} - ${t2}   (${fmtDurationHours(eco.hrs)})
Vehicle: ${vehicleName}`;

  const detailsBlock =
`Duration: ${fmtDurationHours(eco.hrs)}
Distance: ${eco.dist} mi
Weather:  ${weather}`;

  const earningsLines = eco.income.length
    ? eco.income.map((i, idx) => {
        const branch = idx === eco.income.length - 1 ? '└─' : '├─';
        return `${branch} ${i.category}: ${money(i.amount || 0)}`;
      }).join('\n')
    : `└─ App (Uber): ${money(eco.gross)}`;

  const earningsBlock =
`${earningsLines}
Total: ${money(eco.gross)}`;

  const expenseLines = eco.expense.length
    ? eco.expense.map((e, idx) => {
        const branch = idx === eco.expense.length - 1 ? '└─' : '├─';
        const extra = e.category === 'fuel' ? ` (${Number(e.gallons || 0)} gal)` : '';
        return `${branch} ${e.category}: ${money(e.amount || 0)}${extra}`;
      }).join('\n')
    : `└─ None`;

  const mpgLine = eco.mpg ? eco.mpg.toFixed(1) : '—';
  const cpm = eco.dist > 0 ? (eco.totalExp / eco.dist).toFixed(2) : '0.00';

  const expensesBlock =
`${expenseLines}
→ MPG: ${mpgLine}
→ Cost/mi: $${cpm}
Total: ${money(eco.totalExp)}`;

  const economicsBlock =
`Net: ${money(eco.net)}
Per mile: ${eco.perMile !== null ? money(eco.perMile) : '—'}
Per hour: ${money(eco.perHour)}`;

  const html =
    `<div class="shift-modal-paper theme-surface">
        <div class="shift-modal-head">
          <pre class="ascii-pre ascii-head ascii-soft">${escapeHtml(headBlock)}</pre>
        </div>

        <div class="acc-wrap">
          ${renderAccItem('details', 'SHIFT DETAILS', 'fa-chart-column', detailsBlock, true)}
          ${renderAccItem('earnings', 'EARNINGS', 'fa-sack-dollar', earningsBlock, true)}
          ${renderAccItem('expenses', 'EXPENSES', 'fa-money-bill', expensesBlock, true)}
          ${renderAccItem('economics', 'ECONOMICS', 'fa-chart-line', economicsBlock, true)}
        </div>
     </div>`;

  const target = document.getElementById('shift-details-content');
  if (target) target.innerHTML = html;

  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE
// ────────────────────────────────────────────────────────────────
export function toggleSelectAll() {
  const selectAll = document.getElementById('select-all-logs');
  const checked = !!selectAll?.checked;

  document.querySelectorAll('.log-checkbox').forEach(cb => {
    cb.checked = checked;
  });

  updateDeleteButtonLocal();
}

export function requestLogDelete() {
  const checked = document.querySelectorAll('.log-checkbox:checked');
  if (!checked.length) return;

  itemsToDelete = Array.from(checked).map(el => ({
    type: String(el.value || '').split(':')[0],
    id: String(el.value || '').split(':')[1]
  }));

  const cEl = document.getElementById('del-modal-count');
  if (cEl) cEl.textContent = String(itemsToDelete.length);

  openModal('delete-modal');
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
    await refreshAudit();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    console.error(e);
    showToast(e?.message || 'Klaida trinant', 'error');
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

// ────────────────────────────────────────────────────────────────
// EXPORT
// ────────────────────────────────────────────────────────────────
export function exportAI() {
  try {
    const payload = window._auditData || { shifts: [], expenses: [] };
    const text = JSON.stringify(payload, null, 2);

    navigator.clipboard?.writeText(text);
    showToast('Nukopijuota į Clipboard!', 'success');
  } catch (e) {
    showToast('Nepavyko eksportuoti', 'error');
  }
}
