// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/COSTS.JS v2.1.0
// Logic: Financial Projections & Rental Tracking
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// TIMEZONE UTILS
// ────────────────────────────────────────────────────────────────

/**
 * Sukuria Date objektą pagal nurodytą laiko juostą.
 * Naudojama skaičiuojant "savaitės pradžią" pagal vartotojo lokaciją.
 */
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
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short'
    });
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[formatter.format(new Date())];
}

/**
 * Smart Vehicle Selector
 * 1. Jei yra aktyvi pamaina -> imam jos mašiną.
 * 2. Jei ne -> imam pirmą "rental" tipo mašiną garaže.
 * 3. Fallback -> imam tiesiog pirmą mašiną.
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
        // Safe defaults from Settings
        const monthlyFixed = state.userSettings?.monthly_fixed_expenses || 0;
        const dailyFixed = monthlyFixed / 30; // Approximation
        
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
        console.error('Costs Calc Error:', error);
        return 0;
    }
}

// ────────────────────────────────────────────────────────────────
// WEEKLY RENTAL PROGRESS
// ────────────────────────────────────────────────────────────────

export async function calculateWeeklyRentalProgress() {
    try {
        const timezone = state.userSettings?.timezone || 'America/Chicago';
        // Default rental week starts Tuesday (2) if not specified
        const rentalWeekStartDay = state.userSettings?.rental_week_start_day ?? 2; 
        
        const vehicle = getTargetVehicle();
        // If owned vehicle or no cost, target is 0
        const targetAmount = (vehicle?.type === 'rental') ? (vehicle.operating_cost_weekly || 0) : 0;
        
        if (targetAmount === 0) return { earned: 0, target: 0, percentage: 100 };

        // Time Window Logic
        const currentDayOfWeek = getDayOfWeek(timezone);
        let daysSinceStart = currentDayOfWeek - rentalWeekStartDay;
        if (daysSinceStart < 0) daysSinceStart += 7;
        
        const nowInTz = getTimezoneDate(timezone);
        const weekStart = new Date(nowInTz);
        weekStart.setDate(weekStart.getDate() - daysSinceStart);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        // Fetch earnings within this calculated week
        const { data: shifts, error } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .gte('end_time', weekStart.toISOString())
            .lte('end_time', weekEnd.toISOString());
        
        if (error) throw error;
        
        const earned = shifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;
        
        // Add active shift earnings to "Projected" if needed, 
        // but typically rental is paid from "Banked" money.
        // We will stick to COMPLETED shifts for accuracy.
        
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
// SHIFT EARNINGS
// ────────────────────────────────────────────────────────────────

export function calculateShiftEarnings() {
    if (!state.activeShift) return 0;
    return Math.round(state.activeShift.gross_earnings || 0);
}

// ────────────────────────────────────────────────────────────────
// RUNWAY (FUTURE FEATURE)
// ────────────────────────────────────────────────────────────────

export async function calculateRunway() {
    // Placeholder for v2.2 - Asset Management
    return 0.0;
}
