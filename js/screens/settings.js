// ─── screens/settings.js ──────────────────────────────────────────────────────

import { db }             from '../db.js';
import { previewGradient, resetGradient } from '../theme.js';
import { showToast }      from '../ui/toast.js';
import { showScreen }     from '../router.js';

export const settingsScreen = {
    load,
    bindStatic,
};

function bindStatic() {
    // Time preview
    document.getElementById('settings-time-input').addEventListener('input', e => {
        if (e.target.value) previewGradient(e.target.value);
    });

    document.getElementById('btn-reset-preview').addEventListener('click', () => {
        document.getElementById('settings-time-input').value = '';
        resetGradient();
    });

    // Clear all data
    document.getElementById('btn-clear-data').addEventListener('click', async () => {
        const confirmed = window.confirm(
            'This will permanently delete all your personal litanies and session history. Cannot be undone.'
        );
        if (!confirmed) return;
        try {
            await db.clearAllPersonalData();
            showToast('All data cleared');
            showScreen('home');
            // Reload home screen
            const { homeScreen } = await import('./home.js');
            homeScreen.load();
        } catch (_) {
            showToast('Could not clear data. Try again.');
        }
    });
}

function load() {
    // Set time input to current time as default
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('settings-time-input').value = `${hh}:${mm}`;
}
