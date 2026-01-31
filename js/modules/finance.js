// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.3.0
//
// FIX v2.3.0:
// - Model A: shift.gross_earnings = BASE (no tips)
// - Shift Details gross/net now include income tx (tips) correctly:
//   gross_total = base + sum(income)
//   net = gross_total - sum(expenses)
// - keeps existing fuel vehicle picker + fuel analytics
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let txShiftId = null;
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

function safeUUID(v) {
  const s = String(v ?? '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : '';
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

function asInt(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function hasShiftContextNow() {
  return !!(txShiftId || state.activeShift?.id);
}

function getShiftById(id) {
  if (!id) return null;

  if (state.activeShift && String(state.activeShift.id) === String(id)) {
    return state.activeShift;
  }

  const shifts = window._auditData?.shifts || [];
  return shifts.find(x => String(x.id) === String(id)) || null;
}

function getTxVehiclePickerValue() {
  const sel = document.getElementById('tx-veh');
  const v = sel?.value || '';
  return v ? v : null;
}

function toTitleCaseWords(s) {
  return String(s || '')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatCategoryLabel(catRaw) {
  const raw = String(catRaw || '').trim();
  if (!raw) return '';
  const spaced = raw
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return toTitleCaseWords(spaced);
}

function weatherIconHTML(weatherRaw) {
  const w = String(weatherRaw || '').trim().toLowerCase();
  if (!w) return '';

  const map = {
    snow: 'fa-snowflake',
    rain: 'fa-cloud-rain',
    drizzle: 'fa-cloud-showers-heavy',
    fog: 'fa-smog',
    mist: 'fa-smog',
    haze: 'fa-smog',
    clear: 'fa-sun',
    sunny: 'fa-sun',
    clouds: 'fa-cloud',
    cloudy: 'fa-cloud',
    overcast: 'fa-cloud',
    wind: 'fa-wind',
    storm: 'fa-bolt',
    thunderstorm: 'fa-bolt',
    ice: 'fa-icicles'
  };

  const icon = map[w] || 'fa-cloud';
  const title = formatCategoryLabel(w);

  return `
    <span title="${safeText(title)}" style="display:inline-flex; align-items:center; gap:.4rem;">
      <i class="fa-solid ${safeText(icon)}" style="opacity:.9;"></i>
    </span>
  `;
}

function resolveVehicleIdForTx() {
  if (txShiftId) {
    const s = getShiftById(txShiftId);
    if (s?.vehicle_id) return s.vehicle_id;
  }

  if (state.activeShift?.vehicle_id) return state.activeShift.vehicle_id;

  const picked = getTxVehiclePickerValue();
  if (picked) return picked;

  return null;
}

async function getLastFuelOdo(userId, vehicleId) {
  if (!userId || !vehicleId) return null;

  const { data, error } = await db
    .from('expenses')
    .select('odometer')
    .eq('user_id', userId)
    .eq('vehicle_id', vehicleId)
    .eq('category', 'fuel')
    .not('odometer', 'is', null)
    .order('odometer', { ascending: false })
    .limit(1);

  if (error) return null;
  const last = data?.[0]?.odometer;
  const n = asInt(last);
  return n > 0 ? n : null;
}

// ────────────────────────────────────────────────────────────────
// Fuel analytics (FULL→FULL and Since last FULL)
// ────────────────────────────────────────────────────────────────

function getFuelTxForVehicle(vehicleId) {
  if (!vehicleId) return [];
  const exp = window._auditData?.expenses || [];
  return exp
    .filter(e =>
      String(e.category || '') === 'fuel' &&
      String(e.vehicle_id || '') === String(vehicleId) &&
      asInt(e.odometer) > 0
    )
    .slice()
    .sort((a, b) => {
      const ao = asInt(a.odometer);
      const bo = asInt(b.odometer);
      if (ao !== bo) return ao - bo;
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
}

function calcFullToFullSegment(vehicleId, anchorOdo) {
  const tx = getFuelTxForVehicle(vehicleId);
  const anchor = asInt(anchorOdo);
  if (!tx.length || anchor <= 0) return null;

  const fulls = tx
    .filter(x => !!x.is_full)
    .map(x => ({ ...x, _odo: asInt(x.odometer) }))
    .filter(x => x._odo > 0);

  if (fulls.length < 2) return null;

  const endFull = fulls.filter(x => x._odo <= anchor).at(-1);
  if (!endFull) return null;

  const startFull = fulls.filter(x => x._odo < endFull._odo).at(-1);
  if (!startFull) return null;

  const startOdo = startFull._odo;
  const endOdo = endFull._odo;
  const miles = Math.max(0, endOdo - startOdo);
  if (miles <= 0) return null;

  const windowTx = tx.filter(x => {
    const o = asInt(x.odometer);
    return o > startOdo && o <= endOdo;
  });

  const gallons = sum(windowTx, x => x.gallons);
  const cost = sum(windowTx, x => x.amount);
  if (gallons <= 0) return null;

  return {
    kind: 'full_to_full',
    label: 'Fuel Metrics (FULL→FULL)',
    startOdo,
    endOdo,
    miles,
    gallons,
    cost,
    mpg: miles / gallons,
    costPerMile: cost / miles,
    costPerGal: cost / gallons
  };
}

function calcSinceLastFullSegment(vehicleId, anchorOdo) {
  const tx = getFuelTxForVehicle(vehicleId);
  const anchor = asInt(anchorOdo);
  if (!tx.length || anchor <= 0) return null;

  const fulls = tx
    .filter(x => !!x.is_full)
    .map(x => ({ ...x, _odo: asInt(x.odometer) }))
    .filter(x => x._odo > 0 && x._odo <= anchor);

  if (!fulls.length) return null;

  const lastFull = fulls.at(-1);
  const startOdo = asInt(lastFull._odo);
  const endOdo = anchor;

  const miles = Math.max(0, endOdo - startOdo);
  if (miles <= 0) return null;

  const windowTx = tx.filter(x => {
    const o = asInt(x.odometer);
    return o > startOdo && o <= endOdo;
  });

  const gallons = sum(windowTx, x => x.gallons);
  const cost = sum(windowTx, x => x.amount);
  if (gallons <= 0) return null;

  return {
    kind: 'since_last_full',
    label: 'Fuel Metrics (Since last FULL)',
    startOdo,
    endOdo,
    miles,
    gallons,
    cost,
    mpg: miles / gallons,
    costPerMile: cost / miles,
    costPerGal: cost / gallons
  };
}

function renderFuelMetricsBlock(seg) {
  if (!seg) return '';

  const line = (fa, label, value, hint = '') => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid rgba(255,255,255,.08);">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <i class="fa-solid ${fa}" style="width:18px; text-align:center; opacity:.85;"></i>
        <div style="min-width:0;">
          <div style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.70;">${safeText(label)}</div>
          ${hint ? `<div style="font-size:11px; opacity:.45; margin-top:2px;">${safeText(hint)}</div>` : ''}
        </div>
      </div>
      <div style="font-size:14px; font-weight:900; opacity:.95; text-align:right; white-space:nowrap;">${safeText(value)}</div>
    </div>
  `;

  const mpg = Number(seg.mpg || 0);
  const cpm = Number(seg.costPerMile || 0);
  const cpg = Number(seg.costPerGal || 0);

  return `
    <div style="margin-top:14px; border:1px solid rgba(20,184,166,.20); border-radius:14px; overflow:hidden;">
      <div style="padding:10px 12px; background: rgba(20,184,166,.06); font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:900; opacity:.9; color:#14b8a6;">
        <i class="fa-solid fa-gas-pump" style="opacity:.9; margin-right:.5rem;"></i> ${safeText(seg.label)}
      </div>
      <div style="padding:0 12px;">
        ${line('fa-gauge', 'mpg', `${mpg.toFixed(1)} mpg`, `${seg.startOdo} → ${seg.endOdo}`)}
        ${line('fa-dollar-sign', 'cost per mile', `${formatCurrency(cpm)} / mi`)}
        ${line('fa-droplet', 'cost per gallon', `${formatCurrency(cpg)} / gal`)}
        ${line('fa-road', 'segment miles', `${Math.round(seg.miles)} mi`)}
        ${line('fa-jug-detergent', 'fuel total', `${Number(seg.gallons).toFixed(2)} gal`)}
        ${line('fa-receipt', 'fuel cost', `${formatCurrency(seg.cost)}`)}
      </div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// Dynamic Vehicle Picker for Fuel
// ────────────────────────────────────────────────────────────────

let fuelPickerPromise = null;

async function ensureFuelVehiclePicker() {
  const fuelBox = document.getElementById('fuel-fields');
  if (!fuelBox) return;

  if (document.getElementById('tx-veh')) return;
  if (fuelPickerPromise) return fuelPickerPromise;

  fuelPickerPromise = (async () => {
    if (document.getElementById('tx-veh')) return;

    const wrap = document.createElement('div');
    wrap.className = 'col-span-2 mt-2';
    wrap.innerHTML = `
      <label class="label-xs ml-1">Vehicle</label>
      <select id="tx-veh" class="input-field text-sm h-12"></select>
      <div id="tx-veh-hint" class="text-[11px] opacity-60 mt-1" style="display:none;">
        Fuel be shift reikalauja Vehicle + Odometer.
      </div>
    `;

    const full = document.getElementById('tx-full');
    const fullBlock = full?.closest('.col-span-2') || full?.closest('div') || null;

    if (fullBlock && fullBlock.parentElement === fuelBox) {
      fuelBox.insertBefore(wrap, fullBlock);
    } else {
      fuelBox.appendChild(wrap);
    }

    const sel = document.getElementById('tx-veh');
    if (!sel) return;

    sel.innerHTML = `<option value="">Loading vehicles...</option>`;

    try {
      const { data, error } = await db
        .from('vehicles')
        .select('id, name, year, type')
        .eq('user_id', state.user?.id || '')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const vehicles = data || [];
      if (!vehicles.length) {
        sel.innerHTML = `<option value="">No vehicles</option>`;
        return;
      }

      const last = localStorage.getItem('tx_last_vehicle_id') || '';

      sel.innerHTML =
        `<option value="">Select vehicle...</option>` +
        vehicles
          .map(v => {
            const label = `${v.name || 'Vehicle'}${v.year ? ` (${v.year})` : ''}`;
            const selected = String(v.id) === String(last) ? 'selected' : '';
            return `<option value="${safeText(v.id)}" ${selected}>${safeText(label)}</option>`;
          })
          .join('');

      sel.addEventListener('change', () => {
        const val = sel.value || '';
        if (val) localStorage.setItem('tx_last_vehicle_id', val);
      });
    } catch (e) {
      sel.innerHTML = `<option value="">Vehicle load error</option>`;
    }
  })();

  try {
    await fuelPickerPromise;
  } finally {
    fuelPickerPromise = null;
  }
}

function setFuelVehicleHintVisible(visible) {
  const hint = document.getElementById('tx-veh-hint');
  if (hint) hint.style.display = visible ? 'block' : 'none';
}

// ────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ────────────────────────────────────────────────────────────────

export async function openTxModal(dir, shiftId = null) {
  vibrate();

  txDraft.direction = dir;
  txDraft.category = dir === 'in' ? 'tips' : 'fuel';
  txShiftId = shiftId || null;

  const hasShiftContext = !!(shiftId || state.activeShift?.id);

  if (!hasShiftContext) {
    if (dir === 'in') {
      showToast('Nėra aktyvios pamainos. IN pridėk per Shift Details.', 'warning');
      return;
    }
    if (dir === 'out') {
      txDraft.category = 'fuel';
    }
  }

  updateTxModalUI(dir);

  const inp = document.getElementById('tx-amount');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 100);
  }

  const gal = document.getElementById('tx-gal');
  const odo = document.getElementById('tx-odo');
  const full = document.getElementById('tx-full');
  if (gal) gal.value = '';
  if (odo) odo.value = '';
  if (full) full.checked = false;

  if (dir === 'out') {
    await ensureFuelVehiclePicker();
    const noShiftContext = !txShiftId && !state.activeShift?.id;
    setFuelVehicleHintVisible(noShiftContext);
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
    const shift_id = txShiftId || state.activeShift?.id || null;

    if (!shift_id && txDraft.category !== 'fuel') {
      return showToast('Nėra aktyvios pamainos. IN/OUT pridėk per Shift Details.', 'warning');
    }

    const vehicle_id = resolveVehicleIdForTx();
    if (txDraft.category === 'fuel' && !vehicle_id) {
      return showToast('Fuel įrašui reikia Vehicle (pasirink Vehicle).', 'warning');
    }

    const meta = {};

    if (txDraft.category === 'fuel') {
      meta.gallons = asNum(document.getElementById('tx-gal')?.value);
      meta.odometer = asInt(document.getElementById('tx-odo')?.value);
      meta.is_full = !!document.getElementById('tx-full')?.checked;

      if (meta.gallons <= 0) return showToast('Įveskite gallons', 'warning');
      if (meta.odometer <= 0) return showToast('Įveskite odometer', 'warning');

      if (shift_id) {
        const s = getShiftById(shift_id) || state.activeShift || null;
        const startOdo = asInt(s?.start_odo);
        if (startOdo > 0 && meta.odometer < startOdo) {
          return showToast(`Fuel odo negali būti mažesnis už start_odo (${startOdo})`, 'warning');
        }
      } else {
        const last = await getLastFuelOdo(state.user?.id, vehicle_id);
        if (last && meta.odometer < last) {
          return showToast(`Fuel odo negali būti mažesnis už paskutinį (${last})`, 'warning');
        }
      }
    }

    const payload = {
      user_id: state.user.id,
      shift_id,
      vehicle_id,
      type: txDraft.direction === 'in' ? 'income' : 'expense',
      category: txDraft.category,
      amount,
      ...meta,
      created_at: new Date().toISOString()
    };

    const { error: insErr } = await db.from('expenses').insert(payload);
    if (insErr) throw insErr;

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

  if (cat === 'fuel') {
    ensureFuelVehiclePicker();
    const noShiftContext = !txShiftId && !state.activeShift?.id;
    setFuelVehicleHintVisible(noShiftContext);
  } else {
    setFuelVehicleHintVisible(false);
  }
}

function updateTxModalUI(dir) {
  const t = document.getElementById('tx-title');
  if (t) t.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';

  document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
  document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');

  const fuelFields = document.getElementById('fuel-fields');
  if (fuelFields) {
    if (dir === 'out' && txDraft.category === 'fuel') fuelFields.classList.remove('hidden');
    else fuelFields.classList.add('hidden');
  }

  if (dir === 'out') {
    const hasShiftContext = hasShiftContextNow();
    const expWrap = document.getElementById('expense-types');
    const btns = expWrap ? Array.from(expWrap.querySelectorAll('.exp-btn')) : [];

    btns.forEach(b => {
      const onclick = b.getAttribute('onclick') || '';
      const isFuelBtn = onclick.includes("setExpType('fuel'");

      if (!hasShiftContext && !isFuelBtn) b.classList.add('hidden');
      else b.classList.remove('hidden');
    });

    if (!hasShiftContext) {
      btns.forEach(x => x.classList.remove('active'));
      const fuelBtn = btns.find(b => (b.getAttribute('onclick') || '').includes("setExpType('fuel'"));
      if (fuelBtn) fuelBtn.classList.add('active');
      document.getElementById('fuel-fields')?.classList.remove('hidden');
    }
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

    window._auditData = { shifts, expenses, pauses };

    listEl.innerHTML = shifts
      .map(s => {
        const sid = safeUUID(s.id);
        const start = new Date(s.start_time);
        const end = s.end_time ? new Date(s.end_time) : null;

        const dateStr = toLTDateISO(start);
        const startT = toLTTime(start);
        const endT = end ? toLTTime(end) : '…';

        const durMs = msBetween(s.start_time, s.end_time || null);
        const dur = fmtHhMmFromMs(durMs);

        const miles = shiftMiles(s);

        return `
          <div class="shift-strip flex items-center justify-between gap-3" onclick="${sid ? `openShiftDetails('${sid}')` : ''}">
            <div class="flex items-center gap-3 min-w-0">
              <input
                type="checkbox"
                class="log-checkbox"
                onclick="event.stopPropagation(); updateDeleteButtonLocal()"
                value="shift:${safeText(String(s.id))}"
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

  // ✅ Model A: shift.gross_earnings is BASE (no tips)
  const base = Number(s.gross_earnings || 0);
  const gross = base + incSum;
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
  const weatherRaw = String(s.weather || '').trim();

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

  const rowHtml = (faIcon, label, valueHtml) => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid rgba(255,255,255,.08);">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <i class="fa-solid ${faIcon}" style="width:18px; text-align:center; opacity:.85;"></i>
        <div style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.70;">${safeText(label)}</div>
      </div>
      <div style="font-size:16px; font-weight:900; opacity:.95; text-align:right; white-space:nowrap;">
        ${valueHtml || ''}
      </div>
    </div>
  `;

  const txLine = (e) => {
    const isIn = e.type === 'income';
    const ic = isIn ? 'fa-circle-plus' : 'fa-circle-minus';
    const col = isIn ? '#22c55e' : '#ef4444';
    const sign = isIn ? '+' : '−';

    const catLabel = formatCategoryLabel(e.category || '');
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
            <div style="font-size:13px; font-weight:800; opacity:.92; line-height:1.2;">${safeText(catLabel)}${extraFuel}</div>
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

  const anchorOdo = asInt(endOdo);
  let seg = null;
  if (s.vehicle_id && anchorOdo > 0) {
    seg = calcFullToFullSegment(s.vehicle_id, anchorOdo) || calcSinceLastFullSegment(s.vehicle_id, anchorOdo);
  }
  const segBlock = seg ? renderFuelMetricsBlock(seg) : '';

  const sid = safeUUID(s.id);
  const headerRightSafePx = 84;

  const target = document.getElementById('shift-details-content');
  if (target) {
    target.innerHTML = `
      <div class="shift-modal-paper">
        <div class="shift-modal-head" style="padding-right:${headerRightSafePx}px;">
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

            <div style="text-align:right; padding-right:4px;">
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
            ${weatherRaw ? rowHtml('fa-cloud-sun', 'weather', weatherIconHTML(weatherRaw)) : ''}
            ${row('fa-gauge-high', 'odometer', `${startOdo} → ${endOdo || '…'}`)}
            ${row('fa-route', 'miles', `${miles} mi`)}
            ${row('fa-stopwatch', 'duration', driveStr)}
            ${row('fa-mug-hot', 'pause total', pauseStr)}
            ${row('fa-person-walking', 'work time', workStr)}
            ${row('fa-sack-dollar', 'earnings', formatCurrency(gross))}
            ${row('fa-receipt', 'expenses', formatCurrency(expSum))}
          </div>

          ${segBlock}

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
            <button class="btn-bento" onclick="${sid ? `openTxModal('in', '${sid}')` : ''}">
              <i class="fa-solid fa-circle-plus"></i> IN
            </button>
            <button class="btn-bento" onclick="${sid ? `openTxModal('out', '${sid}')` : ''}">
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
// DELETE
// ────────────────────────────────────────────────────────────────

export function toggleSelectAll() {
  const masterBox = document.getElementById('select-all-logs');
  const boxes = document.querySelectorAll('.log-checkbox');
  const isChecked = masterBox?.checked || false;

  boxes.forEach(box => {
    box.checked = isChecked;
  });

  updateDeleteButtonLocal();
}

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
