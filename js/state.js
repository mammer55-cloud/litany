// ─── State ────────────────────────────────────────────────────────────────────

let _state = {
    screen: 'home',
    litanies: [],
    activeSession: null,   // incomplete session (for resume banner)
    player: {
        session: null,
        blocks: [],
        mode: null,        // 'flow' | 'tap'
    },
    modal: null,           // null | 'new-litany' | 'add-block' | 'manage-blocks' | 'confirm-delete'
    modalData: {},
    theme: { mode: 'night', city: '', nextPrayer: '' },
    timings: null,   // raw prayer timings from aladhan API
};

const _subscribers = [];

export function getState() {
    return _state;
}

export function setState(updates) {
    Object.assign(_state, updates);
    _subscribers.forEach(fn => fn(_state));
}

export function setPlayerState(updates) {
    _state.player = { ..._state.player, ...updates };
    _subscribers.forEach(fn => fn(_state));
}

export function subscribe(fn) {
    _subscribers.push(fn);
}
