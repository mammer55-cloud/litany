// ─── theme.js — Prayer times + day/night gradient ─────────────────────────────

import { setState } from './state.js';

export async function initTheme() {
    const el = document.getElementById('prayer-status');
    if (!navigator.geolocation) {
        if (el) el.textContent = 'Location unavailable';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => fetchAndApply(pos),
        ()  => { if (el) el.textContent = 'Location access denied'; }
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

        let city = '';
        if (geoRes.status === 'fulfilled') {
            const geo = await geoRes.value.json();
            city = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.county || '';
        }

        const now = new Date();
        const h = now.getHours(), m = now.getMinutes();
        const cur = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const isDay = cur >= data.timings.Fajr && cur < data.timings.Maghrib;

        document.body.className = isDay ? 'mode-day' : 'mode-night';

        const hue = isDay ? 45 : 240;
        const lightness = isDay ? (95 - (h % 12)) : (5 + (h % 12));
        document.body.style.background =
            `radial-gradient(circle at top right, hsl(${hue}, 80%, ${lightness + 10}%), hsl(${hue}, 20%, ${lightness}%))`;

        const nextPrayer = isDay ? `Maghrib ${data.timings.Maghrib}` : `Fajr ${data.timings.Fajr}`;
        const locationStr = city ? `${city} • ` : '';
        const statusText = `${locationStr}${isDay ? 'Day Mode' : 'Night Mode'} • Next: ${nextPrayer}`;

        if (el) el.textContent = statusText;

        setState({ theme: { mode: isDay ? 'day' : 'night', city, nextPrayer } });

    } catch (_) {
        if (el) el.textContent = 'Could not fetch prayer times';
    }
}
