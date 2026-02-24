// ─── screens/home.js ──────────────────────────────────────────────────────────

import { db }                          from '../db.js';
import { setState, getState }          from '../state.js';
import { openNewLitanyModal, openConfirmDeleteModal, openManageBlocksModal } from '../ui/modals.js';
import { showToast }                   from '../ui/toast.js';
import { launchPlayer }                from '../player/index.js';

export const homeScreen = {
    load,
    bindStatic,
};

// ── Static bindings (run once at boot) ────────────────────────────────────────

function bindStatic() {
    document.getElementById('btn-new-litany').addEventListener('click', () => {
        openNewLitanyModal({ onCreated: load });
    });

    // Delegated events — roster list
    document.getElementById('roster-list').addEventListener('click', async e => {
        const editBtn = e.target.closest('.btn-edit-litany');
        if (editBtn) {
            const { id, name, schedule } = editBtn.dataset;
            openManageBlocksModal(id, name, schedule);
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
                } catch (_) { showToast('Could not delete litany.'); }
            });
            return;
        }

        // Mode selector buttons
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
        // Play button opens mode selector
        const playBtn = e.target.closest('.btn-play-litany');
        if (playBtn) {
            const { id, name } = playBtn.dataset;
            showModeSelector(id, name, playBtn);
        }
    });

    // Delegated events — today grid + in-progress section
    document.getElementById('resume-banner').addEventListener('click', async e => {
        // Today card: begin (flow/tap) buttons
        const todayFlow = e.target.closest('.btn-today-flow');
        if (todayFlow) {
            const { litanyId } = todayFlow.dataset;
            await startSession(litanyId, 'flow', true);
            return;
        }
        const todayTap = e.target.closest('.btn-today-tap');
        if (todayTap) {
            const { litanyId } = todayTap.dataset;
            await startSession(litanyId, 'tap', true);
            return;
        }

        // Today card / in-progress: continue button
        const continueBtn = e.target.closest('.btn-continue-session');
        if (continueBtn) {
            const { sessionId, litanyId, mode } = continueBtn.dataset;
            const { inProgressSessions } = getState();
            const sess = (inProgressSessions || []).find(s => s.id === sessionId);
            if (sess) {
                await launchPlayer(litanyId, mode, sess);
            }
            return;
        }

        // In-progress: dismiss button
        const dismissBtn = e.target.closest('.btn-dismiss-session');
        if (dismissBtn) {
            const { sessionId } = dismissBtn.dataset;
            try {
                await db.abandonSession(sessionId);
                showToast('Session dismissed');
                load();
            } catch (_) {}
        }
    });
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
    const banner  = document.getElementById('resume-banner');
    const rosterEl = document.getElementById('roster-list');

    banner.innerHTML  = '<p class="loading-text" style="padding:0"></p>';
    rosterEl.innerHTML = '<p class="loading-text">Loading…</p>';

    try {
        const [litanies, todaySessions, inProgress] = await Promise.all([
            db.getLitanies(),
            db.getTodaysSessions(),
            db.getInProgressSessions(),
        ]);

        setState({ litanies, inProgressSessions: inProgress });

        const timings = getState().timings;

        renderHub(banner, litanies, todaySessions, inProgress, timings);
        renderRoster(rosterEl, litanies);

    } catch (err) {
        banner.innerHTML  = '';
        rosterEl.innerHTML = '<p class="loading-text">Failed to load. Check connection.</p>';
    }
}

// ── Hub: Today + In-Progress ───────────────────────────────────────────────────

function renderHub(container, litanies, todaySessions, inProgress, timings) {
    const scheduledLitanies = litanies.filter(l => l.schedule && l.schedule !== '');

    // Determine current period
    const period = getCurrentPeriod(timings);

    // Build today cards for morning/evening periods
    const todayCards = buildTodayCards(scheduledLitanies, todaySessions, inProgress, period);

    // In-progress sessions NOT from today (stale sessions)
    const todayIds = new Set(todaySessions.map(s => s.id));
    const stale = inProgress.filter(s => !todayIds.has(s.id));

    let html = '';

    if (todayCards.length) {
        html += `<p class="section-label">Today's Practice</p>`;
        html += `<div class="today-grid">${todayCards.join('')}</div>`;
    }

    if (stale.length) {
        html += `<p class="section-label">In Progress</p>`;
        html += stale.map(s => renderInProgressCard(s)).join('');
    }

    container.innerHTML = html;
}

function getCurrentPeriod(timings) {
    if (!timings) return 'freestyle';
    const now   = new Date();
    const cur   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const fajr  = timings.Fajr?.substring(0,5)  || '05:00';
    const dhuhr = timings.Dhuhr?.substring(0,5) || '12:00';
    const asr   = timings.Asr?.substring(0,5)   || '15:30';
    if (cur >= fajr && cur < dhuhr)  return 'morning';
    if (cur >= asr  || cur < fajr)   return 'evening';
    return 'freestyle';
}

function buildTodayCards(scheduledLitanies, todaySessions, inProgress, period) {
    const cards = [];

    // Gather distinct periods we need to show
    const periods = new Set();
    scheduledLitanies.forEach(l => {
        if (l.schedule === 'morning' || l.schedule === 'both') periods.add('morning');
        if (l.schedule === 'evening' || l.schedule === 'both') periods.add('evening');
    });
    if (!periods.size) return cards;

    for (const p of ['morning', 'evening']) {
        if (!periods.has(p)) continue;

        const lits = scheduledLitanies.filter(l => l.schedule === p || l.schedule === 'both');

        // Find completed session for this period today
        const done = todaySessions.find(s =>
            s.is_completed && s.session_type === p &&
            lits.some(l => l.id === s.litany_id)
        );

        // Find in-progress session for this period
        const ongoing = inProgress.find(s =>
            !s.is_completed && lits.some(l => l.id === s.litany_id)
        );

        // Pick a representative litany (ongoing one, or first in list)
        const lit = ongoing
            ? lits.find(l => l.id === ongoing.litany_id) || lits[0]
            : lits[0];

        const isCurrentPeriod = period === p;
        const label = p === 'morning' ? 'Morning' : 'Evening';

        if (done) {
            // Completed ✓
            const t = fmtTime(done.last_active || done.start_time);
            cards.push(`
                <div class="today-card today-card-${p} is-done" aria-label="${label} wird complete">
                    <p class="today-period-label">${label}</p>
                    <div class="today-checkmark" aria-hidden="true">${p === 'morning' ? '☀' : '◑'}</div>
                    <p class="today-done-litany">${esc(lit?.name || '')}</p>
                    <p class="today-done-time">Completed ${t}</p>
                </div>`);
        } else if (ongoing) {
            // Continue
            const blockIdx = (ongoing.current_block_index || 0) + 1;
            const blocks   = ongoing.litanies?.litany_structure?.[0]?.count ?? '?';
            cards.push(`
                <div class="today-card today-card-${p} is-ongoing ${isCurrentPeriod ? 'is-current' : ''}" aria-label="${label} wird in progress">
                    <p class="today-period-label">${label}</p>
                    <p class="today-card-litany">${esc(lit.name)}</p>
                    <p class="today-card-meta">Block ${blockIdx} • ${capitalize(ongoing.mode)}</p>
                    <button class="btn-continue-session btn-today-cta"
                        data-session-id="${esc(ongoing.id)}"
                        data-litany-id="${esc(ongoing.litany_id)}"
                        data-mode="${esc(ongoing.mode)}">Continue</button>
                </div>`);
        } else {
            // Begin
            cards.push(`
                <div class="today-card today-card-${p} is-new ${isCurrentPeriod ? 'is-current' : ''}" aria-label="Begin ${label} wird">
                    <p class="today-period-label">${label}</p>
                    <p class="today-card-litany">${esc(lit.name)}</p>
                    <p class="today-card-meta">${lit.litany_structure?.[0]?.count ?? 0} blocks</p>
                    <div class="today-mode-row">
                        <button class="btn-today-flow btn-today-mode"
                            data-litany-id="${esc(lit.id)}">Flow</button>
                        <button class="btn-today-tap btn-today-mode"
                            data-litany-id="${esc(lit.id)}">Tap</button>
                    </div>
                </div>`);
        }
    }
    return cards;
}

function renderInProgressCard(sess) {
    const litName  = sess.litanies?.name || 'Litany';
    const blockIdx = (sess.current_block_index || 0) + 1;
    const ago      = timeAgo(sess.last_active || sess.start_time);
    return `
        <div class="inprogress-card">
            <div class="inprogress-info">
                <p class="inprogress-name">${esc(litName)}</p>
                <p class="inprogress-meta">Block ${blockIdx} • ${capitalize(sess.mode)} • ${ago}</p>
            </div>
            <div class="inprogress-actions">
                <button class="btn-continue-session btn-play btn-sm"
                    data-session-id="${esc(sess.id)}"
                    data-litany-id="${esc(sess.litany_id)}"
                    data-mode="${esc(sess.mode)}">Continue</button>
                <button class="btn-dismiss-session btn-secondary-sm btn-sm"
                    data-session-id="${esc(sess.id)}">Dismiss</button>
            </div>
        </div>`;
}

// ── Roster: My Litanies ────────────────────────────────────────────────────────

function renderRoster(el, litanies) {
    if (!litanies.length) {
        el.innerHTML = '<p class="loading-text">No litanies yet. Tap "+ New" or add from Explore.</p>';
        return;
    }

    const SCHEDULE_LABEL = { morning: 'Morning', evening: 'Evening', both: 'Morning & Evening' };

    el.innerHTML = litanies.map(lit => {
        const count = lit.litany_structure?.[0]?.count ?? 0;
        const sub = count ? `${count} block${count !== 1 ? 's' : ''}` : 'Empty — add blocks from Explore';
        const schedTag = lit.schedule
            ? `<span class="schedule-tag schedule-tag-${lit.schedule}">${SCHEDULE_LABEL[lit.schedule] || ''}</span>` : '';
        return `
        <div class="card">
            <div class="card-header-row">
                <div>
                    <div class="card-title-row">
                        <h2 class="card-title">${esc(lit.name)}</h2>
                        ${schedTag}
                    </div>
                    ${lit.description ? `<p class="card-desc">${esc(lit.description)}</p>` : ''}
                    <p class="card-sub">${sub}</p>
                </div>
                <button class="btn-delete-litany" data-id="${esc(lit.id)}" data-name="${esc(lit.name)}" aria-label="Delete">✕</button>
            </div>
            <div class="card-actions">
                <button class="btn-play btn-play-litany" data-id="${esc(lit.id)}" data-name="${esc(lit.name)}">Play</button>
                <button class="btn-edit btn-edit-litany" data-id="${esc(lit.id)}" data-name="${esc(lit.name)}" data-schedule="${esc(lit.schedule || '')}">Edit</button>
            </div>
            <div class="mode-selector" id="mode-selector-${esc(lit.id)}" style="display:none">
                <button class="btn-mode btn-mode-flow" data-litany-id="${esc(lit.id)}">Flow</button>
                <button class="btn-mode btn-mode-tap" data-litany-id="${esc(lit.id)}">Tap</button>
            </div>
        </div>`;
    }).join('');
}

// ── Inline mode selector ──────────────────────────────────────────────────────

let _activeSelectorId = null;

function showModeSelector(litanyId) {
    if (_activeSelectorId === litanyId) { closeModeSelector(); return; }
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

async function startSession(litanyId, mode, fromScheduled) {
    try {
        const existing = await db.getActiveSession(litanyId);
        if (existing) await db.abandonSession(existing.id);

        // Determine session_type based on current period
        let sessionType = 'freestyle';
        if (fromScheduled) {
            const timings = getState().timings;
            sessionType = getCurrentPeriod(timings);
        }

        const session = await db.createSession(litanyId, mode, null, sessionType);
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

function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
