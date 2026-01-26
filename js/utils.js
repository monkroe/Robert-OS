// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v1.7.2
// Global Utilities with Safe Toast Support
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
// TOAST NOTIFICATIONS (XSS-Safe)
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
            oldest.classList.add('fade-out');
            setTimeout(() => {
                oldest.remove();
                activeToasts.delete(oldest);
            }, 200);
        }
    }
    
    // ✅ XSS-SAFE: Use textContent, not innerHTML
    const toast = document.createElement('div');
    const colorMap = {
        'error': 'bg-red-500',
        'success': 'bg-green-500',
        'info': 'bg-teal-500',
        'warning': 'bg-yellow-500'
    };
    const color = colorMap[type] || 'bg-teal-500';
    
    toast.className = `${color} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp pointer-events-auto`;
    
    // ✅ SAFE: textContent prevents XSS
    const span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    // Vibration patterns per type
    const vibrationMap = {
        'error': [50, 50, 50],
        'success': [20],
        'warning': [30, 10, 30],
        'info': [20]
    };
    vibrate(vibrationMap[type] || [20]);
    
    // Auto-dismiss
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('fade-out');
            setTimeout(() => {
                toast.remove();
                activeToasts.delete(toast);
            }, 200);
        }
    }, 3000);
};

// ────────────────────────────────────────────────────────────────
// TOAST WITH ICON (Safe HTML injection)
// ────────────────────────────────────────────────────────────────

export const showToastWithIcon = (msg, icon, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    if (activeToasts.size >= MAX_TOASTS) {
        const oldest = activeToasts.values().next().value;
        if (oldest) oldest.remove();
        activeToasts.delete(oldest);
    }
    
    const toast = document.createElement('div');
    const colorMap = {
        'error': 'bg-red-500',
        'success': 'bg-green-500',
        'info': 'bg-teal-500',
        'warning': 'bg-yellow-500'
    };
    
    toast.className = `${colorMap[type]} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp pointer-events-auto`;
    
    // ✅ CONTROLLED HTML: Only whitelisted icons
    const iconEl = document.createElement('span');
    iconEl.textContent = icon; // Emoji or text icon
    
    const msgEl = document.createElement('span');
    msgEl.textContent = msg;
    
    toast.appendChild(iconEl);
    toast.appendChild(msgEl);
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    vibrate([20]);
    
    setTimeout(() => {
        toast.remove();
        activeToasts.delete(toast);
    }, 3000);
};

// ────────────────────────────────────────────────────────────────
// FORMAT UTILITIES
// ────────────────────────────────────────────────────────────────

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
};

export const formatDate = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
    }).format(new Date(date));
};

export const formatTime = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date));
};

export const formatDateTime = (date, timezone = 'America/Chicago') => {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
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
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

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
// ERROR HANDLERS (Smart, not noisy)
// ────────────────────────────────────────────────────────────────

export const initGlobalErrorHandlers = () => {
    // ✅ ONLY log errors, don't show toast for every error
    window.onerror = (message, source, lineno, colno, error) => {
        // Filter out extension errors and third-party scripts
        if (source && !source.includes(window.location.origin)) {
            return false; // Ignore external errors
        }
        
        console.error('🚨 ROBERT OS ERROR:', {
            message,
            source,
            line: lineno,
            column: colno,
            error
        });
        
        // ✅ ONLY show toast for critical app errors
        if (message.includes('ROBERT OS') || message.includes('db.js') || message.includes('app.js')) {
            showToast('System error - check console', 'error');
        }
        
        return false;
    };

    // ✅ Handle unhandled promise rejections
    window.onunhandledrejection = (event) => {
        console.error('🔥 UNHANDLED PROMISE REJECTION:', event.reason);
        
        // ✅ ONLY show toast for critical errors
        const reason = event.reason?.message || event.reason;
        
        if (reason && (
            reason.includes('fetch') ||
            reason.includes('database') ||
            reason.includes('Supabase') ||
            reason.includes('auth')
        )) {
            showToast('Connection error - retrying...', 'error');
        }
        
        return false;
    };
    
    console.log('✅ Global error handlers initialized');
};

// ────────────────────────────────────────────────────────────────
// CLEANUP
// ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        activeToasts.forEach(toast => {
            if (toast.parentElement) toast.remove();
        });
        activeToasts.clear();
    });
}

// ────────────────────────────────────────────────────────────────
// GLOBAL EXPOSURE (For debugging)
// ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.getActiveToastCount = () => activeToasts.size;
}
