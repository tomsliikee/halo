// The timer, the stopwatch and the pomodoro shared with Ledge: the one
// that runs stays in the island with its time, and its end is told with a
// sound. Started and paused from the quick settings or from Ledge.

import GLib from 'gi://GLib';

import {runningTimer} from '../../shared/timers.js';
import {POMODORO_PHASES} from '../words.js';

const ID = 'timer';
const LABELS = {timer: 'Timer', stopwatch: 'Stopwatch'};

export class TimerSource {
    // onOpen(): the island was clicked, the timer page should open.
    constructor(island, store, onOpen) {
        this._island = island;
        this._store = store;
        this._onOpen = onOpen;
        this._tick = 0;
        this._store.connectObject('changed', () => this._update(), this);
        this._update();
    }

    destroy() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        this._store.disconnectObject(this);
        this._island.remove(ID);
    }

    _update() {
        const now = Date.now();
        for (const ended of this._store.settle(now))
            this._announce(ended);
        const running = runningTimer(this._store.timers, now);
        if (!running || !this._island.allows('timer')) {
            this._island.remove(ID);
            this._syncTick(Boolean(running));
            return;
        }
        this._island.set({
            id: ID, kind: 'timer', view: 'timer',
            data: {
                label: running.kind === 'pomodoro' ? POMODORO_PHASES[running.phase] : LABELS[running.kind],
                shown: running.shown, progress: running.progress, countdown: running.countdown,
            },
            onClick: () => this._onOpen?.(),
        });
        this._syncTick(true);
    }

    _syncTick(running) {
        if (running && !this._tick) {
            this._tick = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!running && this._tick) {
            GLib.source_remove(this._tick);
            this._tick = 0;
        }
    }

    _announce(ended) {
        global.display.get_sound_player().play_from_theme('complete', 'Timer', null);
        if (!this._island.allows('timer'))
            return;
        const data = ended.kind === 'timer'
            ? {icon: 'timer', title: 'Time is up', note: 'The timer has run out'}
            : {icon: 'timer', title: ended.phase === 'work' ? 'Focus is over' : 'The break is over', note: `Next: ${POMODORO_PHASES[ended.next]}`};
        this._island.set({id: 'hint:timer-end', kind: 'timer', hint: true, duration: 6000, view: 'info', data, onClick: () => this._onOpen?.()});
    }
}
