// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v1.7.2 (RESTORED ORIGINAL)
// Global Utilities with Safe Toast Support
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK
// ────────────────────────────────────────────────────────────────

export const vibrate = (pattern = [10]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

// ────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS (XSS-Safe & Anti-Spam)
// ────────────────────────────────────────────────────────────────

const activeToasts = new Set();
const MAX_TOASTS = 3;

export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found');
        return;
    }
    
    // Prevent spam: Remove oldest if limit reached
    if (activeToasts.size >= MAX_TOASTS) {
        const oldest = activeToasts.values().next().value;
        if (oldest) {
            oldest.remove();
            activeToasts.delete(oldest);
        }
    }
    
    // Create Toast Element
    const toast = document.createElement('div');
    const colorMap = {
        'error': 'bg-red-500',
        'success': 'bg-green-500',
        'info': 'bg-teal-500',
        'warning': 'bg-yellow-500'
    };
    const color = colorMap[type] || 'bg-teal-500';
    
    // Original v1.7 styles
    toast.className = `${color} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp pointer-events-auto mb-2`;
    
    // Icon selection based on type
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';
    if (type === 'warning') iconClass = 'fa-bell';

    // HTML Structure
    const icon = document.createElement('i');
    icon.className = `fa-solid ${iconClass}`;
    
    const span = document.createElement('span');
    span.textContent = msg.toUpperCase();
    
    toast.appendChild(icon);
    toast.appendChild(span);
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    // Vibration
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
            toast.style.transition = 'opacity 0.2s';
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
                activeToasts.delete(toast);
            }, 200);
        }
    }, 3000);
};

// ────────────────────────────────────────────────────────────────
// FORMAT UTILITIES
// ────────────────────────────────────────────────────────────────

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

export const formatDate = (date, timezone = 'America/Chicago') => {
    try {
        return new Intl.DateTimeFormat('lt-LT', {
            timeZone: timezone,
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        }).format(new Date(date));
    } catch (e) {
        return new Date(date).toLocaleDateString();
    }
};

export const formatTime = (date, timezone = 'America/Chicago') => {
    try {
        return new Intl.DateTimeFormat('lt-LT', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(new Date(date));
    } catch (e) {
        return new Date(date).toLocaleTimeString();
    }
};

// ────────────────────────────────────────────────────────────────
// ERROR HANDLERS
// ────────────────────────────────────────────────────────────────

export const initGlobalErrorHandlers = () => {
    window.onerror = (message, source) => {
        if (source && !source.includes(window.location.origin)) return false;
        console.error('OS Error:', message);
        // showToast('System error', 'error'); // Uncomment if you want toasts for errors
        return false;
    };
};

// Bind for global access
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.vibrate = vibrate;
}
