// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v2.0.1
// Global Utilities: Haptics, Formatting, Toasts & Memory Hygiene
// ════════════════════════════════════════════════════════════════

import { state } from './state.js'; // ✅ FIX: Added import for error handler access

// ────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK
// ────────────────────────────────────────────────────────────────

export const vibrate = (pattern = [10]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

// ────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS (XSS-Safe & Memory Efficient)
// ────────────────────────────────────────────────────────────────

const activeToasts = new Set();
const MAX_TOASTS = 3;

export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Memory Hygiene: Užtikriname, kad Set'as neaugtų be galo
    if (activeToasts.size >= MAX_TOASTS) {
        const oldest = activeToasts.values().next().value;
        if (oldest) {
            oldest.classList.add('opacity-0');
            setTimeout(() => {
                if (oldest.parentElement) oldest.remove();
                activeToasts.delete(oldest);
            }, 300);
        }
    }
    
    const toast = document.createElement('div');
    const colorMap = {
        'error': 'bg-red-500',
        'success': 'bg-green-500',
        'info': 'bg-teal-500',
        'warning': 'bg-yellow-500'
    };
    
    const color = colorMap[type] || 'bg-teal-500';
    toast.className = `${color} text-black px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-black animate-slideUp pointer-events-auto transition-all duration-300`;
    
    // ✅ XSS PREVENTION: Tik textContent
    const span = document.createElement('span');
    span.textContent = msg.toUpperCase();
    toast.appendChild(span);
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    // Haptic pattern per type
    const vibrationMap = {
        'error': [50, 50, 50],
        'success': [20],
        'warning': [30, 10, 30],
        'info': [15]
    };
    vibrate(vibrationMap[type] || [15]);
    
    // Auto-dismiss su valymu
    setTimeout(() => {
        if (activeToasts.has(toast)) {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
                activeToasts.delete(toast);
            }, 300);
        }
    }, 3500);
};

// ────────────────────────────────────────────────────────────────
// FORMAT UTILITIES (LT Locale Sync)
// ────────────────────────────────────────────────────────────────

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2, // Svarbu auditui
        maximumFractionDigits: 2
    }).format(amount);
};

export const formatDate = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('lt-LT', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date));
};

export const formatTime = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('lt-LT', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date));
};

// ────────────────────────────────────────────────────────────────
// PERFORMANCE UTILITIES
// ────────────────────────────────────────────────────────────────

export const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

// ────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLERS (System Stability)
// ────────────────────────────────────────────────────────────────

export const initGlobalErrorHandlers = () => {
    window.onerror = (message, source, lineno) => {
        if (source && !source.includes(window.location.origin)) return false;
        
        console.error('🚨 OS CRITICAL:', message, 'at line', lineno);
        // Rodome tik esminę informaciją vartotojui
        if (message.includes('Supabase') || message.includes('db')) {
            showToast('DATABASE CONNECTION ERROR', 'error');
        }
        return false;
    };

    window.onunhandledrejection = (event) => {
        console.error('🔥 PROMISE REJECTED:', event.reason);
        // Prevent ghost errors from background sync
        if (state && !state.loading) {
             // Safe check in case state isn't fully ready
             showToast('SYNC FAILED', 'warning');
        }
    };
};

// Global exposure debuggingui
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.vibrate = vibrate;
}
