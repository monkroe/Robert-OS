// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v1.7.2
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
// TOAST NOTIFICATIONS (XSS-Safe)
// ────────────────────────────────────────────────────────────────

const activeToasts = new Set();
const MAX_TOASTS = 3;

export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Prevent spam
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
        'success': 'bg-green-500',
        'info': 'bg-teal-500',
        'warning': 'bg-yellow-500'
    };
    const color = colorMap[type] || 'bg-teal-500';
    
    toast.className = `${color} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp pointer-events-auto mb-2 uppercase tracking-wide`;
    
    // Icons
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';
    
    toast.innerHTML = `<i class="fa-solid ${iconClass} text-lg"></i> <span>${msg}</span>`;
    
    container.appendChild(toast);
    activeToasts.add(toast);
    
    vibrate(type === 'error' ? [50, 50, 50] : [20]);
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
                activeToasts.delete(toast);
            }, 200);
        }
    }, 3000);
};

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.vibrate = vibrate;
}

