// The grip of "handle" mode: a thin bar at the top edge, the only thing
// left of bar and island. Resting the pointer on it brings the clock
// island out; a small dot beside it tells that something runs.

import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {HANDLE, handleRect} from '../bar/modes.js';

// The pointer rests this long on the grip before the island comes.
const REST_MS = 150;
// Room around the thin bar that still counts as on it.
const REACH = 6;
const DOT = 5;

export class Handle {
    // onHover(on): the pointer came to rest on the grip, or left it.
    constructor({onHover}) {
        this._onHover = onHover;
        this._wait = 0;
        this._color = '#000000';
        this.actor = new St.Widget({name: 'haloHandle', reactive: true, track_hover: true, visible: false});
        this._bar = new St.Widget({reactive: false});
        this._dot = new St.Widget({reactive: false, visible: false});
        this.actor.add_child(this._bar);
        this.actor.add_child(this._dot);
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.connect('notify::hover', () => this._hovered());
    }

    // The grip's rectangle on the stage, as the island grows out of it.
    get rect() {
        const monitor = Main.layoutManager.primaryMonitor;
        return monitor ? handleRect(monitor) : null;
    }

    get hover() {
        return this.actor.hover;
    }

    setColor(color) {
        this._color = color;
        this._paint();
    }

    // Shows or hides the grip, with a dot beside it when something runs.
    sync({shown, running = false}) {
        const rect = this.rect;
        this.actor.visible = shown && Boolean(rect);
        if (!rect)
            return;
        this.actor.set_position(rect.x - REACH, rect.y - HANDLE.top);
        this.actor.set_size(rect.width + 2 * REACH, rect.height + HANDLE.top + REACH);
        this._bar.set_position(REACH, HANDLE.top);
        this._bar.set_size(rect.width, rect.height);
        this._dot.set_position(REACH + rect.width + 6, HANDLE.top);
        this._dot.set_size(DOT, DOT);
        this._dot.visible = running;
        this._paint();
    }

    destroy() {
        if (this._wait)
            GLib.source_remove(this._wait);
        this._wait = 0;
        this.actor.destroy();
    }

    _paint() {
        // A thin light edge and a dark shadow: seen on light and dark
        // wallpapers alike.
        const style = `background-color: ${this._color}; border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.35); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);`;
        if (this._bar.get_style() !== style)
            this._bar.set_style(style);
        const dot = `background-color: ${this._color}; border-radius: ${DOT / 2}px;`;
        if (this._dot.get_style() !== dot)
            this._dot.set_style(dot);
    }

    _hovered() {
        if (this._wait)
            GLib.source_remove(this._wait);
        this._wait = 0;
        if (!this.actor.hover) {
            this._onHover(false);
            return;
        }
        this._wait = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REST_MS, () => {
            this._wait = 0;
            if (this.actor.hover)
                this._onHover(true);
            return GLib.SOURCE_REMOVE;
        });
    }
}
