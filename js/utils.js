// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v1.5.0
// Global Utilities with HTML Toast Support
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK
// ────────────────────────────────────────────────────────────────

export const vibrate = (pattern = [10]) => {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

// ────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS (With Queue Management)
// ────────────────────────────────────────────────────────────────

const activeToasts = new Set();
const MAX_TOASTS = 3;

export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found');
        return;
    }
    
    // Prevent spam
    if (activeToasts.size >= MAX_TOASTS) {
        const oldest = activeToasts.values().next().value;
        if (oldest) {
            oldest.remove();
            activeToasts.delete(oldest);
        }
    }
    
    // ✅ ALLOW HTML (for icons) - no escaping needed if we control the source
    const toast = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500' : 'bg-teal-500';
    
    toast.className = `${color} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp pointer-events-auto`;
    toast.innerHTML = `<span>${msg}</span>`; // ✅ HTML supported
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    vibrate(type === 'error' ? [50, 50, 50] : [20]);
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
        activeToasts.delete(toast);
    }, 3000);
};

// ────────────────────────────────────────────────────────────────
// XSS PROTECTION (Legacy support)
// ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// CLEANUP (On page unload)
// ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        activeToasts.forEach(toast => {
            if (toast.parentElement) {
                toast.remove();
            }
        });
        activeToasts.clear();
    });
}

// ────────────────────────────────────────────────────────────────
// ADDITIONAL UTILITIES
// ────────────────────────────────────────────────────────────────

// Format currency
export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
};

// Format date
export const formatDate = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
    }).format(new Date(date));
};

// Format time
export const formatTime = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date));
};

// Debounce function
export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Throttle function
export const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// ────────────────────────────────────────────────────────────────
// GLOBAL EXPOSURE (For debugging)
// ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.getActiveToastCount = () => activeToasts.size;
}
