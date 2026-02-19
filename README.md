# Litany

An Islamic devotional prayer tracking app for practicing adhkar (remembrances). Built as a mobile-first web app with a day/night theme that follows actual prayer times.

## Features

- **Flow mode** — scroll through each dhikr repetition full-screen, progress saves automatically
- **Tap mode** — tap a button to count each repetition, advances through blocks automatically
- **Intent selection** — choose a schedule label (Fajr, Isha, Freestyle, etc.) before starting
- **Resume sessions** — unfinished sessions are detected and can be resumed
- **Dynamic theme** — switches between day/night based on Fajr and Maghrib times for your location

## Project structure

```
litany/
├── index.html            # Markup only — no inline styles or onclick handlers
├── css/
│   └── style.css         # All styles and component classes
├── js/
│   └── app.js            # Application logic
├── config.js             # Local credentials (git-ignored)
├── config.example.js     # Template for credentials
├── SCHEMA.md             # Supabase database schema reference
└── .github/
    ├── pull_request_template.md
    └── ISSUE_TEMPLATE/
        ├── bug_report.md
        └── feature_request.md
```

## Setup

1. Copy `config.example.js` to `config.js`
2. Fill in your Supabase URL and publishable (anon) key:

```js
const SB_URL = "https://your-project.supabase.co";
const SB_KEY = "your-anon-key";
```

3. Open `index.html` in a browser (geolocation requires a secure context — use localhost or HTTPS)

## Database

See [SCHEMA.md](SCHEMA.md) for the full Supabase schema. The active tables are:

| Table | Purpose |
|---|---|
| `litanies` | Named collections of adhkar |
| `adhkar_blocks` | Individual Arabic prayers with translation |
| `litany_structure` | Ordered blocks within a litany, with per-block repeat counts |
| `litany_sessions` | Progress tracking for each practice session |
| `litany_schedules` | Prayer-time labels (Fajr, Isha, etc.) linked to a litany |

Tables prefixed with `my_litanies`, `adhkar_library`, and `litany_items` are legacy and unused by the current app.

## Tech stack

- Vanilla JS (ES6+), HTML5, CSS3
- [Supabase](https://supabase.com) — database and backend
- [Aladhan API](https://aladhan.com/prayer-times-api) — prayer times
- [Nominatim](https://nominatim.openstreetmap.org) — reverse geocoding for city name
- Google Fonts: Inter, Amiri

## Contributing

- Use the issue templates when filing bugs or feature requests
- Fill out the PR template when submitting changes
- Keep `SCHEMA.md` up to date whenever the Supabase schema changes
- Never commit `config.js` — it is git-ignored for security
