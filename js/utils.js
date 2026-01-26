// ════════════════════════════════════════════════════════════════
// ROBERT OS - UTILS.JS v1.7.5 (SYSTEM TOOLS)
// ════════════════════════════════════════════════════════════════

export function initGlobalErrorHandlers() {
    window.onunhandledrejection = (event) => {
        showToast('Asinchroninė klaida: ' + (event.reason?.message || 'Nežinoma'), 'error');
    };
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-teal-500 text-black',
        error: 'bg-red-600 text-white',
        warning: 'bg-yellow-500 text-black',
        info: 'bg-white/10 text-white'
    };

    toast.className = `${colors[type]} p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl animate-slideUp pointer-events-auto border border-white/10 italic`;
    toast.innerHTML = message;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}
