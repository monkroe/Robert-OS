// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v1.7.5
// Sistemos įrankiai, formatavimas ir saugumo filtrai
// ════════════════════════════════════════════════════════════════

import { state } from './state.js';

// ────────────────────────────────────────────────────────────────
// 1. HAPTIC FEEDBACK (Vartotojo pojūčiai)
// ────────────────────────────────────────────────────────────────

export const vibrate = (pattern = [10]) => {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

// ────────────────────────────────────────────────────────────────
// 2. SAUGŪS PRANEŠIMAI (Toast Notifications)
// ────────────────────────────────────────────────────────────────

const activeToasts = new Set();
const MAX_TOASTS = 3;

/**
 * Rodo pranešimą ekrane saugiai (XSS protection)
 * @param {string} msg - Pranešimo tekstas
 * @param {string} type - 'info', 'success', 'error', 'warning'
 */
export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Perteklinių pranešimų valymas
    if (activeToasts.size >= MAX_TOASTS) {
        const oldest = activeToasts.values().next().value;
        if (oldest) {
            oldest.remove();
            activeToasts.delete(oldest);
        }
    }
    
    const toast = document.createElement('div');
    const colorMap = {
        'error': 'bg-red-500',
        'success': 'bg-teal-500',
        'warning': 'bg-yellow-500',
        'info': 'bg-gray-800'
    };
    
    // v1.5 Estetika: rounded-2xl ir stiprus šešėlis
    toast.className = `${colorMap[type]} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-black animate-slideUp pointer-events-auto mb-2 transition-all duration-300`;
    
    // Saugus teksto įterpimas (textContent)
    const span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    // Vibracijos feedback'as pagal tipą
    const vibrations = { 'error': [50, 50, 50], 'success': [20], 'warning': [30, 10] };
    vibrate(vibrations[type] || [10]);
    
    // Automatinis paslėpimas
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                toast.remove();
                activeToasts.delete(toast);
            }, 300);
        }
    }, 3500);
};

// ────────────────────────────────────────────────────────────────
// 3. DUOMENŲ FORMATAVIMAS (Derived Truth)
// ────────────────────────────────────────────────────────────────

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
    }).format(amount);
};

/**
 * Formatuoja datą pagal vartotojo nustatytą laiko juostą
 */
export const formatDate = (date) => {
    const timezone = state.userSettings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat('lt-LT', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date));
};

export const formatTime = (date) => {
    const timezone = state.userSettings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat('lt-LT', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date));
};

// ────────────────────────────────────────────────────────────────
// 4. KLAIDŲ VALDYMAS (Smart Handlers)
// ────────────────────────────────────────────────────────────────

export const initGlobalErrorHandlers = () => {
    // Gaudo sinchronines klaidas
    window.onerror = (message, source, lineno, colno, error) => {
        // Ignoruojame išorinius skriptus (pvz. naršyklės plėtinius)
        if (source && !source.includes(window.location.origin)) return false;
        
        console.error('🚨 ROBERT OS CRITICAL:', { message, line: lineno, error });
        showToast('Sistemos klaida. Tikrinkite konsolę.', 'error');
        return false;
    };

    // Gaudo asinchronines klaidas (Supabase/Fetch)
    window.onunhandledrejection = (event) => {
        const reason = event.reason?.message || event.reason;
        console.error('🔥 UNHANDLED PROMISE:', reason);
        
        if (reason && (reason.includes('fetch') || reason.includes('database'))) {
            showToast('Ryšio klaida su duomenų baze.', 'error');
        }
    };
    
    console.log('✅ Globalūs klaidų filtrai aktyvuoti.');
};

// Eksportuojame globaliai debug'inimui
if (typeof window !== 'undefined') {
    window.showToast = showToast;
}
