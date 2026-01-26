// Haptic Feedback
export const vibrate = (pattern = [10]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
};

// Toast Notification
export const showToast = (msg, type = 'info') => {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500' : 'bg-teal-500';
    
    t.className = `${color} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp`;
    t.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'triangle-exclamation' : 'check'}"></i> <span>${msg}</span>`;
    
    c.appendChild(t);
    vibrate(type === 'error' ? [50, 50, 50] : [20]);
    
    setTimeout(() => t.remove(), 3000);
};
