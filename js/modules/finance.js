// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.0.2
// FIXES (per your requirements NOW):
// ✅ Logs back to minimalist "shift strips" (single-row, no extra date row)
// ✅ Strip shows ONLY: DATE • START–END • HOURS • MILES  (+ optional status badge)
// ✅ Tap strip → full details modal (includes PAUSES breakdown)
// ✅ Keeps delete selection + TX behavior
// NOTE: Year/Month/Day accordion hierarchy = later (not in this file now)
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
  // Minimalist date on strip (adjust if you want exact legacy format)
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function toLTDateLong(d) {
  return d.toLocaleDateString('lt-LT', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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

function badgeForShift(s) {
  // Optional: nice badge (active/paused) without changing strip density
  if (!s || s.status === 'completed') return '';
  if (s.status === 'paused') return `<span class="status-badge status-paused">PAUSED</span>`;
  return `<span class="status-badge status-active">ACTIVE</span>`;
}

function minsBetweenISO(aISO, bISO) {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  const ms = Math.max(0, b - a);
  return Math.round(ms / (1000 * 60));
}

function fmtMins(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
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
// AUDIT / HISTORY — minimalist strips
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
      // pauses are optional (if table exists)
      db
        .from('finance_shift_pauses')
        .select('*')
        .eq('user_id', state.user.id)
    ]);

    const shifts = shiftsRes.data || [];
    const expenses = expensesRes.data || [];
    const pauses = pausesRes.data || []; // if table missing, tool usually returns error — we handle below

    if (!shifts.length) {
      listEl.innerHTML = '<div class="text-center py-10 opacity-30">Nėra duomenų</div>';
      return;
    }

    // Cache for details modal
    window._auditData = { shifts, expenses, pauses };

    // index expenses by shift id
    const expByShift = {};
    for (const e of expenses) {
      const k = String(e.shift_id || '');
      if (!k) continue;
      if (!expByShift[k]) expByShift[k] = [];
      expByShift[k].push(e);
    }

    // index pauses by shift id (best effort)
    const pauseByShift = {};
    for (const p of pauses) {
      const k = String(p.shift_id || '');
      if (!k) continue;
      if (!pauseByShift[k]) pauseByShift[k] = [];
      pauseByShift[k].push(p);
    }

    listEl.innerHTML = shifts.map(s => {
      const sExp = expByShift[String(s.id)] || [];
      const income = sExp.filter(x => x.type === 'income');
      const expense = sExp.filter(x => x.type === 'expense');

      const incSum = sum(income, x => x.amount);
      const expSum = sum(expense, x => x.amount);

      const gross = Math.max(incSum, Number(s.gross_earnings || 0));
      const net = gross - expSum;

      const start = new Date(s.start_time);
      const end = s.end_time ? new Date(s.end_time) : null;

      const dateShort = toLTDateShort(start);          // "01-27"
      const startT = toLTTime(start);                  // "20:11"
      const endT = end ? toLTTime(end) : '--:--';

      // duration: for completed shift use end_time; for active use now
      const hrs = hoursBetween(s.start_time, s.end_time);
      const dur = fmtHHMM(hrs);

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

            <div class="min-w-0 flex items-center gap-2 flex-wrap">
              <span class="text-[10px] font-black uppercase tracking-widest opacity-70">${dateShort}</span>
              <span class="text-[10px] uppercase tracking-widest opacity-35">•</span>

              <span class="text-sm font-bold tracking-tight opacity-90">${startT}–${endT}</span>
              <span class="text-[10px] uppercase tracking-widest opacity-35">•</span>

              <span class="text-[10px] font-black uppercase tracking-widest opacity-70">${safeText(dur)}</span>
              <span class="text-[10px] uppercase tracking-widest opacity-35">•</span>

              <span class="text-[10px] font-black uppercase tracking-widest opacity-70">${miles} mi</span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            ${badgeForShift(s)}
            <div class="font-bold ${netClass(net)} text-right">
              ${formatCurrency(net)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    updateDeleteButtonLocal();
  } catch (e) {
    console.error(e);
    // If pauses table not present, try again without pauses (so UI still works)
    const msg = String(e?.message || '');
    const pausesMissing =
      msg.toLowerCase().includes('finance_shift_pauses') ||
      msg.toLowerCase().includes('does not exist');

    if (pausesMissing) {
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
        window._auditData = { shifts, expenses, pauses: [] };

        const expByShift = {};
        for (const ex of expenses) {
          const k = String(ex.shift_id || '');
          if (!k) continue;
          if (!expByShift[k]) expByShift[k] = [];
          expByShift[k].push(ex);
        }

        listEl.innerHTML = shifts.map(s => {
          const sExp = expByShift[String(s.id)] || [];
          const income = sExp.filter(x => x.type === 'income');
          const expense = sExp.filter(x => x.type === 'expense');

          const incSum = sum(income, x => x.amount);
          const expSum = sum(expense, x => x.amount);

          const gross = Math.max(incSum, Number(s.gross_earnings || 0));
          const net = gross - expSum;

          const start = new Date(s.start_time);
          const end = s.end_time ? new Date(s.end_time) : null;

          const dateShort = toLTDateShort(start);
          const startT = toLTTime(start);
          const endT = end ? toLTTime(end) : '--:--';

          const hrs = hoursBetween(s.start_time, s.end_time);
          const dur = fmtHHMM(hrs);
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

                <div class="min-w-0 flex items-center gap-2 flex-wrap">
                  <span class="text-[10px] font-black uppercase tracking-widest opacity-70">${dateShort}</span>
                  <span class="text-[10px] uppercase tracking-widest opacity-35">•</span>
                  <span class="text-sm font-bold tracking-tight opacity-90">${startT}–${endT}</span>
                  <span class="text-[10px] uppercase tracking-widest opacity-35">•</span>
                  <span class="text-[10px] font-black uppercase tracking-widest opacity-70">${safeText(dur)}</span>
                  <span class="text-[10px] uppercase tracking-widest opacity-35">•</span>
                  <span class="text-[10px] font-black uppercase tracking-widest opacity-70">${miles} mi</span>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                ${badgeForShift(s)}
                <div class="font-bold ${netClass(net)} text-right">
                  ${formatCurrency(net)}
                </div>
              </div>
            </div>
          `;
        }).join('');

        updateDeleteButtonLocal();
        return;
      } catch (e2) {
        console.error(e2);
      }
    }

    listEl.innerHTML = 'Klaida';
  }
}

// ────────────────────────────────────────────────────────────────
// SHIFT DETAILS MODAL — full info (includes PAUSES)
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

  const miles = shiftMiles(s);
  const hrs = hoursBetween(s.start_time, s.end_time);

  const start = new Date(s.start_time);
  const end = s.end_time ? new Date(s.end_time) : null;

  const vehicleName = safeText(s.vehicles?.name || 'Unknown');
  const dateLine = safeText(toLTDateLong(start));
  const timeLine = `${toLTTime(start)}${end ? `–${toLTTime(end)}` : ''}`;

  // PAUSES
  const pList = pauses
    .filter(p => String(p.shift_id) === String(id))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  let pauseTotalMins = 0;
  const pauseLines = pList.length
    ? pList.map((p, idx) => {
        const a = p.start_time;
        const b = p.end_time || new Date().toISOString();
        const mins = minsBetweenISO(a, b);
        pauseTotalMins += mins;

        const aT = toLTTime(new Date(a));
        const bT = p.end_time ? toLTTime(new Date(b)) : '...';
        return `Pause ${idx + 1}: ${aT}–${bT} (${fmtMins(mins)})`;
      })
    : [];

  // Earnings lines (prefer actual income entries; fallback to gross)
  const incLines = income.length
    ? income.map(i => `+ ${safeText(i.category)}: ${formatCurrency(i.amount || 0)}`)
    : [`+ App: ${formatCurrency(gross)}`];

  const expLines = expense.length
    ? expense.map(e => {
        const extra = e.category === 'fuel' && e.gallons ? ` (${Number(e.gallons)}g)` : '';
        return `- ${safeText(e.category)}${safeText(extra)}: ${formatCurrency(e.amount || 0)}`;
      })
    : ['- None'];

  const header = `${toLTDateShort(start)} • ${toLTTime(start)}${end ? `–${toLTTime(end)}` : ''}`;

  const lines = [
    `DATE: ${dateLine}`,
    `TIME: ${timeLine}`,
    `STATUS: ${safeText(s.status || '—')}`,
    `VEHICLE: ${vehicleName}`,
    `ODOMETER: ${Number(s.start_odo || 0)} → ${Number(s.end_odo || 0)}`,
    `DURATION: ${fmtHHMM(hrs)}`,
    `MILES: ${miles} mi`,
    ``,
    `EARNINGS:`,
    ...incLines,
    `TOTAL: ${formatCurrency(gross)}`,
    ``,
    `EXPENSES:`,
    ...expLines,
    `TOTAL: -${formatCurrency(expSum)}`,
    ``,
    `NET: ${formatCurrency(net)}`,
  ];

  if (pList.length) {
    lines.push(``, `PAUSES (total ${fmtMins(pauseTotalMins)}):`, ...pauseLines);
  } else {
    lines.push(``, `PAUSES: none`);
  }

  const target = document.getElementById('shift-details-content');
  if (target) {
    target.innerHTML = `
      <div class="shift-modal-paper">
        <div class="shift-modal-head flex items-center justify-between gap-3">
          <div>
            <div class="ascii-head font-bold">${safeText(header)}</div>
            <div class="text-[10px] uppercase tracking-widest opacity-60">${vehicleName}</div>
          </div>
          <div class="shrink-0">
            ${badgeForShift(s)}
          </div>
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

// Expose for inline onclick in HTML
if (typeof window !== 'undefined') {
  window.openShiftDetails = openShiftDetails;
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
      // pauses table optional
      try { await db.from('finance_shift_pauses').delete().in('shift_id', sIds); } catch (_) {}
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
