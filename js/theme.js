// ─── theme.js — Prayer times + day/night gradient ─────────────────────────────

import { setState } from './state.js';

// Stored so settings screen can preview different times
let _timings = null;
let _isDay   = false;

export async function initTheme() {
    const el = document.getElementById('prayer-status');
    if (!navigator.geolocation) {
        if (el) el.textContent = 'Location unavailable';
        applyGradient(new Date().getHours(), new Date().getMinutes(), null);
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => fetchAndApply(pos),
        ()  => {
            if (el) el.textContent = 'Location access denied';
            applyGradient(new Date().getHours(), new Date().getMinutes(), null);
        }
    );
}

async function fetchAndApply(pos) {
    const el = document.getElementById('prayer-status');
    try {
        const [timingsRes, geoRes] = await Promise.allSettled([
            fetch(`https://api.aladhan.com/v1/timings?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&method=2`),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`),
        ]);

        if (timingsRes.status !== 'fulfilled' || !timingsRes.value.ok) throw new Error('Prayer fetch failed');
        const { data } = await timingsRes.value.json();
        _timings = data.timings;

        let city = '';
        if (geoRes.status === 'fulfilled') {
            const geo = await geoRes.value.json();
            city = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.county || '';
        }

        const now = new Date();
        const h = now.getHours(), m = now.getMinutes();

        applyGradient(h, m, _timings);

        const nextPrayer = _isDay ? `Maghrib ${_timings.Maghrib}` : `Fajr ${_timings.Fajr}`;
        const locationStr = city ? `${city} • ` : '';
        if (el) el.textContent = `${locationStr}${_isDay ? 'Day Mode' : 'Night Mode'} • Next: ${nextPrayer}`;

        setState({ timings: _timings, theme: { mode: _isDay ? 'day' : 'night', city, nextPrayer } });

    } catch (_) {
        if (el) el.textContent = 'Could not fetch prayer times';
        applyGradient(new Date().getHours(), new Date().getMinutes(), null);
    }
}

// ── Core gradient function — exported for settings preview ────────────────────

export function applyGradient(h, m, timings) {
    const cur = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    _isDay = timings
        ? (cur >= timings.Fajr && cur < timings.Maghrib)
        : (h >= 6 && h < 19); // fallback when no prayer times

    document.body.className = _isDay ? 'mode-day' : 'mode-night';

    let hue, sat, lightness;

    if (_isDay) {
        // Day: warm golden sky — brighter at midday, deeper at golden hours
        hue = 38;
        sat = 65;
        const dayH = h + m / 60;
        const noon = 12;
        const distFromNoon = Math.abs(dayH - noon);
        lightness = Math.max(50, 82 - distFromNoon * 3);
    } else {
        // Night: deep blue-indigo — darkest around midnight, slightly lighter near dusk/dawn
        hue = 235;
        sat = 45;
        const hoursFromMidnight = Math.min(h, 24 - h); // 0 at midnight, increases away from midnight
        lightness = Math.max(2, 3 + hoursFromMidnight * 1.1);
        lightness = Math.min(11, lightness);
    }

    const bg = `radial-gradient(ellipse at top right, hsl(${hue}, ${sat}%, ${lightness + 7}%), hsl(${hue}, ${Math.round(sat * 0.35)}%, ${lightness}%))`;
    document.body.style.background = bg;

    // Update theme-color meta so status bar matches
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.content = _isDay
            ? `hsl(${hue}, ${sat}%, ${lightness + 7}%)`
            : `hsl(${hue}, ${sat}%, ${lightness}%)`;
    }
}

// Called from settings screen to preview a custom time
export function previewGradient(timeStr) {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':').map(Number);
    applyGradient(h, m, _timings);
}

// Restore real current time
export function resetGradient() {
    const now = new Date();
    applyGradient(now.getHours(), now.getMinutes(), _timings);
}
