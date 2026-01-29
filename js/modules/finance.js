// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.2.3
// Goals:
// - History: minimalist one-bar strip per shift:
//   date + start-end + duration + miles (ONLY)
// - Tap strip => full details modal (icons + FA) + status badge
// - Full details include: pause total + tx list + pause list + sums
// - Keep delete checkbox behavior
// - Keep tx modal behavior
//
// v2.2.1:
// - TX from Shift Details binds to THAT shift (txShiftId)
//
// v2.2.2:
// - Fuel TX supports "FULL TANK" (tx-full -> is_full)
// - Fuel TX binds vehicle_id (from shift if possible; else active shift)
// - Fuel lines in Shift Details show FULL marker
//
// ADD v2.2.3:
// - UI guard: blocks fuel odometer < shift.start_odo
// - UI guard: blocks fuel odometer < previous max fuel odometer (per user+vehicle)
// - Expose inline-handler functions to window (safer for onclick)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let txShiftId = null; // which shift the tx belongs to (details modal can override)
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

function toLTDateISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toLTTime(d) {
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function msBetween(aISO, bISO) {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO || new Date().toISOString()).getTime();
  return Math.max(0, b - a);
}

function fmtHhMmFromMs(ms) {
  const mins = Math.floor(ms / (1000 * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function shiftMiles(s) {
  const a = Number(s.start_odo || 0);
  const b = Number(s.end_odo || 0);
  const dist = b - a;
  return Number.isFinite(dist) ? Math.max(0, dist) : 0;
}

function sum(arr, fn) {
  return (arr || []).reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);
}

function calcPauseMs(pauses) {
  return (pauses || []).reduce((acc, p) => {
    const a = p.start_time ? new Date(p.start_time).getTime() : 0;
    const b = p.end_time ? new Date(p.end_time).getTime() : Date.now();
    const ms = Math.max(0, (b || 0) - (a || 0));
    return acc + ms;
  }, 0);
}

function statusBadge(statusRaw) {
  const s = String(statusRaw || '').toLowerCase();
  if (s === 'active') return `<span class="status-badge status-active">ACTIVE</span>`;
  if (s === 'paused') return `<span class="status-badge status-paused">PAUSED</span>`;
  return `
    <span class="status-badge" style="
      color:#9ca3af;
      background: rgba(156,163,175,.10);
      border-color: rgba(156,163,175,.28);
    ">COMPLETED</span>
  `;
}

function moneyColor(v) {
  return v >= 0 ? '#22c55e' : '#ef4444';
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Get vehicle_id for a tx
function resolveVehicleIdForTx() {
  // If tx is being created for a specific shift (details modal), try that shift's vehicle_id
  if (txShiftId && window._auditData?.shifts?.length) {
    const s = window._auditData.shifts.find(x => String(x.id) === String(txShiftId));
    if (s?.vehicle_id) return s.vehicle_id;
  }
  // Otherwise fallback to active shift vehicle_id
  if (state.activeShift?.vehicle_id) return state.activeShift.vehicle_id;

  // Last resort: none
  return null;
}

// UI guard helpers
function getShiftStartOdo(shift_id) {
  if (!shift_id) return 0;

  // Try from cached audit shifts
  if (window._auditData?.shifts?.length) {
    const s = window._auditData.shifts.find(x => String(x.id) === String(shift_id));
    return Number(s?.start_odo || 0);
  }

  // Fallback active shift
  if (state.activeShift?.id && String(state.activeShift.id) === String(shift_id)) {
    return Number(state.activeShift.start_odo || 0);
  }

  return 0;
}

function getPrevMaxFuelOdo(vehicle_id) {
  if (!vehicle_id) return 0;
  const ex = window._auditData?.expenses || [];
  let maxOdo = 0;

  for (const e of ex) {
    if (String(e.category || '') !== 'fuel') continue;
    if (String(e.vehicle_id || '') !== String(vehicle_id)) continue;
    const o = Number(e.odometer || 0);
    if (Number.isFinite(o) && o > maxOdo) maxOdo = o;
  }

  return maxOdo;
}

// ────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ────────────────────────────────────────────────────────────────

export function openTxModal(dir, shiftId = null) {
  vibrate();

  txDraft.direction = dir;
  txDraft.category = dir === 'in' ? 'tips' : 'fuel';
  txShiftId = shiftId || null;

  updateTxModalUI(dir);

  // reset fuel fields each open (prevents stale values)
  const gal = document.getElementById('tx-gal');
  const odo = document.getElementById('tx-odo');
  const full = document.getElementById('tx-full');
  if (gal) gal.value = '';
  if (odo) odo.value = '';
  if (full) full.checked = false;

  const inp = document.getElementById('tx-amount');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 100);
  }

  // keep modal stacking safe
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

    // Decide which shift to bind:
    const shift_id = txShiftId || state.activeShift?.id || null;

    // Vehicle bind (needed for MPG/$mile per car)
    const vehicle_id = resolveVehicleIdForTx();

    if (txDraft.category === 'fuel') {
      meta.gallons = asNum(document.getElementById('tx-gal')?.value);
      meta.odometer = parseInt(document.getElementById('tx-odo')?.value || 0, 10) || 0;

      // FULL TANK flag
      meta.is_full = !!document.getElementById('tx-full')?.checked;

      // light validation for fuel
      if (meta.gallons <= 0) return showToast('Įveskite gallons', 'warning');
      if (meta.odometer <= 0) return showToast('Įveskite odometer', 'warning');

      // ── UI HARD GUARDS (prevents bad inserts + avoids DB error surprises)
      const shiftStart = getShiftStartOdo(shift_id);
      const prevFuelMax = getPrevMaxFuelOdo(vehicle_id);
      const minAllowed = Math.max(shiftStart || 0, prevFuelMax || 0);

      if (minAllowed > 0 && meta.odometer < minAllowed) {
        return showToast(`ODO per mažas. Min: ${minAllowed}`, 'error');
      }
    }

    const payload = {
      user_id: state.user.id,
      shift_id,
      vehicle_id, // NEW (for fuel analytics per car)
      type: txDraft.direction === 'in' ? 'income' : 'expense',
      category: txDraft.category,
      amount,
      ...meta,
      created_at: new Date().toISOString()
    };

    await db.from('expenses').insert(payload);

    // reset context to avoid accidental binding
    txShiftId = null;

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

  // show fuel-fields by default for OUT (fuel default)
  const fuelFields = document.getElementById('fuel-fields');
  if (fuelFields) {
    if (dir === 'out' && txDraft.category === 'fuel') fuelFields.classList.remove('hidden');
    else fuelFields.classList.add('hidden');
  }
}

// ────────────────────────────────────────────────────────────────
// HISTORY (minimal strips)
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
        .select('shift_id, start_time, end_time')
        .eq('user_id', state.user.id)
    ]);

    const shifts = shiftsRes.data || [];
    const expenses = expensesRes.data || [];
    const pauses = pausesRes.data || [];

    if (!shifts.length) {
      listEl.innerHTML = '<div class="text-center py-10 opacity-30">Nėra duomenų</div>';
      return;
    }

    // cache for details modal + guards
    window._auditData = { shifts, expenses, pauses };

    listEl.innerHTML = shifts
      .map(s => {
        const start = new Date(s.start_time);
        const end = s.end_time ? new Date(s.end_time) : null;

        const dateStr = toLTDateISO(start);
        const startT = toLTTime(start);
        const endT = end ? toLTTime(end) : '…';

        const durMs = msBetween(s.start_time, s.end_time || null);
        const dur = fmtHhMmFromMs(durMs);

        const miles = shiftMiles(s);

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
                  ${safeText(dateStr)}
                </div>

                <div class="text-sm font-bold tracking-tight">
                  ${safeText(startT)} – ${safeText(endT)}
                  <span class="opacity-60 font-normal">(${safeText(dur)})</span>
                </div>

                <div class="text-[10px] uppercase tracking-widest opacity-50">
                  ${safeText(String(miles))} mi
                </div>
              </div>
            </div>

            <div class="opacity-40">
              <i class="fa-solid fa-chevron-right"></i>
            </div>
          </div>
        `;
      })
      .join('');

    updateDeleteButtonLocal();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = 'Klaida';
  }
}

// ────────────────────────────────────────────────────────────────
// SHIFT DETAILS MODAL
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

  const start = new Date(s.start_time);
  const end = s.end_time ? new Date(s.end_time) : null;

  const dateStr = toLTDateISO(start);
  const t1 = toLTTime(start);
  const t2 = end ? toLTTime(end) : '…';

  const driveMs = msBetween(s.start_time, s.end_time || null);
  const driveStr = fmtHhMmFromMs(driveMs);

  const miles = shiftMiles(s);

  const sPauses = pauses.filter(p => String(p.shift_id) === String(id));
  const pauseMs = calcPauseMs(sPauses);
  const pauseStr = fmtHhMmFromMs(pauseMs);

  const workMs = Math.max(0, driveMs - pauseMs);
  const workStr = fmtHhMmFromMs(workMs);

  const vehicleName = safeText(s.vehicles?.name || 'Unknown');
  const weather = safeText(s.weather || '');

  const startOdo = Number(s.start_odo || 0);
  const endOdo = Number(s.end_odo || 0);

  const row = (faIcon, label, value) => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid rgba(255,255,255,.08);">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <i class="fa-solid ${faIcon}" style="width:18px; text-align:center; opacity:.85;"></i>
        <div style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.70;">${safeText(label)}</div>
      </div>
      <div style="font-size:14px; font-weight:800; opacity:.95; text-align:right; white-space:nowrap;">${safeText(value)}</div>
    </div>
  `;

  const txLine = (e) => {
    const isIn = e.type === 'income';
    const ic = isIn ? 'fa-circle-plus' : 'fa-circle-minus';
    const col = isIn ? '#22c55e' : '#ef4444';
    const sign = isIn ? '+' : '−';

    const cat = safeText(String(e.category || ''));
    const amt = formatCurrency(Number(e.amount || 0));

    const isFuel = String(e.category || '') === 'fuel';
    const isFull = !!e.is_full;

    const extraFuel =
      isFuel
        ? ` <span style="opacity:.6; font-weight:800;">
            ${e.gallons ? `• ${Number(e.gallons)}g` : ''}
            ${e.odometer ? ` ${e.gallons ? '' : '•'} odo ${Number(e.odometer)}` : ''}
            ${isFull ? ` <span style="margin-left:.35rem; padding:.12rem .4rem; border-radius:999px; border:1px solid rgba(20,184,166,.35); background: rgba(20,184,166,.10); color:#14b8a6; font-size:10px; letter-spacing:.12em;">FULL</span>` : ''}
          </span>`
        : '';

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid rgba(255,255,255,.06);">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <i class="fa-solid ${ic}" style="width:18px; text-align:center; color:${col};"></i>
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:800; opacity:.92; line-height:1.2;">${cat}${extraFuel}</div>
            <div style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; opacity:.55;">${safeText(isIn ? 'income' : 'expense')}</div>
          </div>
        </div>
        <div style="font-size:14px; font-weight:900; color:${col}; white-space:nowrap;">
          ${sign}${safeText(amt)}
        </div>
      </div>
    `;
  };

  const pauseLine = (p) => {
    const a = p.start_time ? new Date(p.start_time) : null;
    const b = p.end_time ? new Date(p.end_time) : null;
    const aStr = a ? toLTTime(a) : '??';
    const bStr = b ? toLTTime(b) : '…';

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid rgba(255,255,255,.06);">
        <div style="display:flex; align-items:center; gap:10px;">
          <i class="fa-solid fa-pause" style="width:18px; text-align:center; opacity:.75;"></i>
          <div style="font-size:13px; font-weight:800; opacity:.9;">${safeText(aStr)} – ${safeText(bStr)}</div>
        </div>
      </div>
    `;
  };

  const txHtml = sExp.length
    ? sExp
        .slice()
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        .map(txLine)
        .join('')
    : `<div style="padding:10px 0; border-top:1px solid rgba(255,255,255,.06); opacity:.55; font-size:13px;">No transactions</div>`;

  const pausesHtml = sPauses.length
    ? sPauses
        .slice()
        .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0))
        .map(pauseLine)
        .join('')
    : `<div style="padding:10px 0; border-top:1px solid rgba(255,255,255,.06); opacity:.55; font-size:13px;">No pauses</div>`;

  const target = document.getElementById('shift-details-content');
  if (target) {
    target.innerHTML = `
      <div class="shift-modal-paper">
        <div class="shift-modal-head">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
            <div style="min-width:0;">
              <div class="ascii-head" style="font-weight:900; display:flex; align-items:center; gap:.6rem; flex-wrap:wrap;">
                <span>
                  <i class="fa-solid fa-calendar-day" style="opacity:.85; margin-right:.45rem;"></i>
                  ${safeText(dateStr)}
                </span>
                ${statusBadge(s.status)}
              </div>
              <div style="margin-top:.25rem; opacity:.75; font-weight:800;">
                <i class="fa-solid fa-clock" style="opacity:.8; margin-right:.45rem;"></i>
                ${safeText(t1)} – ${safeText(t2)}
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-size:10px; letter-spacing:.12em; text-transform:uppercase; opacity:.6;">NET</div>
              <div style="font-size:20px; font-weight:900; color:${moneyColor(net)};">
                ${safeText(formatCurrency(net))}
              </div>
            </div>
          </div>
        </div>

        <div style="padding: 1rem;">
          <div style="border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:12px; background: rgba(255,255,255,.02);">
            ${row('fa-car-side', 'vehicle', vehicleName)}
            ${weather ? row('fa-cloud-sun', 'weather', weather) : ''}
            ${row('fa-gauge-high', 'odometer', `${startOdo} → ${endOdo || '…'}`)}
            ${row('fa-route', 'miles', `${miles} mi`)}
            ${row('fa-stopwatch', 'duration', driveStr)}
            ${row('fa-mug-hot', 'pause total', pauseStr)}
            ${row('fa-person-walking', 'work time', workStr)}
            ${row('fa-sack-dollar', 'earnings', formatCurrency(gross))}
            ${row('fa-receipt', 'expenses', formatCurrency(expSum))}
          </div>

          <div style="margin-top:14px; border:1px solid rgba(255,255,255,.10); border-radius:14px; overflow:hidden;">
            <div style="padding:10px 12px; background: rgba(255,255,255,.03); font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:900; opacity:.8;">
              <i class="fa-solid fa-list" style="opacity:.85; margin-right:.5rem;"></i> Transactions
            </div>
            <div style="padding:0 12px;">
              ${txHtml}
            </div>
          </div>

          <div style="margin-top:14px; border:1px solid rgba(255,255,255,.10); border-radius:14px; overflow:hidden;">
            <div style="padding:10px 12px; background: rgba(255,255,255,.03); font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:900; opacity:.8;">
              <i class="fa-solid fa-pause" style="opacity:.85; margin-right:.5rem;"></i> Pauses
            </div>
            <div style="padding:0 12px;">
              ${pausesHtml}
            </div>
          </div>

          <div style="display:flex; gap:.6rem; margin-top:1rem;">
            <button class="btn-bento" onclick="openTxModal('in', '${s.id}')">
              <i class="fa-solid fa-circle-plus"></i> IN
            </button>
            <button class="btn-bento" onclick="openTxModal('out', '${s.id}')">
              <i class="fa-solid fa-circle-minus"></i> OUT
            </button>
          </div>

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

export function toggleSelectAll() {}

export function requestLogDelete() {
  const checked = document.querySelectorAll('.log-checkbox:checked');
  if (!checked.length) return;

  itemsToDelete = Array.from(checked).map(el => ({
    type: el.value.split(':')[0],
    id: el.value.split(':')[1]
  }));

  const c = document.getElementById('del-modal-count');
  if (c) c.textContent = String(itemsToDelete.length);

  openModal('delete-modal');
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
    await refreshAudit();
  } catch (e) {
    console.error(e);
    showToast('Delete error', 'error');
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

export function toggleAccordion() {}
export function exportAI() {}

// ────────────────────────────────────────────────────────────────
// Expose for inline onclick handlers (important for your HTML strings)
// ────────────────────────────────────────────────────────────────
try {
  window.openTxModal = openTxModal;
  window.confirmTx = confirmTx;
  window.setExpType = setExpType;
  window.openShiftDetails = openShiftDetails;

  window.requestLogDelete = requestLogDelete;
  window.confirmLogDelete = confirmLogDelete;
  window.updateDeleteButtonLocal = updateDeleteButtonLocal;
  window.toggleSelectAll = toggleSelectAll;
  window.exportAI = exportAI;
} catch (_) {}
