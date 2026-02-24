// ─── player/index.js — Orchestrates player launch/exit ───────────────────────

import { db } from '../db.js';
import { showScreen } from '../router.js';
import { showToast } from '../ui/toast.js';
import { runFlow, cleanup as cleanupFlow } from './flow.js';
import { runTap, cleanup as cleanupTap } from './tap.js';
import { setPlayerState } from '../state.js';

let _currentMode = null;

export async function launchPlayer(litanyId, mode, session) {
    showScreen('player');

    try {
        const blocks = await db.getBlocksForLitany(litanyId);

        if (!blocks || !blocks.length) {
            showToast('This litany has no blocks. Add some from Explore first.');
            exitPlayer();
            return;
        }

        setPlayerState({ session, blocks, mode });
        _currentMode = mode;

        const callbacks = {
            onComplete: () => exitPlayer({ completed: true }),
            onExit:     () => exitPlayer(),
        };

        if (mode === 'flow') {
            runFlow(blocks, session, callbacks);
        } else {
            runTap(blocks, session, callbacks);
        }

    } catch (_) {
        showToast('Could not load litany content. Try again.');
        exitPlayer();
    }
}

export function exitPlayer({ completed = false } = {}) {
    cleanupFlow();
    cleanupTap();
    setPlayerState({ session: null, blocks: [], mode: null });
    _currentMode = null;
    showScreen('home');

    // Reload home after exit to refresh resume banner
    import('../screens/home.js').then(({ homeScreen }) => homeScreen.load());
}

export function bindPlayerExit() {
    document.getElementById('btn-exit-player').addEventListener('click', () => exitPlayer());
}
