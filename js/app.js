const client = supabase.createClient(SB_URL, SB_KEY);

let activeLitanyId  = null;
let activeSession   = null;
let selectedLabel   = 'Freestyle';
let flowObserver    = null;   // kept so we can disconnect on exit

// ─── BOOT ────────────────────────────────────────────────────────────────────

async function init() {
    updateSunGradient();
    loadRoster();
    bindStaticListeners();
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

            // Resolve city name via reverse geocoding
            let cityName = '';
            try {
                const geo = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
                );
                const geoData = await geo.json();
                cityName = geoData.address?.city
                    || geoData.address?.town
                    || geoData.address?.village
                    || geoData.address?.county
                    || '';
            } catch (_) { /* city name is optional, fall through silently */ }

            const now  = new Date();
            const h    = now.getHours(), m = now.getMinutes();
            const cur  = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;

            const isDay = cur >= data.timings.Fajr && cur < data.timings.Maghrib;
            document.body.className = isDay ? 'mode-day' : 'mode-night';

            const hue       = isDay ? 45 : 240;
            const lightness = isDay ? (95 - (h % 12)) : (5 + (h % 12));
            document.body.style.background =
                `radial-gradient(circle at top right, hsl(${hue}, 80%, ${lightness + 10}%), hsl(${hue}, 20%, ${lightness}%))`;

            const nextPrayer = isDay ? `Maghrib ${data.timings.Maghrib}` : `Fajr ${data.timings.Fajr}`;
            const location   = cityName ? `${cityName} • ` : '';
            document.getElementById('prayer-status').innerText =
                `${location}${isDay ? 'Day Mode' : 'Night Mode'} • Next: ${nextPrayer}`;

        } catch (err) {
            console.error('Theme update failed:', err);
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
    // Nav buttons
    document.getElementById('nav-home').addEventListener('click', () => showPage('home'));
    document.getElementById('nav-shop').addEventListener('click', () => showPage('shop'));

    // Intent modal actions
    document.getElementById('btn-start-flow').addEventListener('click', () => createNewSession('flow'));
    document.getElementById('btn-start-tap').addEventListener('click',  () => createNewSession('tap'));
    document.getElementById('btn-cancel-intent').addEventListener('click', closeIntent);

    // Player exit
    document.getElementById('btn-exit-player').addEventListener('click', exitPlayer);

    // Roster: event delegation for Play buttons
    document.getElementById('roster-list').addEventListener('click', e => {
        const btn = e.target.closest('.btn-open-litany');
        if (btn) openIntent(btn.dataset.id, btn.dataset.name);
    });

    // Intent chips: event delegation
    document.getElementById('intent-options').addEventListener('click', e => {
        const chip = e.target.closest('.intent-chip');
        if (!chip) return;
        selectedLabel = chip.dataset.label;
        document.querySelectorAll('.intent-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    });
}

// ─── ROSTER ──────────────────────────────────────────────────────────────────

async function loadRoster() {
    const list = document.getElementById('roster-list');
    list.innerHTML = '<p class="loading-text">Loading litanies…</p>';
    try {
        const { data, error } = await client.from('litanies').select('id, name');
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<p class="loading-text">No litanies found.</p>';
            return;
        }
        list.innerHTML = data.map(lit => `
            <div class="card">
                <h2 class="card-title">${escapeHtml(lit.name)}</h2>
                <button class="btn-play btn-open-litany"
                    data-id="${escapeHtml(lit.id)}"
                    data-name="${escapeHtml(lit.name)}">Play</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('loadRoster failed:', err);
        list.innerHTML = '<p class="loading-text">Failed to load litanies. Check connection.</p>';
    }
}

// ─── SHOP ────────────────────────────────────────────────────────────────────

function loadShop() {
    document.getElementById('shop-list').innerHTML = `
        <div class="card shop-placeholder">
            <p class="shop-icon">🕌</p>
            <p class="shop-coming-soon">Coming Soon</p>
            <p class="shop-subtitle">Curated litanies and adhkar collections will be available here.</p>
        </div>
    `;
}

// ─── INTENT MODAL ────────────────────────────────────────────────────────────

async function openIntent(id, name) {
    activeLitanyId = id;
    selectedLabel  = 'Freestyle';
    document.getElementById('intent-title').innerText = name;
    document.getElementById('intent-modal').style.display = 'flex';

    // Check for unfinished session
    try {
        const { data: sess, error } = await client
            .from('litany_sessions')
            .select('*')
            .eq('litany_id', id)
            .eq('is_completed', false)
            .maybeSingle();
        if (error) throw error;

        const resumeDiv = document.getElementById('resume-section');
        if (sess) {
            resumeDiv.style.display = 'block';
            activeSession = sess;
            document.getElementById('btn-resume').onclick = () => launchSession(sess);
        } else {
            resumeDiv.style.display = 'none';
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }

    // Load schedules
    try {
        const { data: sch, error } = await client
            .from('litany_schedules')
            .select('*')
            .eq('litany_id', id);
        if (error) throw error;

        const grid = document.getElementById('intent-options');
        const chips = (sch || []).map(s =>
            `<div class="intent-chip" data-label="${escapeHtml(s.label)}">${escapeHtml(s.label)}<br><small>${escapeHtml(s.time_hint || '')}</small></div>`
        );
        chips.push(`<div class="intent-chip" data-label="Freestyle">Freestyle<br><small>Anytime</small></div>`);
        grid.innerHTML = chips.join('');
    } catch (err) {
        console.error('Schedule load failed:', err);
    }
}

function closeIntent() {
    document.getElementById('intent-modal').style.display = 'none';
}

async function createNewSession(mode) {
    try {
        const { data, error } = await client
            .from('litany_sessions')
            .insert({
                litany_id:     activeLitanyId,
                mode:          mode,
                session_label: selectedLabel
            })
            .select()
            .single();
        if (error) throw error;
        launchSession(data);
    } catch (err) {
        console.error('createNewSession failed:', err);
        alert('Could not start session. Please try again.');
    }
}

// ─── SESSION LAUNCH ──────────────────────────────────────────────────────────

async function launchSession(session) {
    closeIntent();
    document.getElementById('main-nav').classList.add('hidden');
    showPage('player');

    try {
        const { data, error } = await client
            .from('litany_structure')
            .select('user_count, adhkar_blocks(*)')
            .eq('litany_id', session.litany_id)
            .order('order_index');
        if (error) throw error;

        if (session.mode === 'flow') runFlow(data, session);
        else runTap(data, session);
    } catch (err) {
        console.error('launchSession failed:', err);
        alert('Could not load litany content. Please try again.');
        exitPlayer();
    }
}

// ─── FLOW MODE ───────────────────────────────────────────────────────────────

function runFlow(data, session) {
    // Disconnect any previous observer to prevent memory leaks
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }

    const view = document.getElementById('player-view');
    view.innerHTML = '';

    const tapView = document.getElementById('tap-view');
    if (tapView) tapView.style.display = 'none';

    data.forEach((item, bIdx) => {
        for (let i = 1; i <= item.user_count; i++) {
            const row       = document.createElement('div');
            row.className   = 'dhikr-row';
            row.dataset.idx = bIdx;
            row.dataset.cnt = i;
            row.innerHTML   = `
                <div class="arabic">${escapeHtml(item.adhkar_blocks.arabic)}</div>
                <div class="dhikr-counter">${i} / ${item.user_count}</div>
            `;
            view.appendChild(row);
        }
    });

    // Debounced save — avoids a Supabase write on every scroll tick
    const debouncedSave = debounce(saveProgress, 400);

    flowObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('active');
                debouncedSave(session.id, e.target.dataset.idx, e.target.dataset.cnt);
            } else {
                e.target.classList.remove('active');
            }
        });
    }, { threshold: 0.6 });

    document.querySelectorAll('.dhikr-row').forEach(r => flowObserver.observe(r));
}

// ─── TAP MODE ────────────────────────────────────────────────────────────────

function runTap(data, session) {
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }

    const view = document.getElementById('player-view');
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
                </div>
            `;
            tapView.querySelector('.btn-done').addEventListener('click', exitPlayer);
            return;
        }

        const item  = data[blockIndex];
        const block = item.adhkar_blocks;
        const total = item.user_count;

        tapView.innerHTML = `
            <p class="tap-progress">Block ${blockIndex + 1} of ${data.length}</p>
            <div class="arabic">${escapeHtml(block.arabic)}</div>
            ${block.translation ? `<p class="tap-translation">${escapeHtml(block.translation)}</p>` : ''}
            <div class="tap-counter" id="tap-count">${total - count}</div>
            <p class="tap-total">remaining of ${total}</p>
            <button class="btn-tap" id="btn-tap">☽</button>
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
        const { error } = await client
            .from('litany_sessions')
            .update({ current_block_index: bIdx, current_count: cnt, last_active: new Date().toISOString() })
            .eq('id', sId);
        if (error) throw error;
    } catch (err) {
        console.error('saveProgress failed:', err);
    }
}

async function markCompleted(sId) {
    try {
        await client.from('litany_sessions').update({ is_completed: true }).eq('id', sId);
    } catch (err) {
        console.error('markCompleted failed:', err);
    }
}

function exitPlayer() {
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }
    const tapView = document.getElementById('tap-view');
    if (tapView) tapView.style.display = 'none';
    showPage('home');
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ─── INIT ────────────────────────────────────────────────────────────────────

init();
