// ════════════════════════════════════════════════════════════════
// ROBERT OS - COSTS MODULE
// Versija: 1.2
// 
// ATSAKOMYBĖ: Ekonomikos skaičiavimai (DERIVED TRUTH sluoksnis)
// Visa verslo logika skaičiavimams - NIEKADA nevyksta app.js
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

// ────────────────────────────────────────────────────────────────
// 1. DIENOS KAŠTAI (Daily Cost)
// ────────────────────────────────────────────────────────────────
// Skaičiuoja kiek pinigų reikia uždirbti šiandien, kad padengtų:
// - Fiksuotas mėnesines išlaidas (rent, utilities, debt, etc.)
// - Transporto kainą (jei aktyvus shift)

export async function calculateDailyCost() {
    try {
        // 1. Gauti vartotojo nustatymus (fiksuotos išlaidos)
        const { data: settings, error: settingsError } = await db
            .from('user_settings')
            .select('monthly_fixed_expenses, weekly_rental_cost')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        if (settingsError) {
            console.warn('Settings not found, using defaults:', settingsError);
        }
        
        // Jei settings nėra, naudojame 0 (vartotojas dar nesukonfigūravo)
        const monthlyFixed = settings?.monthly_fixed_expenses || 0;
        const weeklyRental = settings?.weekly_rental_cost || 0;
        
        // 2. Skaičiuoti dieninę fiksuotų išlaidų dalį
        const dailyFixed = monthlyFixed / 30;
        
        // 3. Gauti aktyvaus transporto kainą (jei shift aktyvus)
        let dailyVehicleCost = 0;
        
        if (state.activeShift && state.activeShift.vehicle_id) {
            const vehicle = state.fleet.find(v => v.id === state.activeShift.vehicle_id);
            if (vehicle) {
                dailyVehicleCost = calculateDailyVehicleCost(vehicle);
            }
        } else if (weeklyRental > 0) {
            // Jei shift neaktyvus, bet yra nuoma - rodome nuomos kainą
            dailyVehicleCost = weeklyRental / 7;
        }
        
        // 4. Bendra dienos kaina
        return dailyFixed + dailyVehicleCost;
        
    } catch (error) {
        console.error('Error calculating daily cost:', error);
        return 0;
    }
}

// ────────────────────────────────────────────────────────────────
// 2. TRANSPORTO DIENOS KAINA (Daily Vehicle Cost)
// ────────────────────────────────────────────────────────────────
// Transporto domenų logika - skaičiuoja dieninę kainą pagal tipą

export function calculateDailyVehicleCost(vehicle) {
    if (!vehicle || !vehicle.operating_cost_weekly) {
        return 0;
    }
    
    // Ateityje: skirtingi modeliai pagal tipą
    // - rental: savaitinė kaina / 7
    // - owned: nusidėvėjimas + priežiūra / 30
    // - lease: mėnesinis mokestis / 30
    
    switch (vehicle.type) {
        case 'rental':
            return vehicle.operating_cost_weekly / 7;
        case 'owned':
            // Owned automobiliams - tik operating cost (kuras, priežiūra)
            // Nusidėvėjimas neskaičiuojamas kasdien
            return vehicle.operating_cost_weekly / 7;
        default:
            return vehicle.operating_cost_weekly / 7;
    }
}

// ────────────────────────────────────────────────────────────────
// 3. SHIFT PAJAMOS (Shift Earnings)
// ────────────────────────────────────────────────────────────────
// DERIVED iš finance_shifts lentelės

export function calculateShiftEarnings() {
    // Tiesiog grąžiname gross_earnings iš aktyvios pamainos
    // Jei pamaina neaktyvi - 0
    return state.activeShift?.gross_earnings || 0;
}

// ────────────────────────────────────────────────────────────────
// 4. SAVAITĖS NUOMOS PROGRESĄ (Weekly Rental Progress)
// ────────────────────────────────────────────────────────────────
// Skaičiuoja kiek uždirbta šią savaitę (rental coverage)

export async function calculateWeeklyRentalProgress() {
    try {
        // 1. Gauti vartotojo nustatymus (kada prasideda savaitė)
        const { data: settings } = await db
            .from('user_settings')
            .select('rental_week_start_day, weekly_rental_cost')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        if (!settings || !settings.weekly_rental_cost) {
            return {
                target: 0,
                earned: 0,
                percentage: 0,
                daysLeft: 0
            };
        }
        
        // 2. Apskaičiuoti savaitės pradžią
        const weekStart = getCurrentWeekStart(settings.rental_week_start_day);
        
        // 3. Gauti šios savaitės pajamas (completed shifts)
        const { data: shifts } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .gte('end_time', weekStart.toISOString())
            .lte('end_time', new Date().toISOString());
        
        const earned = shifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;
        const target = settings.weekly_rental_cost;
        const percentage = target > 0 ? Math.min((earned / target) * 100, 100) : 0;
        
        // 4. Dienų liko iki savaitės pabaigos
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const daysLeft = Math.ceil((weekEnd - new Date()) / (1000 * 60 * 60 * 24));
        
        return {
            target: Math.round(target),
            earned: Math.round(earned),
            percentage: Math.round(percentage),
            daysLeft: Math.max(daysLeft, 0)
        };
        
    } catch (error) {
        console.error('Error calculating rental progress:', error);
        return { target: 0, earned: 0, percentage: 0, daysLeft: 0 };
    }
}

// ────────────────────────────────────────────────────────────────
// 5. PAGALBINĖ: Rasti Savaitės Pradžią
// ────────────────────────────────────────────────────────────────
// Pagal vartotojo nustatymą (1=Mon, 2=Tue, ..., 7=Sun)

function getCurrentWeekStart(userStartDay) {
    const now = new Date();
    const today = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    // Konvertuoti vartotojo nustatymą (1-7) į JS formatą (0-6)
    // userStartDay: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
    // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const jsStartDay = userStartDay === 7 ? 0 : userStartDay;
    
    // Skaičiuoti kiek dienų atgal reikia eiti
    let daysBack = (today - jsStartDay + 7) % 7;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysBack);
    weekStart.setHours(0, 0, 0, 0);
    
    return weekStart;
}

// ────────────────────────────────────────────────────────────────
// 6. SHIFT EKONOMIKA (iš DB funkcijos)
// ────────────────────────────────────────────────────────────────
// Kviečia DB funkciją calculate_shift_economics()

export async function getShiftEconomics(shiftId) {
    try {
        const { data, error } = await db.rpc('calculate_shift_economics', {
            p_shift_id: shiftId
        });
        
        if (error) throw error;
        
        return data;
        
    } catch (error) {
        console.error('Error getting shift economics:', error);
        return null;
    }
}

// ────────────────────────────────────────────────────────────────
// 7. MPG SKAIČIAVIMAS (Miles Per Gallon)
// ────────────────────────────────────────────────────────────────
// Paprastas skaičiavimas - naudojamas UI rodymui

export function calculateMPG(miles, gallons) {
    if (!gallons || gallons === 0) return 0;
    return Math.round((miles / gallons) * 10) / 10; // 1 skaitmuo po kablelio
}

// ────────────────────────────────────────────────────────────────
// 8. COST PER MILE
// ────────────────────────────────────────────────────────────────

export function calculateCostPerMile(totalCost, miles) {
    if (!miles || miles === 0) return 0;
    return Math.round((totalCost / miles) * 1000) / 1000; // 3 skaitmenys po kablelio
}

// ────────────────────────────────────────────────────────────────
// 9. EARNINGS PER MILE
// ────────────────────────────────────────────────────────────────

export function calculateEarningsPerMile(earnings, miles) {
    if (!miles || miles === 0) return 0;
    return Math.round((earnings / miles) * 1000) / 1000;
}

// ────────────────────────────────────────────────────────────────
// 10. HOURLY RATE
// ────────────────────────────────────────────────────────────────

export function calculateHourlyRate(netEarnings, hours) {
    if (!hours || hours === 0) return 0;
    return Math.round((netEarnings / hours) * 100) / 100; // 2 skaitmenys
}

// ────────────────────────────────────────────────────────────────
// 11. CAR WASH COST (Membership Amortizacija)
// ────────────────────────────────────────────────────────────────
// Skaičiuoja faktinę plovyklos kainą per mėnesį

export async function calculateCarWashCost() {
    try {
        const { data, error } = await db
            .from('car_wash_economics')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        if (error || !data) {
            return {
                membershipCost: 0,
                washesThisMonth: 0,
                costPerWash: 0
            };
        }
        
        return {
            membershipCost: data.monthly_cost,
            washesThisMonth: data.washes_this_month,
            costPerWash: data.cost_per_wash
        };
        
    } catch (error) {
        console.error('Error calculating car wash cost:', error);
        return {
            membershipCost: 0,
            washesThisMonth: 0,
            costPerWash: 0
        };
    }
    }
