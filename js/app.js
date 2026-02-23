const client = supabase.createClient(SB_URL, SB_KEY);

let activeLitanyId    = null;
let activeSession     = null;
let selectedLabel     = 'Freestyle';
let flowObserver      = null;
let pendingBlockId    = null;
let pendingBlockTitle = null;
let allLitanies       = [];
let isManualLightMode = false;
let journeyTimerInterval = null;
let clonePresetContext = null;

const JOURNEY_STORAGE_KEY = 'litanyJourneyState';
const JOURNEY_PRESETS_KEY = 'litanyJourneyPresets';

let journeyState = {
    deadlineIso: '',
    isRunning: false,
    currentStepIndex: 0,
    startedAt: null,
    steps: [
        { name: 'Get dressed', minutes: 7 },
        { name: 'Drive to masjid', minutes: 7 },
        { name: 'Fajr sunnah', minutes: 7 }
    ]
};

// ─── BOOT ────────────────────────────────────────────────────────────────────

async function init() {
    updateSunGradient();
    loadRoster();
    bindStaticListeners();
    initThemeToggle();
    initJourneyPlanner();
}

// ─── THEME: SUN-SWEEP GRADIENT ───────────────────────────────────────────────

async function updateSunGradient() {
    if (!navigator.geolocation) {
        document.getElementById('prayer-status').innerText = 'Location unavailable';
        return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const res = await fetch(
                `https://api.aladhan.com/v1/timings?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&method=2`
            );
            if (!res.ok) throw new Error('Prayer times fetch failed');
            const { data } = await res.json();

            let cityName = '';
            try {
                const geo = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
                );
                const geoData = await geo.json();
                cityName = geoData.address?.city || geoData.address?.town
                    || geoData.address?.village || geoData.address?.county || '';
            } catch (_) {}

            const now = new Date();
            const h = now.getHours(), m = now.getMinutes();
            const cur = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;

            const isDay = cur >= data.timings.Fajr && cur < data.timings.Maghrib;
            if (!isManualLightMode) document.body.className = isDay ? 'mode-day' : 'mode-night';

            const hue = isDay ? 45 : 240;
            const lightness = isDay ? (95 - (h % 12)) : (5 + (h % 12));
            document.body.style.background =
                `radial-gradient(circle at top right, hsl(${hue}, 80%, ${lightness + 10}%), hsl(${hue}, 20%, ${lightness}%))`;

            const nextPrayer = isDay ? `Maghrib ${data.timings.Maghrib}` : `Fajr ${data.timings.Fajr}`;
            const location = cityName ? `${cityName} • ` : '';
            document.getElementById('prayer-status').innerText =
                `${location}${isDay ? 'Day Mode' : 'Night Mode'} • Next: ${nextPrayer}`;

        } catch (err) {
            document.getElementById('prayer-status').innerText = 'Could not fetch prayer times';
        }
    }, () => {
        document.getElementById('prayer-status').innerText = 'Location access denied';
    });
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const btn = document.getElementById('nav-' + id);
    if (btn) btn.classList.add('active');
    document.getElementById('main-nav').classList.remove('hidden');
    if (id === 'home') loadRoster();
    else if (id === 'shop') loadShop();
}

// ─── STATIC EVENT LISTENERS ──────────────────────────────────────────────────

function bindStaticListeners() {
    document.getElementById('nav-home').addEventListener('click', () => showPage('home'));
    document.getElementById('nav-shop').addEventListener('click', () => showPage('shop'));

    document.getElementById('btn-start-flow').addEventListener('click', () => createNewSession('flow'));
    document.getElementById('btn-start-tap').addEventListener('click',  () => createNewSession('tap'));
    document.getElementById('btn-cancel-intent').addEventListener('click', closeIntent);
    document.getElementById('btn-exit-player').addEventListener('click', exitPlayer);

    // Roster: event delegation for play + delete
    document.getElementById('roster-list').addEventListener('click', e => {
        const play = e.target.closest('.btn-open-litany');
        if (play) { openIntent(play.dataset.id, play.dataset.name); return; }
        const del = e.target.closest('.btn-delete-litany');
        if (del) deleteLitany(del.dataset.id, del.dataset.name);
    });

    // Intent chips
    document.getElementById('intent-options').addEventListener('click', e => {
        const chip = e.target.closest('.intent-chip');
        if (!chip) return;
        selectedLabel = chip.dataset.label;
        document.querySelectorAll('.intent-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    });

    // New intention: reveal time + save fields when user types label
    document.getElementById('new-intent-label').addEventListener('input', e => {
        const hasText = e.target.value.trim().length > 0;
        document.getElementById('new-intent-time').classList.toggle('hidden', !hasText);
        document.getElementById('btn-save-intent').classList.toggle('hidden', !hasText);
    });

    document.getElementById('btn-start-fresh').addEventListener('click', dismissAndStartFresh);

    document.getElementById('theme-toggle').addEventListener('click', toggleThemeMode);
    document.getElementById('btn-add-journey-step').addEventListener('click', addJourneyStep);
    document.getElementById('btn-start-journey').addEventListener('click', startJourney);
    document.getElementById('btn-next-step').addEventListener('click', advanceJourneyStep);
    document.getElementById('btn-reset-journey').addEventListener('click', resetJourney);
    document.getElementById('btn-load-journey-preset').addEventListener('click', loadSelectedJourneyPreset);
    document.getElementById('btn-save-journey-preset').addEventListener('click', saveCurrentJourneyPreset);
    document.getElementById('journey-deadline').addEventListener('change', onJourneyDeadlineChange);

    document.getElementById('btn-confirm-clone').addEventListener('click', confirmClonePreset);

    document.querySelectorAll('.bottom-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeBottomModal(overlay.id);
        });
    });
}

// ─── ROSTER — shows only personal (non-preset) litanies ──────────────────────

async function loadRoster() {
    const list = document.getElementById('roster-list');
    list.innerHTML = '<p class="loading-text">Loading…</p>';
    try {
        const { data, error } = await client
            .from('litanies')
            .select('id, name, description, litany_structure(count)')
            .eq('is_preset', false)
            .order('name');
        if (error) throw error;
        allLitanies = data || [];
        if (!data || data.length === 0) {
            list.innerHTML = '<p class="loading-text">No litanies yet. Create one above, or add from the Shop.</p>';
            return;
        }
        list.innerHTML = data.map(lit => {
            const count = lit.litany_structure?.[0]?.count ?? 0;
            const sub = count ? `${count} block${count !== 1 ? 's' : ''}` : 'Empty — add blocks from Shop';
            return `
            <div class="card">
                <div class="card-header-row">
                    <div>
                        <h2 class="card-title">${escapeHtml(lit.name)}</h2>
                        ${lit.description ? `<p class="card-desc">${escapeHtml(lit.description)}</p>` : ''}
                        <p class="card-sub">${sub}</p>
                    </div>
                    <button class="btn-delete-litany" data-id="${escapeHtml(lit.id)}" data-name="${escapeHtml(lit.name)}" aria-label="Delete">✕</button>
                </div>
                <button class="btn-play btn-open-litany" data-id="${escapeHtml(lit.id)}" data-name="${escapeHtml(lit.name)}">Play</button>
            </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = '<p class="loading-text">Failed to load. Check connection.</p>';
    }
}

// ─── DELETE LITANY ────────────────────────────────────────────────────────────

async function deleteLitany(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
        await client.from('litany_schedules').delete().eq('litany_id', id);
        await client.from('litany_sessions').delete().eq('litany_id', id);
        await client.from('litany_structure').delete().eq('litany_id', id);
        const { error } = await client.from('litanies').delete().eq('id', id);
        if (error) throw error;
        loadRoster();
    } catch (err) {
        alert('Could not delete litany.');
    }
}

// ─── NEW LITANY ───────────────────────────────────────────────────────────────

function openNewLitanyModal() {
    document.getElementById('new-litany-name').value = '';
    document.getElementById('new-litany-desc').value = '';
    openBottomModal('new-litany-modal');
    setTimeout(() => document.getElementById('new-litany-name').focus(), 150);
}

async function createLitany() {
    const name = document.getElementById('new-litany-name').value.trim();
    const desc = document.getElementById('new-litany-desc').value.trim();
    if (!name) { document.getElementById('new-litany-name').focus(); return; }
    const { error } = await client.from('litanies').insert({ name, description: desc || null, is_preset: false });
    if (error) { alert('Could not create litany.'); return; }
    closeBottomModal('new-litany-modal');
    loadRoster();
}

// ─── SHOP — shows preset litanies + individual adhkar blocks ─────────────────

async function loadShop() {
    const list = document.getElementById('shop-list');
    list.innerHTML = '<p class="loading-text">Loading…</p>';
    try {
        const [{ data: presets }, { data: blocks }] = await Promise.all([
            client.from('litanies')
                .select('id, name, description, litany_structure(count), litany_schedules(label, time_hint)')
                .eq('is_preset', true)
                .order('name'),
            client.from('adhkar_blocks').select('*').order('category').order('title')
        ]);

        let html = '';

        // ── Preset / curated litanies ──
        if (presets && presets.length > 0) {
            html += `<p class="shop-cat-label">Curated Litanies</p>`;
            html += presets.map(lit => {
                const count = lit.litany_structure?.[0]?.count ?? 0;
                const pills = (lit.litany_schedules || []).map(s =>
                    `<span class="schedule-pill">${escapeHtml(s.label)}${s.time_hint ? ` · ${escapeHtml(s.time_hint)}` : ''}</span>`
                ).join('');
                return `
                <div class="card featured-litany-card">
                    <div class="shop-card-row">
                        <div style="flex:1">
                            <h3 class="shop-item-title">${escapeHtml(lit.name)}</h3>
                            ${lit.description ? `<p class="shop-translit">${escapeHtml(lit.description)}</p>` : ''}
                            <p class="card-sub" style="margin:4px 0 6px">${count} block${count !== 1 ? 's' : ''}</p>
                            ${pills ? `<div class="schedule-pills">${pills}</div>` : ''}
                        </div>
                        <div class="featured-actions">
                            <button class="btn-play btn-featured-play btn-clone-preset"
                                data-id="${escapeHtml(lit.id)}"
                                data-name="${escapeHtml(lit.name)}">+ Add</button>
                            <button class="btn-add-shop btn-play-preset"
                                data-id="${escapeHtml(lit.id)}"
                                data-name="${escapeHtml(lit.name)}">Play</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        // ── Individual adhkar blocks ──
        if (blocks && blocks.length > 0) {
            const grouped = {};
            blocks.forEach(item => {
                const cat = item.category || 'Dhikr';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(item);
            });

            html += Object.entries(grouped).map(([cat, items]) => `
                <div class="shop-category">
                    <p class="shop-cat-label">${escapeHtml(cat)}</p>
                    ${items.map(item => `
                    <div class="card shop-card">
                        <div class="shop-card-row">
                            <h3 class="shop-item-title">${escapeHtml(item.title)}</h3>
                            <button class="btn-add-shop" onclick="openAddModal('${escapeHtml(item.id)}', '${escapeHtml(item.title).replace(/'/g,"\\'")}')">+ Add</button>
                        </div>
                        <div class="arabic shop-arabic">${item.arabic}</div>
                        ${item.transliteration ? `<p class="shop-translit">${escapeHtml(item.transliteration)}</p>` : ''}
                        ${item.translation ? `<p class="shop-translation">${escapeHtml(item.translation)}</p>` : ''}
                    </div>`).join('')}
                </div>
            `).join('');
        }

        list.innerHTML = html || '<p class="loading-text">Nothing here yet.</p>';

        // Wire preset buttons after render
        list.querySelectorAll('.btn-clone-preset').forEach(btn => {
            btn.addEventListener('click', () => clonePresetToMyLitanies(btn.dataset.id, btn.dataset.name));
        });
        list.querySelectorAll('.btn-play-preset').forEach(btn => {
            btn.addEventListener('click', () => openIntent(btn.dataset.id, btn.dataset.name));
        });

    } catch (err) {
        list.innerHTML = '<p class="loading-text">Failed to load. Check connection.</p>';
    }
}

// Clone a curated litany into the user's personal collection
function clonePresetToMyLitanies(presetId, presetName) {
    clonePresetContext = { presetId, presetName };
    document.getElementById('clone-litany-name').value = presetName;
    openBottomModal('clone-preset-modal');
    setTimeout(() => document.getElementById('clone-litany-name').focus(), 100);
}

async function confirmClonePreset() {
    if (!clonePresetContext) return;

    const name = document.getElementById('clone-litany-name').value.trim();
    if (!name) {
        showToast('Please enter a name first');
        return;
    }

    const { presetId } = clonePresetContext;

    const { data: newLit, error: litErr } = await client
        .from('litanies').insert({ name, is_preset: false }).select().single();
    if (litErr) { showToast('Could not add litany'); return; }

    const { data: structure } = await client
        .from('litany_structure').select('block_id, order_index, user_count')
        .eq('litany_id', presetId);

    if (structure && structure.length > 0) {
        await client.from('litany_structure').insert(
            structure.map(s => ({
                litany_id:   newLit.id,
                block_id:    s.block_id,
                order_index: s.order_index,
                user_count:  s.user_count
            }))
        );
    }

    closeBottomModal('clone-preset-modal');
    clonePresetContext = null;
    showToast(`"${name}" added to My Litanies`);
    showPage('home');
}

// ─── ADD INDIVIDUAL BLOCK TO LITANY ──────────────────────────────────────────

async function openAddModal(blockId, blockTitle) {
    pendingBlockId    = blockId;
    pendingBlockTitle = blockTitle;

    const { data } = await client.from('litanies').select('id, name').eq('is_preset', false).order('name');
    allLitanies = data || [];

    const select = document.getElementById('add-litany-select');
    select.innerHTML = allLitanies.length
        ? allLitanies.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('')
        : '<option disabled selected>No personal litanies — create one on Home first</option>';

    document.getElementById('add-modal-title').innerText = `Add "${blockTitle}"`;
    document.getElementById('add-count').value = '33';
    openBottomModal('add-modal');
}

async function confirmAddToLitany() {
    const litanyId = document.getElementById('add-litany-select').value;
    const count    = parseInt(document.getElementById('add-count').value, 10);
    if (!litanyId || !count || count < 1) return;

    const { data: existing } = await client
        .from('litany_structure').select('order_index')
        .eq('litany_id', litanyId)
        .order('order_index', { ascending: false }).limit(1);

    const nextIdx = existing?.length && existing[0].order_index != null
        ? existing[0].order_index + 1 : 1;

    const { error } = await client.from('litany_structure').insert({
        litany_id: litanyId, block_id: pendingBlockId,
        order_index: nextIdx, user_count: count
    });
    if (error) { alert('Failed to add.'); return; }

    closeBottomModal('add-modal');
    showToast(`Added to "${allLitanies.find(l => l.id === litanyId)?.name || 'litany'}"`);
}

// ─── BOTTOM MODAL HELPERS ─────────────────────────────────────────────────────

function openBottomModal(id)  { document.getElementById(id).classList.add('show'); }
function closeBottomModal(id) { document.getElementById(id).classList.remove('show'); }

// ─── INTENT MODAL ────────────────────────────────────────────────────────────

async function openIntent(id, name) {
    activeLitanyId = id;
    selectedLabel  = 'Freestyle';

    document.getElementById('new-intent-label').value = '';
    document.getElementById('new-intent-time').value  = '';
    document.getElementById('new-intent-time').classList.add('hidden');
    document.getElementById('btn-save-intent').classList.add('hidden');

    document.getElementById('intent-title').innerText = name;
    document.getElementById('intent-modal').style.display = 'flex';

    try {
        const { data: sess } = await client
            .from('litany_sessions').select('*')
            .eq('litany_id', id).eq('is_completed', false).maybeSingle();
        const resumeDiv = document.getElementById('resume-section');
        if (sess) {
            resumeDiv.style.display = 'block';
            activeSession = sess;
            document.getElementById('btn-resume').onclick = () => launchSession(sess);
        } else {
            resumeDiv.style.display = 'none';
            activeSession = null;
        }
    } catch (err) {}

    try {
        const { data: sch } = await client
            .from('litany_schedules').select('*').eq('litany_id', id);
        const grid = document.getElementById('intent-options');
        const chips = (sch || []).map(s =>
            `<div class="intent-chip" data-label="${escapeHtml(s.label)}">
                ${escapeHtml(s.label)}
                ${s.time_hint ? `<br><small>${escapeHtml(s.time_hint)}</small>` : ''}
             </div>`
        );
        chips.push(`<div class="intent-chip" data-label="Freestyle">Freestyle<br><small>Anytime</small></div>`);
        grid.innerHTML = chips.join('');
    } catch (err) {}
}

function closeIntent() {
    document.getElementById('intent-modal').style.display = 'none';
}

// ─── ADD NEW INTENTION ────────────────────────────────────────────────────────

async function saveNewIntention() {
    const label    = document.getElementById('new-intent-label').value.trim();
    const timeHint = document.getElementById('new-intent-time').value.trim();
    if (!label || !activeLitanyId) return;

    const { error } = await client.from('litany_schedules').insert({
        litany_id: activeLitanyId, label, time_hint: timeHint || null
    });
    if (error) { alert('Could not save intention.'); return; }

    document.getElementById('new-intent-label').value = '';
    document.getElementById('new-intent-time').value  = '';
    document.getElementById('new-intent-time').classList.add('hidden');
    document.getElementById('btn-save-intent').classList.add('hidden');

    const { data: sch } = await client.from('litany_schedules').select('*').eq('litany_id', activeLitanyId);
    const chips = (sch || []).map(s =>
        `<div class="intent-chip" data-label="${escapeHtml(s.label)}">
            ${escapeHtml(s.label)}
            ${s.time_hint ? `<br><small>${escapeHtml(s.time_hint)}</small>` : ''}
         </div>`
    );
    chips.push(`<div class="intent-chip" data-label="Freestyle">Freestyle<br><small>Anytime</small></div>`);
    document.getElementById('intent-options').innerHTML = chips.join('');
    showToast(`Intention "${label}" saved`);
}

// ─── DISMISS SESSION & START FRESH ───────────────────────────────────────────

async function dismissAndStartFresh() {
    if (activeSession) {
        await client.from('litany_sessions').update({ is_completed: true }).eq('id', activeSession.id);
        activeSession = null;
    }
    document.getElementById('resume-section').style.display = 'none';
}

async function createNewSession(mode) {
    if (activeSession) {
        await client.from('litany_sessions').update({ is_completed: true }).eq('id', activeSession.id);
        activeSession = null;
    }
    try {
        const { data, error } = await client
            .from('litany_sessions')
            .insert({ litany_id: activeLitanyId, mode, session_label: selectedLabel })
            .select().single();
        if (error) throw error;
        launchSession(data);
    } catch (err) {
        alert('Could not start session. Please try again.');
    }
}

// ─── SESSION LAUNCH ──────────────────────────────────────────────────────────

async function launchSession(session) {
    closeIntent();
    // Show player page first, then hide nav (showPage re-shows nav, so hide after)
    showPage('player');
    document.getElementById('main-nav').classList.add('hidden');

    try {
        const { data, error } = await client
            .from('litany_structure')
            .select('user_count, order_index, adhkar_blocks(*)')
            .eq('litany_id', session.litany_id)
            .order('order_index', { nullsFirst: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            alert('This litany has no blocks yet. Add some from the Shop first.');
            exitPlayer(); return;
        }

        if (session.mode === 'flow') runFlow(data, session);
        else runTap(data, session);
    } catch (err) {
        alert('Could not load litany content. Please try again.');
        exitPlayer();
    }
}

// ─── FLOW MODE ───────────────────────────────────────────────────────────────

function runFlow(data, session) {
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }

    // Show center line for flow, hide tap view
    document.querySelector('.center-line').style.display = '';
    const view = document.getElementById('player-view');
    view.style.height = '100vh';
    view.style.overflow = 'scroll';
    view.innerHTML = '';

    const tapView = document.getElementById('tap-view');
    if (tapView) tapView.style.display = 'none';

    data.forEach((item, bIdx) => {
        for (let i = 1; i <= item.user_count; i++) {
            const row     = document.createElement('div');
            row.className = 'dhikr-row';
            row.dataset.idx = bIdx;
            row.dataset.cnt = i;
            row.innerHTML = `
                <div class="arabic">${escapeHtml(item.adhkar_blocks.arabic)}</div>
                <div class="dhikr-counter">${i} / ${item.user_count}</div>
            `;
            view.appendChild(row);
        }
    });

    const debouncedSave = debounce(saveProgress, 400);
    flowObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            e.target.classList.toggle('active', e.isIntersecting);
            if (e.isIntersecting) debouncedSave(session.id, e.target.dataset.idx, e.target.dataset.cnt);
        });
    }, { threshold: 0.6 });

    document.querySelectorAll('.dhikr-row').forEach(r => flowObserver.observe(r));
}

// ─── TAP MODE ────────────────────────────────────────────────────────────────

function runTap(data, session) {
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }

    // Hide flow-specific elements
    document.querySelector('.center-line').style.display = 'none';
    const view = document.getElementById('player-view');
    view.style.height = '0';
    view.style.overflow = 'hidden';
    view.innerHTML = '';

    let tapView = document.getElementById('tap-view');
    if (!tapView) {
        tapView = document.createElement('div');
        tapView.id = 'tap-view';
        document.getElementById('player').appendChild(tapView);
    }
    tapView.style.display = 'flex';

    let blockIndex = session.current_block_index || 0;
    let count      = session.current_count      || 0;

    function render() {
        if (blockIndex >= data.length) {
            markCompleted(session.id);
            tapView.innerHTML = `
                <div class="complete-screen">
                    <p class="complete-icon">✓</p>
                    <p class="complete-label">Litany complete</p>
                    <button class="btn-play btn-done">Done</button>
                </div>`;
            tapView.querySelector('.btn-done').addEventListener('click', exitPlayer);
            return;
        }

        const item  = data[blockIndex];
        const block = item.adhkar_blocks;
        const total = item.user_count;

        tapView.innerHTML = `
            <p class="tap-progress">Block ${blockIndex + 1} of ${data.length}</p>
            <div class="arabic tap-arabic">${escapeHtml(block.arabic)}</div>
            ${block.translation ? `<p class="tap-translation">${escapeHtml(block.translation)}</p>` : ''}
            <div class="tap-counter" id="tap-count">${total - count}</div>
            <p class="tap-total">remaining of ${total}</p>
            <button class="btn-tap" id="btn-tap"></button>
        `;

        document.getElementById('btn-tap').addEventListener('click', () => {
            count++;
            if (count >= total) {
                saveProgress(session.id, blockIndex, count);
                blockIndex++;
                count = 0;
                render();
            } else {
                document.getElementById('tap-count').innerText = total - count;
                saveProgress(session.id, blockIndex, count);
            }
        });
    }

    render();
}

// ─── PROGRESS & EXIT ─────────────────────────────────────────────────────────

async function saveProgress(sId, bIdx, cnt) {
    try {
        await client.from('litany_sessions')
            .update({ current_block_index: bIdx, current_count: cnt, last_active: new Date().toISOString() })
            .eq('id', sId);
    } catch (_) {}
}

async function markCompleted(sId) {
    try { await client.from('litany_sessions').update({ is_completed: true }).eq('id', sId); } catch (_) {}
}

function exitPlayer() {
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }

    // Reset player state
    const tapView = document.getElementById('tap-view');
    if (tapView) tapView.style.display = 'none';
    const view = document.getElementById('player-view');
    if (view) { view.style.height = ''; view.style.overflow = ''; view.innerHTML = ''; }
    document.querySelector('.center-line').style.display = '';

    showPage('home');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}


// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────

function initThemeToggle() {
    const saved = localStorage.getItem('litanyThemeMode');
    if (saved === 'light') {
        isManualLightMode = true;
        document.body.className = 'mode-day mode-manual-light';
    }
    updateThemeToggleLabel();
}

function toggleThemeMode() {
    isManualLightMode = !isManualLightMode;
    if (isManualLightMode) {
        document.body.className = 'mode-day mode-manual-light';
        localStorage.setItem('litanyThemeMode', 'light');
    } else {
        localStorage.removeItem('litanyThemeMode');
        document.body.classList.remove('mode-manual-light');
        updateSunGradient();
    }
    updateThemeToggleLabel();
}

function updateThemeToggleLabel() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.textContent = isManualLightMode ? '🌙 Auto' : '☀️ Light';
}

// ─── JOURNEY PLANNER ─────────────────────────────────────────────────────────

function initJourneyPlanner() {
    hydrateJourneyState();
    renderJourneySteps();
    renderJourneyPresetOptions();
    startJourneyTicker();
}

function hydrateJourneyState() {
    try {
        const raw = localStorage.getItem(JOURNEY_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.steps)) return;
        journeyState = {
            ...journeyState,
            ...parsed,
            steps: parsed.steps.filter(s => s && s.name && Number(s.minutes) > 0).map(s => ({
                name: String(s.name),
                minutes: Number(s.minutes)
            }))
        };
    } catch (_) {}
}

function persistJourneyState() {
    localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(journeyState));
}

function renderJourneySteps() {
    const wrap = document.getElementById('journey-steps');
    const deadlineInput = document.getElementById('journey-deadline');
    deadlineInput.value = journeyState.deadlineIso ? toDateInputValue(journeyState.deadlineIso) : '';

    if (!journeyState.steps.length) {
        wrap.innerHTML = '<p class="loading-text" style="padding:8px 0">No steps yet.</p>';
        updateJourneyDisplay();
        return;
    }

    wrap.innerHTML = journeyState.steps.map((step, idx) => {
        const done = journeyState.isRunning && idx < journeyState.currentStepIndex;
        const active = journeyState.isRunning && idx === journeyState.currentStepIndex;
        return `
            <div class="journey-step ${done ? 'done' : ''} ${active ? 'active' : ''}">
                <div>
                    <p class="journey-step-name">${escapeHtml(step.name)}</p>
                    <p class="journey-step-minutes">${step.minutes} min</p>
                </div>
                <button class="btn-delete-step" data-step-index="${idx}" aria-label="Remove step">✕</button>
            </div>`;
    }).join('');

    wrap.querySelectorAll('.btn-delete-step').forEach(btn => {
        btn.addEventListener('click', () => removeJourneyStep(parseInt(btn.dataset.stepIndex, 10)));
    });

    updateJourneyDisplay();
}

function addJourneyStep() {
    const nameInput = document.getElementById('journey-step-name');
    const minutesInput = document.getElementById('journey-step-minutes');
    const name = nameInput.value.trim();
    const minutes = parseInt(minutesInput.value, 10);
    if (!name || !minutes || minutes < 1) {
        showToast('Add a valid step name + minutes');
        return;
    }
    journeyState.steps.push({ name, minutes });
    nameInput.value = '';
    minutesInput.value = '7';
    persistJourneyState();
    renderJourneySteps();
}

function removeJourneyStep(index) {
    journeyState.steps = journeyState.steps.filter((_, idx) => idx !== index);
    if (journeyState.currentStepIndex >= journeyState.steps.length) {
        journeyState.currentStepIndex = Math.max(0, journeyState.steps.length - 1);
    }
    persistJourneyState();
    renderJourneySteps();
}

function onJourneyDeadlineChange(e) {
    journeyState.deadlineIso = e.target.value ? new Date(e.target.value).toISOString() : '';
    persistJourneyState();
    updateJourneyDisplay();
}

function startJourney() {
    if (!journeyState.steps.length) {
        showToast('Add at least one step to start');
        return;
    }
    journeyState.isRunning = true;
    journeyState.startedAt = new Date().toISOString();
    if (journeyState.currentStepIndex >= journeyState.steps.length) journeyState.currentStepIndex = 0;
    persistJourneyState();
    renderJourneySteps();
}

function advanceJourneyStep() {
    if (!journeyState.steps.length) return;
    journeyState.isRunning = true;
    journeyState.currentStepIndex = Math.min(journeyState.currentStepIndex + 1, journeyState.steps.length - 1);
    persistJourneyState();
    renderJourneySteps();
}

function resetJourney() {
    journeyState.isRunning = false;
    journeyState.currentStepIndex = 0;
    journeyState.startedAt = null;
    persistJourneyState();
    renderJourneySteps();
}

function startJourneyTicker() {
    clearInterval(journeyTimerInterval);
    journeyTimerInterval = setInterval(updateJourneyDisplay, 1000);
    updateJourneyDisplay();
}

function updateJourneyDisplay() {
    const timerEl = document.getElementById('journey-live-timer');
    const summaryEl = document.getElementById('journey-live-summary');
    if (!timerEl || !summaryEl) return;

    const remainingSequenceMinutes = getRemainingSequenceMinutes();
    const doubledMinutes = remainingSequenceMinutes * 2;
    const untilStartMinutes = getMinutesUntilDeadline();

    let phoneTimerMinutes = doubledMinutes;
    if (untilStartMinutes != null) phoneTimerMinutes = Math.max(0, Math.min(doubledMinutes, untilStartMinutes));

    const activeStep = journeyState.steps[journeyState.currentStepIndex];
    timerEl.textContent = formatMinutes(phoneTimerMinutes);

    const stepText = activeStep ? `Current: ${activeStep.name} (${activeStep.minutes} min)` : 'No active step';
    const deadlineText = untilStartMinutes == null
        ? 'No deadline set'
        : (untilStartMinutes <= 0 ? 'Start now' : `${formatMinutes(untilStartMinutes)} until deadline`);

    summaryEl.textContent = `${stepText} • Remaining sequence ${formatMinutes(remainingSequenceMinutes)} • Doubled return ${formatMinutes(doubledMinutes)} • ${deadlineText}`;
}

function getRemainingSequenceMinutes() {
    if (!journeyState.steps.length) return 0;
    const startIndex = journeyState.isRunning ? journeyState.currentStepIndex : 0;
    return journeyState.steps.slice(startIndex).reduce((sum, step) => sum + Number(step.minutes || 0), 0);
}

function getMinutesUntilDeadline() {
    if (!journeyState.deadlineIso) return null;
    const diffMs = new Date(journeyState.deadlineIso).getTime() - Date.now();
    return diffMs / 60000;
}

function formatMinutes(mins) {
    const totalSeconds = Math.max(0, Math.round(mins * 60));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function toDateInputValue(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
}

function getJourneyPresets() {
    try {
        const raw = localStorage.getItem(JOURNEY_PRESETS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function renderJourneyPresetOptions() {
    const select = document.getElementById('journey-preset-select');
    if (!select) return;
    const presets = getJourneyPresets();
    const defaults = [
        {
            id: 'preset-fajr',
            name: 'Fajr prep',
            steps: [
                { name: 'Get dressed', minutes: 7 },
                { name: 'Drive to masjid', minutes: 7 },
                { name: 'Fajr sunnah', minutes: 7 }
            ]
        },
        {
            id: 'preset-class',
            name: 'Class commute',
            steps: [
                { name: 'Drive car to classroom', minutes: 10 },
                { name: 'Drive home to parking lot', minutes: 25 },
                { name: 'Get ready to leave', minutes: 20 }
            ]
        }
    ];

    const merged = [...defaults, ...presets];
    select.innerHTML = merged.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    select.dataset.options = JSON.stringify(merged);
}

function loadSelectedJourneyPreset() {
    const select = document.getElementById('journey-preset-select');
    const merged = JSON.parse(select.dataset.options || '[]');
    const preset = merged.find(p => p.id === select.value);
    if (!preset) return;
    journeyState.steps = preset.steps.map(s => ({ name: s.name, minutes: Number(s.minutes) }));
    journeyState.currentStepIndex = 0;
    journeyState.isRunning = false;
    journeyState.startedAt = null;
    persistJourneyState();
    renderJourneySteps();
    showToast(`Loaded preset: ${preset.name}`);
}

function saveCurrentJourneyPreset() {
    if (!journeyState.steps.length) {
        showToast('Add steps before saving preset');
        return;
    }
    const input = document.getElementById('journey-preset-name');
    const label = input.value.trim();
    if (!label) {
        showToast('Add a preset name first');
        return;
    }
    const presets = getJourneyPresets();
    presets.push({
        id: `custom-${Date.now()}`,
        name: label,
        steps: journeyState.steps.map(s => ({ name: s.name, minutes: Number(s.minutes) }))
    });
    localStorage.setItem(JOURNEY_PRESETS_KEY, JSON.stringify(presets));
    input.value = '';
    renderJourneyPresetOptions();
    showToast(`Saved preset: ${label}`);
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ─── INIT ────────────────────────────────────────────────────────────────────

init();
