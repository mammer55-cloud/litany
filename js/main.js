// ─── main.js — Entry point ────────────────────────────────────────────────────

import { initTheme }      from './theme.js';
import { initRouter }     from './router.js';
import { initModals }     from './ui/modals.js';
import { homeScreen }     from './screens/home.js';
import { exploreScreen }  from './screens/explore.js';
import { historyScreen }  from './screens/history.js';
import { settingsScreen } from './screens/settings.js';
import { bindPlayerExit } from './player/index.js';

const screens = {
    home:     homeScreen,
    explore:  exploreScreen,
    history:  historyScreen,
    settings: settingsScreen,
};

async function boot() {
    homeScreen.bindStatic();
    exploreScreen.bindStatic();
    historyScreen.bindStatic();
    settingsScreen.bindStatic();
    initModals();
    bindPlayerExit();
    initRouter(screens);

    homeScreen.load();
    initTheme();
}

boot();
