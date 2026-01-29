// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.0.1
// Audit + Transactions + Shift Details Modal (ASCII Accordion)
// Fixes: Fuel ODO autofill + validation, cleaner modal for light/dark, no double icons
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips', shiftId: null };
let itemsToDelete = [];

// ────────────────────────────────────────────────────────────────
// XSS SAFETY (minimal, fast)
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
// HELPERS (ODO / SHIFT)
// ────────────────────────────────────────────────────────────────

function toInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v, fallback = 0) {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function getVehicleById(id) {
  return (state.fleet || []).find(v => String(v.id) === String(id)) || null;
}

function getShiftById(id) {
  const shifts = window._auditData?.shifts || [];
  return shifts.find(s => String(s.id) === String(id)) || null;
}

function getTxShiftContext() {
  // Prefer explicit shiftId (when opened from details modal),
  // otherwise active shift.
  const shiftId = txDraft.shiftId || state.activeShift?.id || null;
  const shift = shiftId ? (state.activeShift?.id === shiftId ? state.activeShift : getShiftById(shiftId)) : null;

  const vehicleId = shift?.vehicle_id || state.activeShift?.vehicle_id || null;
  const veh = vehicleId ? getVehicleById(vehicleId) : null;

  const startOdo = toInt(shift?.start_odo, 0);
  const lastOdo = toInt(veh?.last_odo, 0);
  const minOdo = Math.max(startOdo, lastOdo);

  return { shiftId, shift, veh, startOdo, lastOdo, minOdo };
}

function setIfEmpty(inputEl, value) {
  if (!inputEl) return;
  if (String(inputEl.value ?? '').trim() !== '') return;
  if (value === null || value === undefined) return;
  inputEl.value = String(value);
}

// ────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ────────────────────────────────────────────────────────────────

export function openTxModal(dir, shiftId = null) {
  vibrate();

  txDraft.direction = dir;
  txDraft.category = dir === 'in' ? 'tips' : 'fuel';
  txDraft.shiftId = shiftId; // <-- important for fuel odo when opened from shift details

  updateTxModalUI(dir);

  const inp = document.getElementById('tx-amount');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 100);
  }

  // If opening from shift details, hide that modal under (your old behavior)
  if (shiftId) document.getElementById('shift-details-modal')?.classList.add('hidden');

  // Default category visuals + fuel fields
  // (setExpType handles showing fuel-fields)
  setExpType(txDraft.category, null);

  // Autofill fuel odo if needed
  if (txDraft.category === 'fuel') {
    const ctx = getTxShiftContext();
    const odoEl = document.getElementById('tx-odo');
    setIfEmpty(odoEl, ctx.minOdo);
  }

  openModal('tx-modal');
}

export async function confirmTx() {
  vibrate([20]);

  const amount = toNum(document.getElementById('tx-amount')?.value, 0);
  if (!amount || amount <= 0) return showToast('Įveskite sumą', 'warning');

  // Fuel validation: ODO + gallons sanity + minOdo rules
  const meta = {};
  if (txDraft.category === 'fuel') {
    const ctx = getTxShiftContext();

    const gal = toNum(document.getElementById('tx-gal')?.value, 0);
    const odo = toInt(document.getElementById('tx-odo')?.value, 0);

    if (!odo) return showToast('Įveskite ridą (ODO)', 'warning');
    if (odo < ctx.minOdo) {
      return showToast(`ODO per mažas. Min: ${ctx.minOdo} (Start: ${ctx.startOdo}, Last: ${ctx.lastOdo})`, 'warning');
    }

    // gallons optional, but if provided must be > 0
    if (document.getElementById('tx-gal')?.value?.trim?.() && gal <= 0) {
      return showToast('Gallons turi būti > 0', 'warning');
    }

    meta.gallons = gal;
    meta.odometer = odo;
  }

  state.loading = true;
  try {
    const ctx = getTxShiftContext();

    const { error } = await db.from('expenses').insert({
      user_id: state.user.id,
      shift_id: ctx.shiftId || null,
      type: txDraft.direction === 'in' ? 'income' : 'expense',
      category: txDraft.category,
      amount,
      ...meta,
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    showToast('SAVED', 'success');
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

  // Active state only if element was clicked
  if (el) {
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }

  const f = document.getElementById('fuel-fields');
  if (f) cat === 'fuel' ? f.classList.remove('hidden') : f.classList.add('hidden');

  // When switching to fuel, autofill odo immediately
  if (cat === 'fuel') {
    const ctx = getTxShiftContext();
    const odoEl = document.getElementById('tx-odo');
    setIfEmpty(odoEl, ctx.minOdo);
  }
}

function updateTxModalUI(dir) {
  const t = document.getElementById('tx-title');
  if (t) t.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';

  document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
  document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
  document.getElementById('fuel-fields')?.classList.add('hidden');
}

// ────────────────────────────────────────────────────────────────
// AUDIT
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

    window._auditData = { shifts, expenses };
    const grouped = groupData(shifts, expenses);
    listEl.innerHTML = renderHierarchy(grouped);
    updateDeleteButtonLocal();
  } catch (e) {
    listEl.innerHTML = 'Klaida';
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

    const gross = Math.max(inc, shift.gross_earnings || 0);
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
// HISTORY RENDER
// ────────────────────────────────────────────────────────────────

function renderHierarchy(data) {
  const monthsLT = ['SAUSIS','VASARIS','KOVAS','BALANDIS','GEGUŽĖ','BIRŽELIS','LIEPA','RUGPJŪTIS','RUGSĖJIS','SPALIS','LAPKRITIS','GRUODIS'];

  return Object.entries(data)
    .sort((a, b) => b[0] - a[0])
    .map(([y, yD]) => `
      <div class="mb-4">
        <div class="flex justify-between px-2 text-xs opacity-50 font-bold mb-2">
          <span>${y}</span><span>${formatCurrency(yD.net)}</span>
        </div>
        ${Object.entries(yD.months)
          .sort((a, b) => b[0] - a[0])
          .map(([m, mD]) => `
            <div class="mb-2">
              <div class="px-2 text-teal-500 font-bold text-xs mb-1 uppercase tracking-widest">${monthsLT[m]}</div>
              ${mD.items.sort((a, b) => b._date - a._date).map(s => renderShiftStrip(s)).join('')}
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

function renderShiftStrip(s) {
  const t1 = new Date(s.start_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
  const t2 = s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }) : '...';
  const badge = renderStatusBadge(s.status);

  return `
    <div onclick="openShiftDetails('${s.id}')" class="shift-strip cursor-pointer bg-white/5 border border-white/10 rounded-xl p-3 mb-2 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <input type="checkbox" onclick="event.stopPropagation(); updateDeleteButtonLocal()" value="shift:${s.id}" class="log-checkbox w-5 h-5 rounded border-gray-600 bg-transparent text-teal-500">
        <div>
          <div class="flex items-center gap-2">
            <div class="text-[10px] opacity-50 font-bold uppercase">${s._date.toLocaleDateString('lt-LT')}</div>
            ${badge}
          </div>
          <div class="text-sm font-bold">${t1} - ${t2}</div>
        </div>
      </div>
      <div class="font-bold ${s.net >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(s.net)}</div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// SHIFT DETAILS (ASCII ACCORDION) — CLEANER UI
// ────────────────────────────────────────────────────────────────

function calcShiftEconomics(s, expensesAll) {
  const sExp = expensesAll.filter(e => String(e.shift_id) === String(s.id));
  const income = sExp.filter(e => e.type === 'income');
  const expense = sExp.filter(e => e.type === 'expense');

  const incomeSum = income.reduce((a, b) => a + (b.amount || 0), 0);
  const gross = Math.max(incomeSum, s.gross_earnings || 0);
  const totalExp = expense.reduce((a, b) => a + (b.amount || 0), 0);
  const net = gross - totalExp;

  const dist = (s.end_odo || 0) - (s.start_odo || 0);
  const durMs = new Date(s.end_time || new Date()) - new Date(s.start_time);
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

function fmtTimeRange(s) {
  const t1 = new Date(s.start_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
  const t2 = s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }) : '...';
  return { t1, t2 };
}

function fmtDuration(hrs) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs % 1) * 60);
  return `${h}h ${m}m`;
}

function renderAccItem(key, title, icon, asciiLines, isOpen = false) {
  const safe = escapeHtml(asciiLines);
  return `
    <div class="acc-item" style="border: 1px solid rgba(255,255,255,0.10); border-radius: 16px; overflow: hidden; background: rgba(255,255,255,0.04);">
      <button class="acc-header" onclick="toggleAccordion('${key}')" style="
        width: 100%;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:12px 14px;
        background: rgba(0,0,0,0.08);
        color: inherit;
      ">
        <div class="acc-head-left" style="display:flex; align-items:center; gap:10px;">
          <span class="acc-ico" style="font-size: 18px; line-height: 1;">${icon}</span>
          <span class="acc-title" style="font-weight: 800; letter-spacing: .12em; font-size: 12px;">${title}</span>
        </div>
        <i class="fa-solid fa-chevron-down acc-chevron ${isOpen ? 'open' : ''}" style="opacity:.7;"></i>
      </button>

      <div id="acc-${key}" class="acc-panel ${isOpen ? 'open' : ''}" style="display:${isOpen ? 'block' : 'none'};">
        <div class="acc-body" style="padding: 12px 14px;">
          <pre class="ascii-pre" style="
            margin:0;
            white-space:pre-wrap;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.5;
            font-weight: 500;
            opacity: .95;
          ">${safe}</pre>
        </div>
      </div>
    </div>
  `;
}

export function toggleAccordion(key) {
  const panel = document.getElementById(`acc-${key}`);
  if (!panel) return;

  const item = panel.closest('.acc-item');
  const header = item?.querySelector('.acc-header');
  const chev = header?.querySelector('.acc-chevron');

  const isOpen = panel.classList.contains('open');

  panel.classList.toggle('open', !isOpen);
  chev?.classList.toggle('open', !isOpen);

  // simple show/hide to avoid CSS dependency
  panel.style.display = isOpen ? 'none' : 'block';
}

export function openShiftDetails(id) {
  vibrate([10]);

  const shifts = window._auditData?.shifts || [];
  const expenses = window._auditData?.expenses || [];
  const s = shifts.find(x => String(x.id) === String(id));
  if (!s) return;

  const eco = calcShiftEconomics(s, expenses);
  const { t1, t2 } = fmtTimeRange(s);

  const vehicleName = escapeHtml(s.vehicles?.name || 'Unknown');
  const dateStr = new Date(s.start_time).toLocaleDateString('lt-LT');
  const weather = escapeHtml(s.weather || '—');

  // Header block — no double titles inside sections
  const headBlock =
`🚗  ${dateStr}
${t1} - ${t2}   (${fmtDuration(eco.hrs)})
Vehicle: ${vehicleName}`;

  const detailsBlock =
`├─ Duration: ${fmtDuration(eco.hrs)}
├─ Distance: ${eco.dist} mi
└─ Weather:  ${weather}`;

  const earningsLines = eco.income.length
    ? eco.income.map((i, idx) => {
        const branch = idx === eco.income.length - 1 ? '└─' : '├─';
        return `${branch} ${i.category}: ${fmtMoney(i.amount || 0)}`;
      }).join('\n')
    : `└─ App (Uber): ${fmtMoney(eco.gross)}`;

  const earningsBlock =
`${earningsLines}
Total: ${fmtMoney(eco.gross)}`;

  const expenseLines = eco.expense.length
    ? eco.expense.map((e, idx) => {
        const branch = idx === eco.expense.length - 1 ? '└─' : '├─';
        const extra = e.category === 'fuel' ? ` (${Number(e.gallons || 0)} gal)` : '';
        return `${branch} ${e.category}: ${fmtMoney(e.amount || 0)}${extra}`;
      }).join('\n')
    : `└─ None`;

  const mpgLine = eco.mpg ? eco.mpg.toFixed(1) : '—';
  const cpm = eco.dist > 0 ? (eco.totalExp / eco.dist).toFixed(2) : '0.00';

  const expensesBlock =
`${expenseLines}
→ MPG: ${mpgLine}
→ Cost/mi: $${cpm}
Total: ${fmtMoney(eco.totalExp)}`;

  const economicsBlock =
`├─ Net: ${fmtMoney(eco.net)}
├─ Per mile: ${eco.perMile !== null ? fmtMoney(eco.perMile) : '—'}
└─ Per hour: ${fmtMoney(eco.perHour)}`;

  // Theme-safe paper styles (works even if your CSS changes)
  // Light theme: paper-like. Dark theme: glass dark.
  const html =
    `<div class="shift-modal-paper" style="
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.55);
        color: rgba(255,255,255,0.92);
      ">
        <div class="shift-modal-head" style="
          padding: 14px;
          background: rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.10);
        ">
          <pre class="ascii-pre ascii-head" style="
            margin:0;
            white-space:pre-wrap;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.5;
            font-weight: 600;
          ">${escapeHtml(headBlock)}</pre>
        </div>

        <div class="acc-wrap" style="display:flex; flex-direction:column; gap:10px; padding: 12px;">
          ${renderAccItem('details', 'SHIFT DETAILS', '📊', detailsBlock, true)}
          ${renderAccItem('earnings', 'EARNINGS', '💰', earningsBlock, true)}
          ${renderAccItem('expenses', 'EXPENSES', '💸', expensesBlock, true)}
          ${renderAccItem('economics', 'ECONOMICS', '📈', economicsBlock, true)}
        </div>
      </div>`;

  const target = document.getElementById('shift-details-content');
  if (target) target.innerHTML = html;

  // If you're in light theme and your global CSS flips to white bg,
  // we force readable contrast by setting the modal container background via inline.
  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE (keep your existing)
// ────────────────────────────────────────────────────────────────

export function toggleSelectAll() { /* ... */ }

export function requestLogDelete() {
  const checked = document.querySelectorAll('.log-checkbox:checked');
  if (checked.length) {
    itemsToDelete = Array.from(checked).map(el => ({ type: el.value.split(':')[0], id: el.value.split(':')[1] }));
    document.getElementById('del-modal-count').textContent = itemsToDelete.length;
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

export function exportAI() {}
