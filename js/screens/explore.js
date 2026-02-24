// ─── screens/explore.js ───────────────────────────────────────────────────────

import { db } from '../db.js';
import { openAddBlockModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';
import { launchPlayer } from '../player/index.js';
import { showScreen } from '../router.js';

let _loaded = false;

export const exploreScreen = {
    load,
    bindStatic,
};

function bindStatic() {
    document.getElementById('explore-list').addEventListener('click', async e => {
        // Add individual block
        const addBlock = e.target.closest('.btn-add-block');
        if (addBlock) {
            const { blockId, blockTitle } = addBlock.dataset;
            await openAddBlockModal(blockId, blockTitle);
            return;
        }

        // Clone preset litany
        const cloneBtn = e.target.closest('.btn-clone-preset');
        if (cloneBtn) {
            const { presetId, presetName } = cloneBtn.dataset;
            const name = window.prompt('Add to My Litanies as:', presetName);
            if (!name) return;
            try {
                await db.clonePreset(presetId, name.trim());
                showToast(`"${name.trim()}" added to My Litanies`);
            } catch (_) {
                showToast('Could not add litany.');
            }
            return;
        }

        // Play preset litany
        const playPreset = e.target.closest('.btn-play-preset');
        if (playPreset) {
            const { presetId } = playPreset.dataset;
            showModeSelector(presetId, playPreset);
            return;
        }

        // Inline mode picker for presets
        const flowBtn = e.target.closest('.btn-preset-flow');
        if (flowBtn) {
            const { presetId } = flowBtn.dataset;
            closeModeSelector();
            await startPresetSession(presetId, 'flow');
            return;
        }

        const tapBtn = e.target.closest('.btn-preset-tap');
        if (tapBtn) {
            const { presetId } = tapBtn.dataset;
            closeModeSelector();
            await startPresetSession(presetId, 'tap');
            return;
        }
    });
}

async function load() {
    const list = document.getElementById('explore-list');
    list.innerHTML = '<p class="loading-text">Loading…</p>';

    try {
        const [presets, blocks] = await Promise.all([
            db.getPresets(),
            db.getAllBlocks(),
        ]);

        let html = '';

        if (presets.length) {
            html += `<p class="section-label">Curated Litanies</p>`;
            html += presets.map(lit => {
                const count = lit.litany_structure?.[0]?.count ?? 0;
                return `
                <div class="card featured-litany-card">
                    <div class="shop-card-row">
                        <div style="flex:1">
                            <h3 class="shop-item-title">${esc(lit.name)}</h3>
                            ${lit.description ? `<p class="shop-translit">${esc(lit.description)}</p>` : ''}
                            <p class="card-sub" style="margin:4px 0 6px">${count} block${count !== 1 ? 's' : ''}</p>
                        </div>
                        <div class="featured-actions">
                            <button class="btn-add-shop btn-clone-preset"
                                data-preset-id="${esc(lit.id)}"
                                data-preset-name="${esc(lit.name)}">+ Add</button>
                            <button class="btn-add-shop btn-play-preset"
                                data-preset-id="${esc(lit.id)}">Play</button>
                        </div>
                    </div>
                    <div class="mode-selector preset-mode-selector" id="preset-mode-${esc(lit.id)}" style="display:none">
                        <button class="btn-mode btn-preset-flow" data-preset-id="${esc(lit.id)}">Flow</button>
                        <button class="btn-mode btn-preset-tap"  data-preset-id="${esc(lit.id)}">Tap</button>
                    </div>
                </div>`;
            }).join('');
        }

        if (blocks.length) {
            const grouped = {};
            blocks.forEach(b => {
                const cat = b.category || 'Dhikr';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(b);
            });

            html += Object.entries(grouped).map(([cat, items]) => `
                <div class="shop-category">
                    <p class="section-label">${esc(cat)}</p>
                    ${items.map(item => `
                    <div class="card shop-card">
                        <div class="shop-card-row">
                            <h3 class="shop-item-title">${esc(item.title)}</h3>
                            <button class="btn-add-shop btn-add-block"
                                data-block-id="${esc(item.id)}"
                                data-block-title="${esc(item.title)}">+ Add</button>
                        </div>
                        <div class="arabic shop-arabic">${item.arabic}</div>
                        ${item.transliteration ? `<p class="shop-translit">${esc(item.transliteration)}</p>` : ''}
                        ${item.translation ? `<p class="shop-translation">${esc(item.translation)}</p>` : ''}
                    </div>`).join('')}
                </div>
            `).join('');
        }

        list.innerHTML = html || '<p class="loading-text">Nothing here yet.</p>';

    } catch (_) {
        list.innerHTML = '<p class="loading-text">Failed to load. Check connection.</p>';
    }
}

// ── Inline mode selector for presets ─────────────────────────────────────────

let _activeSelectorId = null;

function showModeSelector(presetId) {
    if (_activeSelectorId === presetId) {
        closeModeSelector();
        return;
    }
    closeModeSelector();
    _activeSelectorId = presetId;
    const sel = document.getElementById(`preset-mode-${presetId}`);
    if (sel) sel.style.display = 'flex';
}

function closeModeSelector() {
    if (_activeSelectorId) {
        const sel = document.getElementById(`preset-mode-${_activeSelectorId}`);
        if (sel) sel.style.display = 'none';
    }
    _activeSelectorId = null;
}

async function startPresetSession(litanyId, mode) {
    try {
        const existing = await db.getActiveSession(litanyId);
        if (existing) await db.abandonSession(existing.id);
        const session = await db.createSession(litanyId, mode);
        await launchPlayer(litanyId, mode, session);
    } catch (_) {
        showToast('Could not start session. Try again.');
    }
}

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
