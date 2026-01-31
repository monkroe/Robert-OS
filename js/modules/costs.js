// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/COSTS.JS v2.1.2
// Logic: Financial Projections & Rental Tracking
//
// FIX v2.1.2:
// - Model A consistency:
//   shift.gross_earnings = BASE (no tips)
//   total_gross = base + sum(income)
//   net = total_gross - sum(expense)
// - calculateShiftEarnings() returns LIVE net for ACTIVE shift (base+tips-exp)
// - calculateWeeklyRentalProgress() includes tips income for completed shifts
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// TIMEZONE UTILS
// ────────────────────────────────────────────────────────────────

function getTimezoneDate(timezone = 'America/Chicago') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const val = {};
  parts.forEach(({ type, value }) => { val[type] = value; });

  return new Date(`${val.year}-${val.month}-${val.day}T${val.hour}:${val.minute}:${val.second}`);
}

function getDayOfWeek(timezone = 'America/Chicago') {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[formatter.format(new Date())];
}

function toNumber(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

// ────────────────────────────────────────────────────────────────
// SMART VEHICLE SELECTOR
// ────────────────────────────────────────────────────────────────

function getTargetVehicle() {
  if (state.activeShift?.vehicle_id) {
    return state.fleet.find(v => v.id === state.activeShift.vehicle_id);
  }
  if (state.fleet && state.fleet.length > 0) {
    return state.fleet.find(v => v.type === 'rental') || state.fleet[0];
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// DAILY COST TARGET
// ────────────────────────────────────────────────────────────────

export async function calculateDailyCost() {
  try {
    const monthlyFixed = toNumber(state.userSettings?.monthly_fixed_expenses);
    const dailyFixed = monthlyFixed / 30;

    let dailyVehicle = 0;
    let dailyCarwash = 0;

    const vehicle = getTargetVehicle();
    if (vehicle) {
      const weeklyCost = toNumber(vehicle.operating_cost_weekly);
      dailyVehicle = weeklyCost / 7;

      const monthlyWash = toNumber(vehicle.carwash_monthly_cost);
      dailyCarwash = monthlyWash / 30;
    }

    return Math.round(dailyFixed + dailyVehicle + dailyCarwash);
  } catch (error) {
    console.error('Costs Calc Error:', error);
    return 0;
  }
}

// ────────────────────────────────────────────────────────────────
// WEEKLY RENTAL PROGRESS
// ────────────────────────────────────────────────────────────────

export async function calculateWeeklyRentalProgress() {
  try {
    const timezone = state.userSettings?.timezone_primary || 'America/Chicago';
    const rentalWeekStartDay = state.userSettings?.rental_week_start_day ?? 2;

    const vehicle = getTargetVehicle();
    const targetAmount = (vehicle?.type === 'rental') ? toNumber(vehicle.operating_cost_weekly) : 0;

    if (!targetAmount) return { earned: 0, target: 0, percentage: 100 };

    const currentDayOfWeek = getDayOfWeek(timezone);
    let daysSinceStart = currentDayOfWeek - rentalWeekStartDay;
    if (daysSinceStart < 0) daysSinceStart += 7;

    const nowInTz = getTimezoneDate(timezone);
    const weekStart = new Date(nowInTz);
    weekStart.setDate(weekStart.getDate() - daysSinceStart);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Pull completed shifts (BASE) in the week
    const { data: shifts, error: sErr } = await db
      .from('finance_shifts')
      .select('id, gross_earnings')
      .eq('user_id', state.user.id)
      .eq('status', 'completed')
      .gte('end_time', weekStart.toISOString())
      .lt('end_time', weekEnd.toISOString());

    if (sErr) throw sErr;

    const rows = shifts || [];
    if (!rows.length) {
      return { earned: 0, target: Math.round(targetAmount), percentage: 0 };
    }

    const shiftIds = rows.map(s => s.id);
    const baseEarned = rows.reduce((sum, s) => sum + toNumber(s.gross_earnings), 0);

    // Add income transactions (tips/bonus) for those shifts
    const { data: incRows, error: iErr } = await db
      .from('expenses')
      .select('shift_id, amount')
      .eq('user_id', state.user.id)
      .eq('type', 'income')
      .in('shift_id', shiftIds);

    if (iErr) throw iErr;

    const tipsEarned = (incRows || []).reduce((sum, r) => sum + toNumber(r.amount), 0);

    const earned = baseEarned + tipsEarned;
    const percentage = Math.min((earned / targetAmount) * 100, 100);

    return {
      earned: Math.round(earned),
      target: Math.round(targetAmount),
      percentage: Math.round(percentage)
    };
  } catch (error) {
    console.error('Rental Progress Error:', error);
    return { earned: 0, target: 0, percentage: 0 };
  }
}

// ────────────────────────────────────────────────────────────────
// SHIFT EARNINGS (LIVE NET for ACTIVE shift) — Model A
// net = (base + income) - expense
// ────────────────────────────────────────────────────────────────

export async function calculateShiftEarnings() {
  try {
    const shiftId = state.activeShift?.id;
    if (!shiftId || !state.user?.id) return 0;

    const { data, error } = await db
      .from('expenses')
      .select('type, amount')
      .eq('user_id', state.user.id)
      .eq('shift_id', shiftId);

    if (error) throw error;

    const rows = data || [];
    const inc = rows.filter(r => r.type === 'income').reduce((s, r) => s + toNumber(r.amount), 0);
    const exp = rows.filter(r => r.type === 'expense').reduce((s, r) => s + toNumber(r.amount), 0);

    const base = toNumber(state.activeShift?.gross_earnings); // BASE (no tips)
    const grossTotal = base + inc;

    const net = grossTotal - exp;
    return Number.isFinite(net) ? Math.round(net) : 0;
  } catch (e) {
    console.error('Shift Earnings Error:', e);
    return 0;
  }
}

// ────────────────────────────────────────────────────────────────
// RUNWAY (FUTURE FEATURE)
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
  return 0.0;
}
