// ════════════════════════════════════════════════════════════════
// ROBERT OS - COSTS MODULE v1.6.0 (FINAL)
// Logic: Vehicle First > No Global Rental Cost
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// TIMEZONE UTILS (IMPROVED)
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
// DAILY COST TARGET
// ────────────────────────────────────────────────────────────────

export async function calculateDailyCost() {
    try {
        // 1. Global fixed expenses (phone, spotify, etc.)
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        const dailyFixed = monthlyFixed / 30;
        
        // 2. Vehicle costs (rental + car wash) - PER ACTIVE VEHICLE
        let dailyVehicle = 0;
        let dailyCarwash = 0;
        
        const activeVehId = state.activeShift?.vehicle_id;
        
        if (activeVehId) {
            const vehicle = state.fleet.find(v => v.id === activeVehId);
            
            if (vehicle) {
                // Weekly rental cost / 7
                const weeklyCost = vehicle.operating_cost_weekly || 0;
                dailyVehicle = weeklyCost / 7;
                
                // Monthly car wash / 30
                const monthlyWash = vehicle.carwash_monthly_cost || 0;
                dailyCarwash = monthlyWash / 30;
            }
        }
        
        const totalDaily = dailyFixed + dailyVehicle + dailyCarwash;
        
        return Math.round(totalDaily);
        
    } catch (error) {
        console.error('Error calculating daily cost:', error);
        return 0;
    }
}

// ────────────────────────────────────────────────────────────────
// WEEKLY RENTAL PROGRESS
// ────────────────────────────────────────────────────────────────

export async function calculateWeeklyRentalProgress() {
    try {
        const timezone = state.userSettings?.timezone_primary || 'America/Chicago';
        const rentalWeekStartDay = state.userSettings?.rental_week_start_day || 2;
        
        // Get active vehicle's rental cost
        const activeVehId = state.activeShift?.vehicle_id;
        let targetAmount = 0;
        
        if (activeVehId) {
            const vehicle = state.fleet.find(v => v.id === activeVehId);
            targetAmount = vehicle?.operating_cost_weekly || 0;
        }
        
        if (targetAmount === 0) return { earned: 0, target: 0, percentage: 0 };

        // Calculate week start
        const currentDayOfWeek = getDayOfWeek(timezone);
        let daysSinceStart = currentDayOfWeek - rentalWeekStartDay;
        if (daysSinceStart < 0) daysSinceStart += 7;
        
        const nowInTz = getTimezoneDate(timezone);
        const weekStart = new Date(nowInTz);
        weekStart.setDate(weekStart.getDate() - daysSinceStart);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        // Query earnings for this week
        const { data: shifts, error } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .gte('end_time', weekStart.toISOString())
            .lte('end_time', weekEnd.toISOString());
        
        if (error) throw error;
        
        const earned = shifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;
        const percentage = Math.min((earned / targetAmount) * 100, 100);
        
        return {
            earned: Math.round(earned),
            target: Math.round(targetAmount),
            percentage: Math.round(percentage)
        };
        
    } catch (error) {
        console.error('Rental progress error:', error);
        return { earned: 0, target: 0, percentage: 0 };
    }
}

// ────────────────────────────────────────────────────────────────
// SHIFT EARNINGS
// ────────────────────────────────────────────────────────────────

export function calculateShiftEarnings() {
    if (!state.activeShift) return 0;
    return Math.round(state.activeShift.gross_earnings || 0);
}

// ────────────────────────────────────────────────────────────────
// FUTURE: RUNWAY CALCULATION
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
    try {
        const liquidAssets = 0; // Future: from accounts table
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        
        // Average vehicle costs across fleet
        let avgMonthlyVehicle = 0;
        if (state.fleet.length > 0) {
            const totalWeekly = state.fleet.reduce((sum, v) => sum + (v.operating_cost_weekly || 0), 0);
            avgMonthlyVehicle = (totalWeekly / state.fleet.length / 7) * 30;
        }
        
        const monthlyBurn = monthlyFixed + avgMonthlyVehicle;
        
        if (monthlyBurn === 0) return 0;
        
        const runwayMonths = liquidAssets / monthlyBurn;
        
        return parseFloat(runwayMonths.toFixed(1));
        
    } catch (error) {
        console.error('Error calculating runway:', error);
        return 0;
    }
}
