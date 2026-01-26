// ════════════════════════════════════════════════════════════════
// ROBERT OS - COSTS MODULE v1.7.2
// Financial Calculations (Fixed: Offline Rental Visibility)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// TIMEZONE UTILS
// ────────────────────────────────────────────────────────────────

function getTimezoneDate(timezone = 'America/Chicago') {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        
        const parts = formatter.formatToParts(new Date());
        const values = {};
        parts.forEach(({ type, value }) => values[type] = value);
        
        return new Date(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`);
    } catch (e) {
        return new Date(); // Fallback
    }
}

function getDayOfWeek(timezone = 'America/Chicago') {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short'
        });
        
        const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return dayMap[formatter.format(new Date())] || 0;
    } catch (e) {
        return 0; // Fallback to Sunday
    }
}

// ────────────────────────────────────────────────────────────────
// DAILY COST TARGET
// ────────────────────────────────────────────────────────────────

export async function calculateDailyCost() {
    try {
        // 1. Global fixed expenses (phone, spotify, etc.)
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        const dailyFixed = monthlyFixed / 30;
        
        // 2. Vehicle costs - Try Active Shift first, then Default Car
        let dailyVehicle = 0;
        let dailyCarwash = 0;
        
        let vehicle = null;
        
        // A. Is there an active shift?
        if (state.activeShift?.vehicle_id) {
            vehicle = state.fleet.find(v => v.id === state.activeShift.vehicle_id);
        } 
        // B. No shift? Use first Rental or first Active car
        else if (state.fleet.length > 0) {
            vehicle = state.fleet.find(v => v.type === 'rental' && v.is_active) || state.fleet[0];
        }

        if (vehicle) {
            // Weekly rental cost / 7
            const weeklyCost = vehicle.operating_cost_weekly || 0;
            dailyVehicle = weeklyCost / 7;
            
            // Monthly car wash / 30
            const monthlyWash = vehicle.carwash_monthly_cost || 0;
            dailyCarwash = monthlyWash / 30;
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
        const rentalWeekStartDay = state.userSettings?.rental_week_start_day ?? 2; // Default Tuesday
        
        // 1. Determine Target Amount (Rental Cost)
        let targetAmount = 0;
        let vehicle = null;

        // Priority 1: Active Shift Vehicle
        if (state.activeShift?.vehicle_id) {
            vehicle = state.fleet.find(v => v.id === state.activeShift.vehicle_id);
        } 
        // Priority 2: First "Rental" type vehicle (for offline viewing)
        else {
            vehicle = state.fleet.find(v => v.type === 'rental' && v.is_active);
        }

        if (vehicle) {
            targetAmount = vehicle.operating_cost_weekly || 0;
        }
        
        // If no rental cost, return 0 (owned car or empty fleet)
        if (targetAmount === 0) return { earned: 0, target: 0, percentage: 0 };

        // 2. Calculate Week Range
        const currentDayOfWeek = getDayOfWeek(timezone);
        let daysSinceStart = currentDayOfWeek - rentalWeekStartDay;
        if (daysSinceStart < 0) daysSinceStart += 7;
        
        const nowInTz = getTimezoneDate(timezone);
        const weekStart = new Date(nowInTz);
        weekStart.setDate(weekStart.getDate() - daysSinceStart);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        // 3. Query DB for earnings in this range
        const { data: shifts, error } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .gte('end_time', weekStart.toISOString())
            .lte('end_time', weekEnd.toISOString());
        
        // Add current active shift earnings if applicable
        let currentShiftEarnings = 0;
        if (state.activeShift && state.activeShift.gross_earnings) {
            currentShiftEarnings = state.activeShift.gross_earnings;
        }

        const historicalEarnings = shifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;
        const totalEarned = historicalEarnings + currentShiftEarnings;
        
        const percentage = Math.min((totalEarned / targetAmount) * 100, 100);
        
        return {
            earned: Math.round(totalEarned),
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
// RUNWAY (Future)
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
    return 0.0; // Placeholder for v1.8
}
