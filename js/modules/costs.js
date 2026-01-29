// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/COSTS.JS v2.2.0
// Logic: Financial Projections & Rental Tracking
// Fixes:
// - timezone key: uses timezone_primary (not "timezone")
// - shift earnings: live from DB transactions while shift is active
//   net = max(sum(income), shift.gross_earnings) - sum(expenses)
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

// ────────────────────────────────────────────────────────────────
// SMART VEHICLE SELECTOR
// ────────────────────────────────────────────────────────────────

function getTargetVehicle() {
  if (state.activeShift?.vehicle_id) {
    return (state.fleet || []).find(v => v.id === state.activeShift.vehicle_id) || null;
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
    const monthlyFixed = Number(state.userSettings?.monthly_fixed_expenses || 0);
    const dailyFixed = monthlyFixed / 30;

    let dailyVehicle = 0;
    let dailyCarwash = 0;

    const vehicle = getTargetVehicle();

    if (vehicle) {
      const weeklyCost = Number(vehicle.operating_cost_weekly || 0);
      dailyVehicle = weeklyCost / 7;

      const monthlyWash = Number(vehicle.carwash_monthly_cost || 0);
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
    // FIX: settings key is timezone_primary in your system
    const timezone = state.userSettings?.timezone_primary || 'America/Chicago';

    const rentalWeekStartDay = state.userSettings?.rental_week_start_day ?? 2;

    const vehicle = getTargetVehicle();
    const targetAmount = (vehicle?.type === 'rental') ? Number(vehicle.operating_cost_weekly || 0) : 0;

    if (targetAmount === 0) return { earned: 0, target: 0, percentage: 100 };

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

    const earned = (shifts || []).reduce((acc, s) => acc + (Number(s.gross_earnings || 0)), 0);
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
// SHIFT EARNINGS (LIVE)  ✅
// net = max(sum(income), shift.gross_earnings) - sum(expenses)
// While shift is active, gross_earnings is often 0 → we must use tx.
// ────────────────────────────────────────────────────────────────

export async function calculateShiftEarnings() {
  try {
    const s = state.activeShift;
    if (!s?.id || !state.user?.id) return 0;

    const { data: rows, error } = await db
      .from('expenses')
      .select('type, amount')
      .eq('user_id', state.user.id)
      .eq('shift_id', s.id);

    if (error) throw error;

    const income = (rows || []).filter(r => r.type === 'income');
    const expense = (rows || []).filter(r => r.type === 'expense');

    const incSum = income.reduce((a, r) => a + (Number(r.amount || 0)), 0);
    const expSum = expense.reduce((a, r) => a + (Number(r.amount || 0)), 0);

    const gross = Math.max(incSum, Number(s.gross_earnings || 0));
    const net = gross - expSum;

    return Math.round(net);
  } catch (error) {
    console.error('Shift Earnings Error:', error);
    return Math.round(Number(state.activeShift?.gross_earnings || 0));
  }
}

// ────────────────────────────────────────────────────────────────
// RUNWAY (FUTURE FEATURE)
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
  return 0.0;
}
