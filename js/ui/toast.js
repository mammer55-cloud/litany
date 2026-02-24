// ─── toast.js ─────────────────────────────────────────────────────────────────

let _timer = null;

export function showToast(msg) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(_timer);
    _timer = setTimeout(() => toast.classList.remove('show'), 2200);
}
