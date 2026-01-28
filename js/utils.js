// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v2.6.0
// Logic: Toast Notifications (Max 3) & Formatting
// ════════════════════════════════════════════════════════════════

import { state } from './state.js';

export const vibrate = (pattern = [10]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

// ────────────────────────────────────────────────────────────────
// TOAST ENGINE (Max 3, Icons, Stacking)
// ────────────────────────────────────────────────────────────────

export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // 1. Limit to 3 messages (Remove oldest)
    while (container.children.length >= 3) {
        container.removeChild(container.firstChild);
    }

    // 2. Create Element
    const toast = document.createElement('div');
    // Pridedame klases pagal style.css v2.6
    toast.className = `toast-msg ${type}`; 

    // 3. Icon Selection
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    // 4. Content
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${msg.toUpperCase()}</span>
    `;

    // 5. Add & Auto-remove
    container.appendChild(toast);
    
    // Vibracija pagal tipą
    vibrate(type === 'error' ? [50, 50, 50] : [20]);

    // Išnykimas
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.transition = 'all 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);
};

// ────────────────────────────────────────────────────────────────
// FORMATTERS
// ────────────────────────────────────────────────────────────────

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
};

export const formatDate = (date, tz = 'America/Chicago') => {
    return new Intl.DateTimeFormat('lt-LT', {
        timeZone: tz, dateStyle: 'short'
    }).format(new Date(date));
};

// Global Error Handler
export const initGlobalErrorHandlers = () => {
    window.onerror = (msg) => {
        console.error('OS Error:', msg);
        return false;
    };
};

// Bind to window for global access
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.vibrate = vibrate;
}
