// ─── screens/history.js ───────────────────────────────────────────────────────

import { db } from '../db.js';
import { launchPlayer } from '../player/index.js';
import { showToast } from '../ui/toast.js';

export const historyScreen = {
    load,
    bindStatic,
};

function bindStatic() {
    document.getElementById('history-list').addEventListener('click', async e => {
        const resumeBtn = e.target.closest('.btn-resume-history');
        if (!resumeBtn) return;
        const { sessionId, litanyId, mode } = resumeBtn.dataset;
        try {
            // Re-fetch the session row
            const sessions = await db.getAllSessions();
            const session  = sessions.find(s => s.id === sessionId);
            if (!session) { showToast('Session not found.'); return; }
            await launchPlayer(litanyId, mode, session);
        } catch (_) {
            showToast('Could not resume session.');
        }
    });
}

async function load() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<p class="loading-text">Loading…</p>';

    try {
        const sessions = await db.getAllSessions();

        if (!sessions.length) {
            list.innerHTML = '<p class="loading-text">No sessions yet. Play a litany to get started.</p>';
            return;
        }

        const inProgress = sessions.filter(s => !s.is_completed);
        const completed  = sessions.filter(s =>  s.is_completed);

        let html = '';

        if (inProgress.length) {
            html += `<p class="section-label">In Progress</p>`;
            html += inProgress.map(s => renderInProgress(s)).join('');
        }

        if (completed.length) {
            html += `<p class="section-label" style="margin-top:24px">Completed</p>`;
            html += completed.map(s => renderCompleted(s)).join('');
        }

        list.innerHTML = html;

    } catch (_) {
        list.innerHTML = '<p class="loading-text">Failed to load. Check connection.</p>';
    }
}

function renderInProgress(s) {
    const litName  = s.litanies?.name || 'Litany';
    const blockIdx = (s.current_block_index || 0) + 1;
    const mode     = s.mode || 'tap';
    const when     = timeAgo(s.start_time);

    return `
    <div class="card history-card">
        <p class="history-litany-name">${esc(litName)}</p>
        <p class="history-meta">Block ${blockIdx} • ${capitalize(mode)} • ${when}</p>
        <button class="btn-play btn-resume-history"
            data-session-id="${esc(s.id)}"
            data-litany-id="${esc(s.litany_id)}"
            data-mode="${esc(mode)}"
            style="margin-top:12px">Resume</button>
    </div>`;
}

function renderCompleted(s) {
    const litName = s.litanies?.name || 'Litany';
    const when    = formatDate(s.start_time);
    const reps    = (s.current_count || 0);
    const mode    = s.mode || 'tap';

    let duration = '';
    if (s.start_time && s.last_active) {
        const ms = new Date(s.last_active) - new Date(s.start_time);
        if (ms > 0) duration = ` • ${formatDuration(ms)}`;
    }

    return `
    <div class="card history-card history-card-complete">
        <p class="history-litany-name">${esc(litName)}</p>
        <p class="history-meta">${capitalize(mode)}${duration} • ${when}</p>
    </div>`;
}

// ── Utils ──────────────────────────────────────────────────────────────────────

function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${String(s).padStart(2,'0')}s`;
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
