// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.0.2
// Goal: v1.8 strip feel (one shift = one strip), minimalist on strip:
// - date, started, ended, total hours, miles
// Tap strip -> full details (includes pauses summary)
// Keeps delete selection + tx behavior
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
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toLTDateShort(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function toLTTime(d) {
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function hoursBetween(startISO, endISO) {
  const a = new Date(startISO).getTime();
  const b = new Date(endISO || new Date().toISOString()).getTime();
  const ms = Math.max(0, b - a);
  return ms / (1000 * 60 * 60);
}

function fmtHHMM(hrs) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return `${h}h ${m}m`;
}

function shiftMiles(s) {
  const a = Number(s.start_odo || 0);
  const b = Number(s.end_odo || 0);
  const dist = b - a;
  return Number.isFinite(dist) ? Math.max(0, dist) : 0;
}

function sum(arr, fn) {
  return arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);
}

function netClass(net) {
  return net >= 0 ? 'text-green-400' : 'text-red-400';
}

function fmtMinutes(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function minutesBetween(aISO, bISO) {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  const ms = Math.max(0, b - a);
  return ms / (1000 * 60);
}

// ────────────────────────────────────────────────────────────────
// TRANSACTIONS (keep behavior)
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
// AUDIT / HISTORY — STRIPS ONLY (minimal strip content)
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
  const listEl = document.getElementById('audit-list');
  if (!state.user?.id || !listEl) return;

  try {
    const [shiftsRes, expensesRes, pausesRes] = await Promise.all([
      db
        .from('finance_shifts')
        .select('*, vehicles(name)')
        .eq('user_id', state.user.id)
        .order('start_time', { ascending: false }),
      db
        .from('expenses')
        .select('*')
        .eq('user_id', state.user.id),
      db
        .from('finance_shift_pauses')
        .select('*')
        .eq('user_id', state.user.id)
    ]);

    const shifts = shiftsRes.data || [];
    const expenses = expensesRes.data || [];
    const pauses = pausesRes.data || [];

    if (!shifts.length) {
      listEl.innerHTML = '<div class="text-center py-10 opacity-30">Nėra duomenų</div>';
      return;
    }

    // cache for modal
    window._auditData = { shifts, expenses, pauses };

    // index expenses by shift
    const expByShift = {};
    for (const e of expenses) {
      const k = String(e.shift_id || '');
      if (!k) continue;
      if (!expByShift[k]) expByShift[k] = [];
      expByShift[k].push(e);
    }

    // index pauses by shift
    const pausesByShift = {};
    for (const p of pauses) {
      const k = String(p.shift_id || '');
      if (!k) continue;
      if (!pausesByShift[k]) pausesByShift[k] = [];
      pausesByShift[k].push(p);
    }

    listEl.innerHTML = shifts.map(s => {
      const start = new Date(s.start_time);
      const end = s.end_time ? new Date(s.end_time) : null;

      const hrs = hoursBetween(s.start_time, s.end_time);
      const dist = shiftMiles(s);

      const dateShort = toLTDateShort(start);
      const t1 = toLTTime(start);
      const t2 = end ? toLTTime(end) : '...';

      // Net for right side (v1.8 feel)
      const sExp = expByShift[String(s.id)] || [];
      const income = sExp.filter(x => x.type === 'income');
      const expense = sExp.filter(x => x.type === 'expense');
      const incSum = sum(income, x => x.amount);
      const expSum = sum(expense, x => x.amount);
      const gross = Math.max(incSum, Number(s.gross_earnings || 0));
      const net = gross - expSum;

      // Status badge (optional, but cheap and nice)
      const badge =
        s.status === 'paused'
          ? `<span class="status-badge status-paused">PAUSE</span>`
          : s.status === 'active'
          ? `<span class="status-badge status-active">ACTIVE</span>`
          : '';

      // Minimal strip: date, start-end, hours, miles (on the bar)
      return `
        <div class="shift-strip flex items-center justify-between gap-3" onclick="openShiftDetails('${s.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <input
              type="checkbox"
              class="log-checkbox"
              onclick="event.stopPropagation(); updateDeleteButtonLocal()"
              value="shift:${s.id}"
            />

            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-widest opacity-70">
                ${dateShort} • ${t1}–${t2} • ${fmtHHMM(hrs)} • ${dist}mi
              </div>
              <div class="text-sm font-bold tracking-tight flex items-center gap-2">
                <span class="truncate">${safeText(s.vehicles?.name || 'Vehicle')}</span>
                ${badge}
              </div>
            </div>
          </div>

          <div class="font-bold ${netClass(net)} text-right">
            ${formatCurrency(net)}
          </div>
        </div>
      `;
    }).join('');

    updateDeleteButtonLocal();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = 'Klaida';
  }
}

// ────────────────────────────────────────────────────────────────
// SHIFT DETAILS MODAL — full info (includes pauses summary)
// ────────────────────────────────────────────────────────────────

export function openShiftDetails(id) {
  vibrate([10]);

  const shifts = window._auditData?.shifts || [];
  const expenses = window._auditData?.expenses || [];
  const pauses = window._auditData?.pauses || [];

  const s = shifts.find(x => String(x.id) === String(id));
  if (!s) return;

  const sExp = expenses.filter(e => String(e.shift_id) === String(id));
  const income = sExp.filter(e => e.type === 'income');
  const expense = sExp.filter(e => e.type === 'expense');

  const incSum = sum(income, x => x.amount);
  const expSum = sum(expense, x => x.amount);
  const gross = Math.max(incSum, Number(s.gross_earnings || 0));
  const net = gross - expSum;

  const dist = shiftMiles(s);
  const hrs = hoursBetween(s.start_time, s.end_time);

  // Pauses
  const sPauses = pauses
    .filter(p => String(p.shift_id) === String(id))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const pauseMinutes = sum(sPauses, p => {
    if (!p.start_time) return 0;
    const endISO = p.end_time || new Date().toISOString();
    return minutesBetween(p.start_time, endISO);
  });

  const vehicleName = safeText(s.vehicles?.name || 'Unknown');
  const start = new Date(s.start_time);
  const end = s.end_time ? new Date(s.end_time) : null;

  const header = `${toLTDateShort(start)} • ${toLTTime(start)}${end ? `–${toLTTime(end)}` : ''}`;

  const lines = [
    `VEHICLE: ${vehicleName}`,
    `TIME: ${header}`,
    `STATUS: ${safeText(s.status || '')}`,
    `START ODO: ${Number(s.start_odo || 0)}`,
    `END ODO: ${Number(s.end_odo || 0)}`,
    `MILES: ${dist} mi`,
    `DURATION: ${fmtHHMM(hrs)}`,
    `PAUSE TOTAL: ${fmtMinutes(pauseMinutes)}`,
    `EARNINGS: ${formatCurrency(gross)}`,
    `EXPENSES: -${formatCurrency(expSum)}`,
    `NET: ${formatCurrency(net)}`
  ];

  const target = document.getElementById('shift-details-content');
  if (target) {
    target.innerHTML = `
      <div class="shift-modal-paper">
        <div class="shift-modal-head">
          <div class="ascii-head font-bold">${safeText(header)}</div>
        </div>
        <div style="padding: 1rem;">
          <pre class="ascii-pre">${safeText(lines.join('\n'))}</pre>
          <button class="btn-primary-os" style="margin-top:1rem;" onclick="closeModals()">CLOSE</button>
        </div>
      </div>
    `;
  }

  openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE (kept)
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
      await db.from('finance_shift_pauses').delete().in('shift_id', sIds);
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
