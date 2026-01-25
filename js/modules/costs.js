// ════════════════════════════════════════════════════════════════
// ROBERT OS - COSTS MODULE v1.5.0
// Financial Calculations with Timezone Awareness
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// TIMEZONE-AWARE DATE UTILITIES
// ────────────────────────────────────────────────────────────────

function getTimezoneDate(timezone = 'America/Chicago') {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(new Date());
    const values = {};
    parts.forEach(({ type, value }) => {
        values[type] = value;
    });
    
    return new Date(
        `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
    );
}

function getDayOfWeek(timezone = 'America/Chicago') {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short'
    });
    
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayName = formatter.format(new Date());
    return dayMap[dayName];
}

// ────────────────────────────────────────────────────────────────
// WEEKLY RENTAL PROGRESS
// ────────────────────────────────────────────────────────────────

export async function calculateWeeklyRentalProgress() {
    try {
        const timezone = state.userSettings?.timezone_primary || 'America/Chicago';
        const rentalWeekStartDay = state.userSettings?.rental_week_start_day || 2; // Tuesday default
        const weeklyRentalCost = state.userSettings?.weekly_rental_cost || 350;
        
        // Get current day in user's timezone
        const currentDayOfWeek = getDayOfWeek(timezone);
        
        // Calculate days since week start
        let daysSinceStart = currentDayOfWeek - rentalWeekStartDay;
        if (daysSinceStart < 0) daysSinceStart += 7;
        
        // Get start of rental week in user's timezone
        const nowInTz = getTimezoneDate(timezone);
        const weekStart = new Date(nowInTz);
        weekStart.setDate(weekStart.getDate() - daysSinceStart);
        weekStart.setHours(0, 0, 0, 0);
        
        // Get end of rental week
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Query earnings for this rental week
        const { data: shifts, error } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .gte('end_time', weekStart.toISOString())
            .lte('end_time', weekEnd.toISOString());
        
        if (error) throw error;
        
        const earned = shifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;
        const percentage = weeklyRentalCost > 0 ? Math.min((earned / weeklyRentalCost) * 100, 100) : 0;
        
        return {
            earned: Math.round(earned),
            target: Math.round(weeklyRentalCost),
            percentage: Math.round(percentage)
        };
        
    } catch (error) {
        console.error('Error calculating rental progress:', error);
        return { earned: 0, target: 0, percentage: 0 };
    }
}

// ────────────────────────────────────────────────────────────────
// DAILY COST TARGET
// ────────────────────────────────────────────────────────────────

export async function calculateDailyCost() {
    try {
        const timezone = state.userSettings?.timezone_primary || 'America/Chicago';
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        const weeklyRental = state.userSettings?.weekly_rental_cost || 350;
        
        // Daily breakdown
        const dailyFixed = monthlyFixed / 30;
        const dailyRental = weeklyRental / 7;
        
        // Get vehicle operating costs for active shift
        let vehicleWeeklyCost = 0;
        if (state.activeShift && state.activeShift.vehicle_id) {
            const vehicle = state.fleet.find(v => v.id === state.activeShift.vehicle_id);
            vehicleWeeklyCost = vehicle?.operating_cost_weekly || 0;
        }
        const dailyVehicle = vehicleWeeklyCost / 7;
        
        const totalDaily = dailyFixed + dailyRental + dailyVehicle;
        
        return Math.round(totalDaily);
        
    } catch (error) {
        console.error('Error calculating daily cost:', error);
        return 0;
    }
}

// ────────────────────────────────────────────────────────────────
// SHIFT EARNINGS (Current/Active Shift)
// ────────────────────────────────────────────────────────────────

export function calculateShiftEarnings() {
    try {
        if (!state.activeShift) return 0;
        
        // Current shift gross earnings (if any)
        const gross = state.activeShift.gross_earnings || 0;
        
        return Math.round(gross);
        
    } catch (error) {
        console.error('Error calculating shift earnings:', error);
        return 0;
    }
}

// ────────────────────────────────────────────────────────────────
// MONTHLY RUNWAY (Future Feature)
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
    try {
        // Get total liquid assets (bank accounts, cash, etc.)
        // This would come from a future 'accounts' table
        const liquidAssets = 0; // Placeholder
        
        // Get monthly burn rate
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        const weeklyRental = state.userSettings?.weekly_rental_cost || 350;
        const monthlyRental = (weeklyRental / 7) * 30;
        
        const monthlyBurn = monthlyFixed + monthlyRental;
        
        if (monthlyBurn === 0) return 0;
        
        const runwayMonths = liquidAssets / monthlyBurn;
        
        return parseFloat(runwayMonths.toFixed(1));
        
    } catch (error) {
        console.error('Error calculating runway:', error);
        return 0;
    }
}

// ────────────────────────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────────────────────────

// Get start of day in user's timezone
export function getStartOfDay(date = new Date(), timezone = 'America/Chicago') {
    const d = getTimezoneDate(timezone);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Get end of day in user's timezone
export function getEndOfDay(date = new Date(), timezone = 'America/Chicago') {
    const d = getTimezoneDate(timezone);
    d.setHours(23, 59, 59, 999);
    return d;
}

// Check if date is in current week
export function isCurrentWeek(date, weekStartDay = 2, timezone = 'America/Chicago') {
    const currentDayOfWeek = getDayOfWeek(timezone);
    let daysSinceStart = currentDayOfWeek - weekStartDay;
    if (daysSinceStart < 0) daysSinceStart += 7;
    
    const nowInTz = getTimezoneDate(timezone);
    const weekStart = new Date(nowInTz);
    weekStart.setDate(weekStart.getDate() - daysSinceStart);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    const checkDate = new Date(date);
    return checkDate >= weekStart && checkDate < weekEnd;
}
