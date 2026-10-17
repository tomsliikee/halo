// The grip of "handle" mode, as Harbor's: a thin bar at the top edge, the
// only thing left of bar and island. Resting the pointer on it, or a click,
// brings the clock island out of it; a small dot beside it tells that
// something runs.

import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {HANDLE, handleRect} from '../bar/modes.js';
import {spring, SPRINGS, stopSprings} from '../shared/choreo.js';

// The pointer rests this long on the grip before the island comes.
const REST_MS = 150;
// Room around the thin bar that still counts as on it.
const REACH = 6;
const DOT = 7;
// Under the pointer the grip grows this much thicker, as Harbor's.
const GROW = 1.7;
const SHADOW = '0 0 2px rgba(0, 0, 0, 0.18)';
// A faint light edge: the island's dark colour is still seen on a dark
// wallpaper.
const EDGE = '1px solid rgba(255, 255, 255, 0.18)';

export class Handle {
    // onHover(on): the pointer came to rest on the grip (or clicked it), or
    // left it.
    constructor({onHover}) {
        this._onHover = onHover;
        this._wait = 0;
        this._color = '#000000';
        this._out = false;
        this.actor = new St.Button({name: 'haloHandle', reactive: true, track_hover: true, visible: false, accessible_name: 'Show the clock'});
        this._layer = new St.Widget({reactive: false});
        this._bar = new St.Widget({reactive: false});
        this._bar.set_pivot_point(0.5, 0.5);
        this._dot = new St.Widget({reactive: false, visible: false});
        this._layer.add_child(this._bar);
        this._layer.add_child(this._dot);
        this.actor.set_child(this._layer);
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.connect('notify::hover', () => this._hovered());
        this.actor.connect('clicked', () => {
            if (!this._out)
                this._onHover(true);
        });
    }

    // The grip's rectangle on the stage, as the island grows out of it.
    get rect() {
        const monitor = Main.layoutManager.primaryMonitor;
        return monitor ? handleRect(monitor) : null;
    }

    // St's hover, held to where the pointer really is: a grip that takes
    // the pointer again is told it is hovered by the last pick, also when
    // the pointer has long gone.
    get hover() {
        if (!this.actor.hover || !this.actor.visible)
            return false;
        const [x, y] = global.get_pointer();
        const [ax, ay] = this.actor.get_transformed_position();
        const [w, h] = this.actor.get_transformed_size();
        return x >= ax && x < ax + w && y >= ay && y < ay + h;
    }

    setColor(color) {
        this._color = color;
        this._paint();
    }

    // shown: the grip has its place (the bar is away). out: the island is
    // out of it, so only its room stays, for the pointer, and takes no
    // clicks from the island over it. running: the dot beside it.
    sync({shown, out = false, running = false}) {
        const rect = this.rect;
        this.actor.visible = shown && Boolean(rect);
        if (!rect)
            return;
        this.actor.set_position(rect.x - REACH, rect.y - HANDLE.top);
        this.actor.set_size(rect.width + 2 * REACH, rect.height + HANDLE.top + REACH);
        this._layer.set_size(rect.width + 2 * REACH, rect.height + HANDLE.top + REACH);
        this._bar.set_position(REACH, HANDLE.top);
        this._bar.set_size(rect.width, rect.height);
        this._dot.set_position(REACH + rect.width + 6, HANDLE.top + Math.round((rect.height - DOT) / 2));
        this._dot.set_size(DOT, DOT);
        if (out !== this._out) {
            this._out = out;
            this.actor.reactive = !out;
            this._layer.visible = !out;
            if (out) {
                // No leave event comes once it takes no pointer: it lets go
                // of the hover itself, or the next rest on it goes unseen.
                if (this._wait)
                    GLib.source_remove(this._wait);
                this._wait = 0;
                this.actor.hover = false;
                stopSprings(this._bar, ['scale_y']);
                this._bar.scale_y = 1;
            }
        }
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
        const style = `background-color: ${this._color}; border-radius: 3px; border: ${EDGE}; box-shadow: ${SHADOW};`;
        if (this._bar.get_style() !== style)
            this._bar.set_style(style);
        const dot = `background-color: ${this._color}; border-radius: ${Math.ceil(DOT / 2)}px; border: ${EDGE}; box-shadow: ${SHADOW};`;
        if (this._dot.get_style() !== dot)
            this._dot.set_style(dot);
    }

    // Under the pointer the grip grows, and after a moment the island
    // comes out of it.
    _hovered() {
        if (this._wait)
            GLib.source_remove(this._wait);
        this._wait = 0;
        // Hovered by a stale pick: let go, so the next real rest on it is
        // told again.
        if (this.actor.hover && !this.hover) {
            this.actor.hover = false;
            return;
        }
        const hover = this.hover && !this._out;
        spring(this._bar, {scale_y: hover ? GROW : 1}, {spring: SPRINGS.hover});
        if (!this.hover) {
            this._onHover(false);
            return;
        }
        if (this._out)
            return;
        this._wait = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REST_MS, () => {
            this._wait = 0;
            if (this.hover && !this._out)
                this._onHover(true);
            return GLib.SOURCE_REMOVE;
        });
    }
}
