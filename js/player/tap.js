// ─── player/tap.js — Tap mode ─────────────────────────────────────────────────

import { db } from '../db.js';

let _tapView = null;

export function runTap(blocks, session, { onComplete, onExit }) {
    cleanup();

    const playerEl = document.getElementById('screen-player');
    document.querySelector('.center-line').style.display = 'none';
    const flowView = document.getElementById('player-view');
    flowView.style.cssText = 'height:0;overflow:hidden;';
    flowView.innerHTML = '';

    _tapView = document.createElement('div');
    _tapView.id = 'tap-view';
    playerEl.appendChild(_tapView);

    let blockIndex = session.current_block_index || 0;
    let count      = session.current_count      || 0;

    function render() {
        if (blockIndex >= blocks.length) {
            db.completeSession(session.id);
            _tapView.innerHTML = `
                <div class="complete-screen">
                    <p class="complete-icon">✓</p>
                    <p class="complete-label">Litany complete</p>
                    <button class="btn-play btn-done">Done</button>
                </div>`;
            _tapView.querySelector('.btn-done').addEventListener('click', () => {
                cleanup();
                onComplete();
            });
            return;
        }

        const item  = blocks[blockIndex];
        const block = item.adhkar_blocks;
        const total = item.user_count;
        const remaining = total - count;

        _tapView.innerHTML = `
            <p class="tap-progress">Block ${blockIndex + 1} of ${blocks.length}</p>
            <div class="arabic tap-arabic">${escHtml(block.arabic)}</div>
            ${block.translation ? `<p class="tap-translation">${escHtml(block.translation)}</p>` : ''}
            <div class="tap-counter" id="tap-count">${remaining}</div>
            <p class="tap-total">remaining of ${total}</p>
            <button class="btn-tap" id="btn-tap" aria-label="Tap"></button>
        `;

        document.getElementById('btn-tap').addEventListener('click', () => {
            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(10);

            count++;
            if (count >= total) {
                db.saveProgress(session.id, blockIndex, count);
                blockIndex++;
                count = 0;
                render();
            } else {
                document.getElementById('tap-count').textContent = total - count;
                db.saveProgress(session.id, blockIndex, count);
            }
        });
    }

    render();
}

export function cleanup() {
    const old = document.getElementById('tap-view');
    if (old) old.remove();
    _tapView = null;
    const flowView = document.getElementById('player-view');
    if (flowView) { flowView.style.cssText = ''; flowView.innerHTML = ''; }
    const centerLine = document.querySelector('.center-line');
    if (centerLine) centerLine.style.display = '';
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
