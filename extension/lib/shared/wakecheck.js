// After the computer wakes, writes to the journal what lies over the lock
// screen and what it looks like when input comes back, so a lock screen
// that takes no input leaves evidence:
//   journalctl --user -b -1 | grep "halo wake"
// No "input reached" line after pressing keys means the input never got to
// GNOME at all. Logged as errors so the journal writes them to disk at once:
// a hung screen ends in a hard power-off.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

const LOOK_AFTER_S = 3;
// Input counts after a short calm, so the wake's own events do not.
const CALM_MS = 1500;
const INPUTS = 3;

const path = actor => {
    const names = [];
    for (let a = actor; a && names.length < 6; a = a.get_parent())
        names.push(a.name || a.style_class || a.constructor.name);
    return names.join(' < ') || 'none';
};

export class WakeCheck {
    constructor() {
        this._idle = global.backend.get_core_idle_monitor();
        this._look = 0;
        this._calm = 0;
        this._active = 0;
        LoginManager.getLoginManager().connectObject('prepare-for-sleep', (_manager, sleeping) => {
            if (sleeping) {
                this._stop();
                console.error(`halo wake: going to sleep, ${this._state()}`);
            } else {
                this._woke();
            }
        }, this);
    }

    _state() {
        const [x, y] = global.get_pointer();
        const under = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        const halo = Main.layoutManager.uiGroup.get_children()
            .filter(actor => (actor.name ?? '').startsWith('halo') && actor.visible)
            .map(actor => `${actor.name}${actor.reactive ? '*' : ''} ${Math.round(actor.width)}x${Math.round(actor.height)}`);
        return `mode=${Main.sessionMode.currentMode} modal=${Main.modalCount} grab=[${path(global.stage.get_grab_actor())}] ` +
            `focus=[${path(global.stage.key_focus)}] under pointer=[${path(under)}] halo=[${halo.join(', ')}]`;
    }

    _woke() {
        this._stop();
        console.error(`halo wake: woke, ${this._state()}`);
        this._look = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LOOK_AFTER_S, () => {
            this._look = 0;
            console.error(`halo wake: ${LOOK_AFTER_S} s later, ${this._state()}`);
            return GLib.SOURCE_REMOVE;
        });
        this._watch(INPUTS);
    }

    // Each time input comes back after a calm, up to `left` times.
    _watch(left) {
        this._calm = this._idle.add_idle_watch(CALM_MS, () => {
            if (this._active)
                return;
            this._active = this._idle.add_user_active_watch(() => {
                this._active = 0;
                console.error(`halo wake: input reached GNOME, ${this._state()}`);
                if (--left <= 0) {
                    this._idle.remove_watch(this._calm);
                    this._calm = 0;
                }
            });
        });
    }

    _stop() {
        if (this._look)
            GLib.source_remove(this._look);
        this._look = 0;
        for (const watch of [this._calm, this._active]) {
            if (watch)
                this._idle.remove_watch(watch);
        }
        this._calm = 0;
        this._active = 0;
    }

    destroy() {
        this._stop();
        LoginManager.getLoginManager().disconnectObject(this);
    }
}
