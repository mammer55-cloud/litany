// ─── main.js — Entry point ────────────────────────────────────────────────────

import { initTheme }     from './theme.js';
import { initRouter }    from './router.js';
import { initModals }    from './ui/modals.js';
import { homeScreen }    from './screens/home.js';
import { exploreScreen } from './screens/explore.js';
import { historyScreen } from './screens/history.js';
import { bindPlayerExit } from './player/index.js';

const screens = {
    home:    homeScreen,
    explore: exploreScreen,
    history: historyScreen,
};

async function boot() {
    // Bind static event listeners for each module
    homeScreen.bindStatic();
    exploreScreen.bindStatic();
    historyScreen.bindStatic();
    initModals();
    bindPlayerExit();
    initRouter(screens);

    // Load initial screen
    homeScreen.load();

    // Prayer times + theme (async, non-blocking)
    initTheme();
}

boot();
