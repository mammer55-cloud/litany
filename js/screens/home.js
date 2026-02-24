// ─── screens/home.js ──────────────────────────────────────────────────────────

import { db } from '../db.js';
import { setState, getState } from '../state.js';
import { openNewLitanyModal, openConfirmDeleteModal, openManageBlocksModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';
import { launchPlayer } from '../player/index.js';

export const homeScreen = {
    load,
    bindStatic,
};

function bindStatic() {
    document.getElementById('btn-new-litany').addEventListener('click', () => {
        openNewLitanyModal({ onCreated: load });
    });

    // Delegated events on roster list
    document.getElementById('roster-list').addEventListener('click', async e => {
        const playBtn = e.target.closest('.btn-play-litany');
        if (playBtn) {
            const { id, name } = playBtn.dataset;
            showModeSelector(id, name, playBtn);
            return;
        }

        const editBtn = e.target.closest('.btn-edit-litany');
        if (editBtn) {
            const { id, name } = editBtn.dataset;
            openManageBlocksModal(id, name);
            return;
        }

        const deleteBtn = e.target.closest('.btn-delete-litany');
        if (deleteBtn) {
            const { id, name } = deleteBtn.dataset;
            openConfirmDeleteModal(name, async () => {
                try {
                    await db.deleteLitany(id);
                    showToast(`"${name}" deleted`);
                    load();
                } catch (_) {
                    showToast('Could not delete litany.');
                }
            });
            return;
        }

        // Mode selector buttons (rendered inline)
        const flowBtn = e.target.closest('.btn-mode-flow');
        if (flowBtn) {
            const { litanyId } = flowBtn.dataset;
            closeModeSelector();
            await startSession(litanyId, 'flow');
            return;
        }

        const tapBtn = e.target.closest('.btn-mode-tap');
        if (tapBtn) {
            const { litanyId } = tapBtn.dataset;
            closeModeSelector();
            await startSession(litanyId, 'tap');
            return;
        }
    });

    // Resume banner buttons (delegated on banner container)
    document.getElementById('resume-banner').addEventListener('click', async e => {
        if (e.target.closest('#btn-resume-session')) {
            const state = getState();
            if (state.activeSession) {
                await launchPlayer(state.activeSession.litany_id, state.activeSession.mode, state.activeSession);
            }
            return;
        }
        if (e.target.closest('#btn-dismiss-session')) {
            const state = getState();
            if (state.activeSession) {
                try {
                    await db.abandonSession(state.activeSession.id);
                    setState({ activeSession: null });
                    renderResumeBanner(null);
                } catch (_) {}
            }
        }
    });
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
    const list = document.getElementById('roster-list');
    list.innerHTML = '<p class="loading-text">Loading…</p>';

    try {
        const litanies = await db.getLitanies();
        setState({ litanies });

        // Check for any active (incomplete) session across all litanies
        let activeSession = null;
        for (const lit of litanies) {
            const sess = await db.getActiveSession(lit.id);
            if (sess) { activeSession = { ...sess, _litanyName: lit.name }; break; }
        }
        setState({ activeSession });
        renderResumeBanner(activeSession, litanies);

        if (!litanies.length) {
            list.innerHTML = '<p class="loading-text">No litanies yet. Tap "+ New" or add from Explore.</p>';
            return;
        }

        list.innerHTML = litanies.map(lit => {
            const count = lit.litany_structure?.[0]?.count ?? 0;
            const sub = count ? `${count} block${count !== 1 ? 's' : ''}` : 'Empty — add blocks from Explore';
            return `
            <div class="card">
                <div class="card-header-row">
                    <div>
                        <h2 class="card-title">${esc(lit.name)}</h2>
                        ${lit.description ? `<p class="card-desc">${esc(lit.description)}</p>` : ''}
                        <p class="card-sub">${sub}</p>
                    </div>
                    <button class="btn-delete-litany" data-id="${esc(lit.id)}" data-name="${esc(lit.name)}" aria-label="Delete">✕</button>
                </div>
                <div class="card-actions">
                    <button class="btn-play btn-play-litany" data-id="${esc(lit.id)}" data-name="${esc(lit.name)}">Play</button>
                    <button class="btn-edit btn-edit-litany" data-id="${esc(lit.id)}" data-name="${esc(lit.name)}">Edit</button>
                </div>
                <div class="mode-selector" id="mode-selector-${esc(lit.id)}" style="display:none">
                    <button class="btn-mode btn-mode-flow" data-litany-id="${esc(lit.id)}">Flow</button>
                    <button class="btn-mode btn-mode-tap" data-litany-id="${esc(lit.id)}">Tap</button>
                </div>
            </div>`;
        }).join('');

    } catch (_) {
        list.innerHTML = '<p class="loading-text">Failed to load. Check connection.</p>';
    }
}

// ── Resume Banner ─────────────────────────────────────────────────────────────

function renderResumeBanner(session, litanies) {
    const banner = document.getElementById('resume-banner');
    if (!session) { banner.innerHTML = ''; return; }

    const litName = session._litanyName || 'Litany';
    const blockIdx = (session.current_block_index || 0) + 1;
    const mode = session.mode || 'tap';

    banner.innerHTML = `
        <div class="resume-card">
            <p class="resume-label">Resume</p>
            <p class="resume-litany-name">${esc(litName)}</p>
            <p class="resume-meta">Block ${blockIdx} • ${capitalize(mode)}</p>
            <div class="resume-actions">
                <button class="btn-play btn-resume-continue" id="btn-resume-session">Continue</button>
                <button class="btn-secondary-sm" id="btn-dismiss-session">Dismiss</button>
            </div>
        </div>`;
}

// ── Inline mode selector ──────────────────────────────────────────────────────

let _activeSelectorId = null;

function showModeSelector(litanyId, litanyName, anchor) {
    // Toggle: if already open for same, close it
    if (_activeSelectorId === litanyId) {
        closeModeSelector();
        return;
    }
    closeModeSelector();
    _activeSelectorId = litanyId;
    const sel = document.getElementById(`mode-selector-${litanyId}`);
    if (sel) sel.style.display = 'flex';
}

function closeModeSelector() {
    if (_activeSelectorId) {
        const sel = document.getElementById(`mode-selector-${_activeSelectorId}`);
        if (sel) sel.style.display = 'none';
    }
    _activeSelectorId = null;
}

// ── Start Session ─────────────────────────────────────────────────────────────

async function startSession(litanyId, mode) {
    try {
        // Abandon any existing incomplete session for this litany
        const existing = await db.getActiveSession(litanyId);
        if (existing) await db.abandonSession(existing.id);

        const session = await db.createSession(litanyId, mode);
        setState({ activeSession: null });
        await launchPlayer(litanyId, mode, session);
    } catch (_) {
        showToast('Could not start session. Try again.');
    }
}

// ── Util ──────────────────────────────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
