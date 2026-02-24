// ─── player/flow.js — Flow mode ───────────────────────────────────────────────

import { db } from '../db.js';

let _observer = null;

export function runFlow(blocks, session, { onComplete, onExit }) {
    cleanup();

    const view = document.getElementById('player-view');
    const centerLine = document.querySelector('.center-line');

    centerLine.style.display = '';
    view.style.cssText = 'height:100vh;overflow-y:scroll;';
    view.innerHTML = '';

    blocks.forEach((item, bIdx) => {
        const block = item.adhkar_blocks;
        for (let i = 1; i <= item.user_count; i++) {
            const row = document.createElement('div');
            row.className = 'dhikr-row';
            row.dataset.idx = bIdx;
            row.dataset.cnt = i;

            // Restore scroll position: mark already-seen rows
            if (bIdx < (session.current_block_index || 0) ||
               (bIdx === session.current_block_index && i <= (session.current_count || 0))) {
                row.classList.add('seen');
            }

            row.innerHTML = `
                <div class="arabic">${escHtml(block.arabic)}</div>
                ${block.translation ? `<p class="dhikr-translation">${escHtml(block.translation)}</p>` : ''}
                <div class="dhikr-counter">${i} / ${item.user_count}</div>
            `;
            view.appendChild(row);
        }
    });

    // Add completion sentinel row
    const doneRow = document.createElement('div');
    doneRow.className = 'dhikr-row dhikr-done-row';
    doneRow.innerHTML = `
        <p class="complete-icon">✓</p>
        <p class="complete-label">Litany complete</p>
        <button class="btn-play btn-done" id="btn-flow-done">Done</button>
    `;
    view.appendChild(doneRow);

    // Bind done button
    doneRow.querySelector('#btn-flow-done').addEventListener('click', () => {
        cleanup();
        onComplete();
    });

    // Scroll to resume position
    if (session.current_block_index || session.current_count) {
        const resumeRow = view.querySelector(
            `.dhikr-row[data-idx="${session.current_block_index}"][data-cnt="${session.current_count || 1}"]`
        );
        if (resumeRow) {
            requestAnimationFrame(() => resumeRow.scrollIntoView({ behavior: 'instant', block: 'center' }));
        }
    }

    const debouncedSave = debounce((sessionId, bIdx, cnt) => {
        db.saveProgress(sessionId, bIdx, cnt);
    }, 400);

    _observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            e.target.classList.toggle('active', e.isIntersecting);
            if (e.isIntersecting && !e.target.classList.contains('dhikr-done-row')) {
                debouncedSave(session.id, e.target.dataset.idx, e.target.dataset.cnt);
            }
            if (e.isIntersecting && e.target.classList.contains('dhikr-done-row')) {
                db.completeSession(session.id);
                onComplete();
            }
        });
    }, { threshold: 0.6 });

    view.querySelectorAll('.dhikr-row').forEach(r => _observer.observe(r));
}

export function cleanup() {
    if (_observer) { _observer.disconnect(); _observer = null; }
    const view = document.getElementById('player-view');
    if (view) { view.style.cssText = ''; view.innerHTML = ''; }
    const centerLine = document.querySelector('.center-line');
    if (centerLine) centerLine.style.display = '';
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
