// ════════════════════════════════════════════════════════════════
// ROBERT OS - COSTS MODULE v1.6.2 (DOCUMENTED)
// Logic: Smart Fallback + Explicit Business Rules
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// TIMEZONE UTILS
// ────────────────────────────────────────────────────────────────

/**
 * Sukuria Date objektą pagal nurodytą laiko juostą.
 * ⚠️ WARNING: Grąžina "Interpreted Local" laiką.
 * Tai reiškia, kad Date objektas turės naršyklės laiko juostos offsetą,
 * bet "valandos" atitiks tikslinę laiko juostą.
 * Naudoti TIK palyginimams ir UI atvaizdavimui, ne aritmetikai tarp zonų.
 */
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

/**
 * Smart Vehicle Selector
 * 1. Active Shift Vehicle
 * 2. Fallback: First 'Rental' type in garage
 * 3. Fallback: First vehicle in garage
 */
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
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        const dailyFixed = monthlyFixed / 30; // Approximation: 30-day month
        
        let dailyVehicle = 0;
        let dailyCarwash = 0;
        
        const vehicle = getTargetVehicle();
        
        if (vehicle) {
            const weeklyCost = vehicle.operating_cost_weekly || 0;
            dailyVehicle = weeklyCost / 7;
            
            const monthlyWash = vehicle.carwash_monthly_cost || 0;
            dailyCarwash = monthlyWash / 30;
        }
        
        return Math.round(dailyFixed + dailyVehicle + dailyCarwash);
        
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
        
        const vehicle = getTargetVehicle();
        const targetAmount = vehicle?.operating_cost_weekly || 0;
        
        if (targetAmount === 0) return { earned: 0, target: 0, percentage: 0 };

        // Time Window Calculation
        const currentDayOfWeek = getDayOfWeek(timezone);
        let daysSinceStart = currentDayOfWeek - rentalWeekStartDay;
        if (daysSinceStart < 0) daysSinceStart += 7;
        
        const nowInTz = getTimezoneDate(timezone);
        const weekStart = new Date(nowInTz);
        weekStart.setDate(weekStart.getDate() - daysSinceStart);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        /**
         * BUSINESS RULE: Payout attribution
         * Uždarbis priskiriamas tai savaitei, kurioje pamaina BAIGĖSI (end_time).
         * Jei pamaina prasidėjo sekmadienį, o baigėsi pirmadienį (naują savaitę),
         * pinigai krenta į naują savaitę.
         */
        const { data: shifts, error } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .gte('end_time', weekStart.toISOString())
            .lte('end_time', weekEnd.toISOString());
        
        if (error) throw error;
        
        const earned = shifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;
        
        // Cap percentage at 100% for UI progress bars (earned can exceed target)
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
// FUTURE: RUNWAY CALCULATION (STUB)
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
    try {
        // TODO: Implement 'Assets' table fetching
        // Currently hardcoded to 0 to prevent UI errors until v1.8
        const liquidAssets = 0; 
        
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        
        let avgMonthlyVehicle = 0;
        if (state.fleet.length > 0) {
            const totalWeekly = state.fleet.reduce((sum, v) => sum + (v.operating_cost_weekly || 0), 0);
            avgMonthlyVehicle = (totalWeekly / 7) * 30; 
        }
        
        const monthlyBurn = monthlyFixed + avgMonthlyVehicle;
        
        if (monthlyBurn === 0) return 0;
        
        return parseFloat((liquidAssets / monthlyBurn).toFixed(1));
        
    } catch (error) {
        console.error('Error calculating runway:', error);
        return 0;
    }
}
