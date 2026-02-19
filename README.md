# Litany

An Islamic devotional prayer tracking app for practicing adhkar (remembrances). Built as a mobile-first web app with a day/night theme that follows actual prayer times.

## Features

- **Flow mode** — scroll through each dhikr repetition full-screen, progress saves automatically
- **Tap mode** — tap a button to count each repetition, advances through blocks automatically
- **Intent selection** — choose a schedule label (Fajr, Isha, Freestyle, etc.) before starting
- **Resume sessions** — unfinished sessions are detected and can be resumed
- **Dynamic theme** — switches between day/night based on Fajr and Maghrib times for your location

## Project Structure

```
litany/
├── index.html          # Markup only
├── css/
│   └── style.css       # All styles
├── js/
│   └── app.js          # Application logic
├── config.js           # Local credentials (git-ignored)
├── config.example.js   # Template for credentials
└── SCHEMA.md           # Supabase database schema reference
```

## Setup

1. Copy `config.example.js` to `config.js`
2. Fill in your Supabase URL and publishable key:

```js
const SB_URL = "https://your-project.supabase.co";
const SB_KEY = "your-publishable-key";
```

3. Open `index.html` in a browser (or serve it locally — geolocation requires a secure context or localhost)

## Database

See [SCHEMA.md](SCHEMA.md) for the full Supabase schema reference.

## Tech Stack

- Vanilla JS (ES6+), HTML5, CSS3
- [Supabase](https://supabase.com) — database and backend
- [Aladhan API](https://aladhan.com/prayer-times-api) — prayer times
- [Nominatim](https://nominatim.openstreetmap.org) — reverse geocoding for city name
- Google Fonts: Inter, Amiri
