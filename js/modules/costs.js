// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/COSTS.JS v2.1.1
// Logic: Financial Projections & Rental Tracking
//
// FIXES v2.1.1:
// - calculateShiftEarnings() now returns LIVE net earnings for ACTIVE shift:
//   net = max(sum(income), shift.gross_earnings) - sum(expenses)
//   => reacts immediately to tips/fuel.
// - No NaN: always returns finite number.
// - timezone uses settings.timezone_primary (was settings.timezone)
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

    const { data: shifts, error } = await db
      .from('finance_shifts')
      .select('gross_earnings')
      .eq('user_id', state.user.id)
      .eq('status', 'completed')
      .gte('end_time', weekStart.toISOString())
      .lte('end_time', weekEnd.toISOString());

    if (error) throw error;

    const earned = (shifts || []).reduce((sum, s) => sum + toNumber(s.gross_earnings), 0);
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
// SHIFT EARNINGS (LIVE NET for ACTIVE shift)
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

    const shiftGross = toNumber(state.activeShift?.gross_earnings);
    const gross = Math.max(inc, shiftGross);

    const net = gross - exp;
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
