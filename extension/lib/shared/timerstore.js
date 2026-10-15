// The timer, the stopwatch and the pomodoro that Halo shares with Ledge:
// one small JSON file in Ledge's state folder, which both write and both
// watch. A timer started in the quick settings runs on Ledge's widget, and
// the other way round.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import * as Pomodoro from './pomodoro.js';
import * as Timer from './timer.js';
import {MINUTE, POMODORO, parseTimers, stretchTimer} from './timers.js';

export const TIMERS_FILE = GLib.build_filenamev([GLib.get_user_state_dir(), 'ledge', 'timers.json']);

export class TimerStore extends EventEmitter {
    constructor(path = TIMERS_FILE) {
        super();
        this._file = Gio.File.new_for_path(path);
        this._timers = this._read();
        // A file in a folder that does not exist yet cannot be watched.
        GLib.mkdir_with_parents(this._file.get_parent().get_path(), 0o755);
        this._monitor = this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_monitor, _file, _other, type) => {
            if (type !== Gio.FileMonitorEvent.CHANGES_DONE_HINT && type !== Gio.FileMonitorEvent.CREATED &&
                type !== Gio.FileMonitorEvent.DELETED)
                return;
            const timers = this._read();
            const text = JSON.stringify(timers);
            // Our own write coming back.
            if (text === JSON.stringify(this._timers))
                return;
            this._timers = timers;
            this.emit('changed');
        });
    }

    get timers() {
        return this._timers;
    }

    // Ends whatever has ended by now: a finished timer stops at its end,
    // a pomodoro moves on. Returns what ended, for the island to say.
    settle(now) {
        const ended = [];
        const {timer, pomodoro} = this._timers;
        if (timer && Timer.isRunning(timer) && Timer.isFinished(timer, now)) {
            ended.push({kind: 'timer'});
            this._set({timer: Timer.pause(timer, timer.startedAt + timer.duration - timer.elapsed)});
        }
        if (pomodoro && Timer.isRunning(pomodoro.state.timer)) {
            const before = pomodoro.state.phase;
            const settled = Pomodoro.settle(pomodoro.state, now, pomodoro.config);
            if (settled.ended > 0) {
                ended.push({kind: 'pomodoro', phase: before, next: settled.state.phase});
                this._set({pomodoro: {state: settled.state, config: pomodoro.config}});
            }
        }
        return ended;
    }

    startTimer(minutes, now = Date.now()) {
        this._set({timer: Timer.start(Timer.create('timer', minutes * MINUTE), now)});
    }

    // The countdown a few minutes longer or shorter (a scroll on the island).
    stretchTimer(minutes, now = Date.now()) {
        if (this._timers.timer)
            this._set({timer: stretchTimer(this._timers.timer, minutes, now)});
    }

    // Pauses a running timer of a kind, or goes on with a paused one.
    toggle(kind, now = Date.now()) {
        const current = this._timers[kind];
        if (kind === 'pomodoro') {
            const pomodoro = current ?? {state: Pomodoro.create(POMODORO), config: POMODORO};
            const running = Timer.isRunning(pomodoro.state.timer);
            const state = running ? Pomodoro.pause(pomodoro.state, now) : Pomodoro.start(pomodoro.state, now);
            this._set({pomodoro: {state, config: pomodoro.config}});
            return;
        }
        const state = current ?? Timer.create(kind, 0);
        if (Timer.isRunning(state))
            this._set({[kind]: Timer.pause(state, now)});
        else if (Timer.isFinished(state, now))
            this._set({[kind]: Timer.start(Timer.reset(state), now)});
        else
            this._set({[kind]: Timer.start(state, now)});
    }

    reset(kind) {
        if (kind === 'pomodoro') {
            const config = this._timers.pomodoro?.config ?? POMODORO;
            this._set({pomodoro: {state: Pomodoro.create(config), config}});
            return;
        }
        this._set({[kind]: null});
    }

    destroy() {
        this._monitor.cancel();
        this._monitor = null;
        this.disconnectAll();
    }

    _read() {
        try {
            const [, bytes] = this._file.load_contents(null);
            return parseTimers(new TextDecoder().decode(bytes));
        } catch {
            return parseTimers(null);
        }
    }

    _set(change) {
        this._timers = {...this._timers, ...change};
        try {
            GLib.mkdir_with_parents(this._file.get_parent().get_path(), 0o755);
            this._file.replace_contents(new TextEncoder().encode(JSON.stringify(this._timers, null, 2)), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.log(`Halo: could not keep the timers (${e.message})`);
        }
        this.emit('changed');
    }
}
