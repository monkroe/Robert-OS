// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v2.0.0
// Purpose: Haptics + v1.8 Toast (glow) + XSS-safe helpers
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK
// ────────────────────────────────────────────────────────────────

export const vibrate = (pattern = [10]) => {
    try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) {}
};

// ────────────────────────────────────────────────────────────────
// XSS SAFE HELPERS
// ────────────────────────────────────────────────────────────────

export const escapeHtml = (val) => {
    const s = String(val ?? '');
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
};

// ────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS (v1.8 look + XSS-safe)
// ────────────────────────────────────────────────────────────────

const activeToasts = new Set();
const MAX_TOASTS = 3;

const TOAST = {
    classes: 'px-5 py-4 rounded-2xl flex items-center gap-3 text-sm font-black animate-slideUp pointer-events-auto',
    colorMap: {
        error: 'bg-red-500',
        success: 'bg-green-500',
        info: 'bg-teal-500',
        warning: 'bg-yellow-500'
    },
    iconMap: {
        info: 'fa-circle-info',
        success: 'fa-circle-check',
        warning: 'fa-triangle-exclamation',
        error: 'fa-triangle-exclamation'
    }
};

export const showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // cap
    if (activeToasts.size >= MAX_TOASTS) {
        const oldest = activeToasts.values().next().value;
        if (oldest) {
            try { oldest.remove(); } catch (_) {}
            activeToasts.delete(oldest);
        }
    }

    const toast = document.createElement('div');

    const t = (type || 'info').toLowerCase();
    const color = TOAST.colorMap[t] || TOAST.colorMap.info;
    const iconClass = TOAST.iconMap[t] || TOAST.iconMap.info;

    // NOTE: we keep classnames minimal; glow is handled in CSS (style.css patch you pasted)
    toast.className = `${color} ${TOAST.classes}`;

    // XSS-safe: no innerHTML with raw msg
    const icon = document.createElement('i');
    icon.className = `fa-solid ${iconClass} text-lg`;

    const text = document.createElement('span');
    text.textContent = String(msg ?? '');

    toast.appendChild(icon);
    toast.appendChild(text);

    container.appendChild(toast);
    activeToasts.add(toast);

    vibrate(t === 'error' ? [50, 50, 50] : [20]);

    // fade out
    const kill = () => {
        if (!toast.parentElement) return;
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => {
            try { toast.remove(); } catch (_) {}
            activeToasts.delete(toast);
        }, 220);
    };

    setTimeout(kill, 3000);

    // allow tap to dismiss (nice on mobile)
    toast.addEventListener('click', kill, { passive: true });
};

// ────────────────────────────────────────────────────────────────
// FORMATTERS
// ────────────────────────────────────────────────────────────────

export const formatCurrency = (amount) => {
    const n = Number(amount || 0);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
    }).format(n);
};

// ────────────────────────────────────────────────────────────────
// GLOBALS (for inline onclick HTML)
// ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.vibrate = vibrate;
    window.escapeHtml = escapeHtml;
}
