// ─── router.js — Controls which screen is active ──────────────────────────────

import { setState, getState } from './state.js';

const NAV_SCREENS = ['home', 'explore', 'history'];

export function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${name}`);
    if (target) target.classList.add('active');

    // Update nav active state
    const nav = document.getElementById('main-nav');
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.screen === name);
    });

    // Show/hide nav (hidden during player)
    if (name === 'player') {
        nav.classList.add('hidden');
    } else {
        nav.classList.remove('hidden');
    }

    setState({ screen: name });
}

export function initRouter(screens) {
    document.getElementById('main-nav').addEventListener('click', e => {
        const btn = e.target.closest('.nav-btn');
        if (!btn) return;
        const name = btn.dataset.screen;
        if (!name) return;

        // Trigger screen load
        if (screens[name]?.load) screens[name].load();
        showScreen(name);
    });
}
