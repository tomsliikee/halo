// The Dynamic Island: rests as the clock and grows out of it, downwards,
// when something happens (PDF pages 4 and 5). Sources put activities in
// with set() and take them out with remove(); the island picks what shows
// (rank.js), keeps short hints for their time, holds them while the
// pointer is on them, and puts the second lasting thing into a bubble.
//
// An activity: {id, kind, hint, duration (ms, hints only), view (a builder
// of views.js), large (the builder of its opened look), data, and what a
// click does: onClick, onStop, onPlay, onPrevious, onNext, onAction}.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {expressive, spring, SPRINGS, stretch} from '../shared/choreo.js';
import {palette} from '../shared/palettes.js';
import {setScheme} from '../shared/theme.js';
import {pick, shownWhileLocked} from './rank.js';
import {IslandShape} from './shape.js';
import * as Views from './views.js';

// A hint lasts this long unless it says otherwise.
export const HINT_MS = 2500;
// A hint the pointer rests on stays; this often it looks again.
const HOLD_MS = 600;
const BUBBLE_GAP = 8;
const BUBBLE = 56;
// Below the bar, where the island hangs when there is no clock to grow from.
const FALLBACK_TOP = 8;

const BUILDERS = {
    level: Views.levelView,
    symbol: Views.symbolView,
    info: Views.infoView,
    timer: Views.timerView,
    recording: Views.recordingView,
    mediaCompact: Views.mediaCompactView,
    mediaLarge: Views.mediaLargeView,
    notification: Views.notificationView,
    call: Views.callView,
};

export class Island {
    // anchor(): {x (centre), y (top), width, height, visible} of the clock
    // the island rests on; onClock(): the resting island was clicked.
    constructor({theme, settings, anchor, onClock}) {
        this._theme = theme;
        this._settings = settings;
        this._anchor = anchor;
        this._onClock = onClock;
        this._activities = new Map();
        this._dismissed = new Set();
        this._focus = null;
        this._expanded = null;
        this._shown = null;
        this._bubbleShown = null;
        this._view = null;
        this._bubbleView = null;
        this._rest = {date: '', time: '', unread: false, open: false};
        this._expiry = 0;
        this._pressed = 0;
        this._locked = false;

        this._shape = new IslandShape({name: 'haloIsland'});
        this._bubble = new IslandShape({name: 'haloIslandBubble'});
        this._bubble.set_pivot_point(0.5, 0.5);
        for (const shape of [this._shape, this._bubble]) {
            Main.layoutManager.addTopChrome(shape);
            shape.connect('button-press-event', (_actor, event) => {
                this._pressed = event.get_button();
                spring(shape, {scale_x: 0.97, scale_y: 0.97}, {spring: SPRINGS.press});
                return Clutter.EVENT_STOP;
            });
            shape.connect('button-release-event', (_actor, event) => {
                const button = this._pressed;
                this._pressed = 0;
                spring(shape, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.release});
                if (button && button === event.get_button())
                    this._clicked(shape, button);
                return Clutter.EVENT_STOP;
            });
            shape.connect('notify::hover', () => this._holdChanged());
        }
        this._shape.set_pivot_point(0.5, 0);
        // At shutdown the stage may go before Halo is disabled.
        this._gone = false;
        for (const shape of [this._shape, this._bubble])
            shape.connect('destroy', () => (this._gone = true));
        this._shape.connect('moved', () => this._placeBubble());
        this._bubble.hide();

        this._theme.connectObject('changed', () => this._paint(), this);
        this._paint();
        this._render({animate: false});
    }

    // Whether an event of a kind may open the island (Halo's settings).
    allows(event) {
        return this._settings.current.islandEvents[event] !== false;
    }

    // The id of the activity shown in its large look, or null.
    get expanded() {
        return this._expanded;
    }

    has(id) {
        return this._activities.has(id);
    }

    // Puts an activity in, or replaces the one with its id.
    set(activity) {
        const before = this._activities.get(activity.id);
        const entry = {...activity, at: before && !activity.hint ? before.at : Date.now()};
        if (entry.hint)
            entry.until = Date.now() + (entry.duration ?? HINT_MS);
        // Something that comes again after it was dismissed is new.
        if (!before)
            this._dismissed.delete(entry.id);
        this._activities.set(entry.id, entry);
        this._render();
        this._scheduleExpiry();
    }

    remove(id) {
        if (!this._activities.delete(id))
            return;
        this._dismissed.delete(id);
        if (this._expanded === id)
            this._expanded = null;
        if (this._focus === id)
            this._focus = null;
        this._render();
        this._scheduleExpiry();
    }

    // On the lock screen what someone says or works on stays out; see
    // shownWhileLocked.
    setLocked(locked) {
        if (locked === this._locked)
            return;
        this._locked = locked;
        this._expanded = null;
        this._focus = null;
        this._render();
    }

    // What the resting island shows: {date, time, unread, open}.
    setRest(rest) {
        this._rest = rest;
        if (this._gone)
            return;
        if (this._shown === null && this._view?.update)
            this._view.update(rest);
        if (this._shown === null)
            this._render();
    }

    // The anchor moved: the bar relaid out, came or went. The island goes
    // with it at once; only a resting island changes its size.
    relayout() {
        if (this._gone)
            return;
        const place = this._place();
        this._shape.setAnchor(place.x, place.y);
        if (this._shown !== null)
            return;
        this._shape.visible = place.visible;
        this._shape.reactive = place.visible;
        if (place.width && (this._shape.boxWidth !== place.width || this._shape.boxHeight !== place.height)) {
            this._view?.actor.set_size(place.width, place.height);
            this._shape.resize(place.width, place.height, {animate: false});
        }
    }

    destroy() {
        if (this._expiry)
            GLib.source_remove(this._expiry);
        this._expiry = 0;
        this._theme.disconnectObject(this);
        if (!this._gone) {
            this._shape.destroy();
            this._bubble.destroy();
        }
        this._gone = true;
        this._activities.clear();
    }

    _pick() {
        return pick(shownWhileLocked([...this._activities.values()], this._locked), this._dismissed, this._focus);
    }

    _paint() {
        if (this._gone)
            return;
        const key = `${this._theme.colour}-dark`;
        const color = palette(this._theme.colour, 'dark').highest;
        for (const shape of [this._shape, this._bubble]) {
            setScheme(shape, key);
            shape.setColor(color);
        }
    }

    // Where the island hangs: from the clock while the bar shows it, else
    // just below the top of the main monitor.
    _place() {
        const anchor = this._anchor();
        if (anchor?.visible)
            return anchor;
        const monitor = Main.layoutManager.primaryMonitor;
        return {
            x: anchor?.x ?? monitor.x + monitor.width / 2,
            y: anchor?.fallbackY ?? monitor.y + FALLBACK_TOP,
            width: anchor?.width ?? 0, height: anchor?.height ?? 0, visible: false,
        };
    }

    _render({animate = true} = {}) {
        if (this._gone)
            return;
        const {main, bubble} = this._pick();
        const place = this._place();
        this._shape.setAnchor(place.x, place.y);

        if (!main) {
            // Resting: the clock, or nothing where there is no clock.
            this._expanded = null;
            if (this._shown !== null || !this._view) {
                this._shown = null;
                this._viewKey = 'rest';
                this._view = Views.restView(this._rest);
                this._shape.setContent(this._view.actor, {width: place.width, height: place.height, animate});
            } else {
                this._view.update?.(this._rest);
                this._view.actor.remove_style_class_name('halo-island-open');
                if (this._rest.open)
                    this._view.actor.add_style_class_name('halo-island-open');
                if (place.width && (this._shape.boxWidth !== place.width || this._shape.boxHeight !== place.height)) {
                    this._view.actor.set_size(place.width, place.height);
                    this._shape.resize(place.width, place.height, {animate});
                }
            }
            this._shape.visible = place.visible;
            this._shape.reactive = place.visible;
        } else {
            const key = this._expanded === main.id && main.large ? main.large : main.view;
            this._shape.visible = true;
            this._shape.reactive = true;
            if (this._shown === main.id && this._viewKey === key && this._view?.update) {
                this._view.update(main);
                this._fit(animate);
            } else {
                this._shown = main.id;
                this._viewKey = key;
                this._view = BUILDERS[key](main);
                this._shape.setContent(this._view.actor, {animate});
            }
        }
        this._renderBubble(main ? bubble : null);
    }

    // A view that changed what it holds may want another size.
    _fit(animate) {
        const actor = this._view.actor;
        const [, w] = actor.get_preferred_width(-1);
        const [, h] = actor.get_preferred_height(w);
        if (Math.round(w) === Math.round(actor.width) && Math.round(h) === Math.round(actor.height))
            return;
        actor.set_size(Math.round(w), Math.round(h));
        this._shape.resize(Math.round(w), Math.round(h), {animate});
    }

    _renderBubble(bubble) {
        const shape = this._bubble;
        if (!bubble) {
            if (this._bubbleShown !== null) {
                this._bubbleShown = null;
                this._bubbleView = null;
                spring(shape, {scale_x: 0.4, scale_y: 0.4, opacity: 0}, {spring: SPRINGS.leave, onDone: () => shape.hide()});
            }
            return;
        }
        if (this._bubbleShown === bubble.id) {
            this._bubbleView?.update?.(bubble);
            return;
        }
        const first = this._bubbleShown === null;
        this._bubbleShown = bubble.id;
        this._bubbleView = Views.bubbleView(bubble);
        shape.show();
        shape.setContent(this._bubbleView.actor, {width: BUBBLE, height: BUBBLE, animate: !first});
        this._placeBubble();
        if (first) {
            if (expressive()) {
                // The size may swing past; the opacity only fades.
                shape.set({scale_x: 0.4, scale_y: 0.4, opacity: 0});
                spring(shape, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.pop, delay: 120});
                shape.ease({opacity: 255, delay: stretch(120), duration: stretch(160), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            } else {
                shape.set({scale_x: 1, scale_y: 1, opacity: 255});
            }
        }
    }

    // The bubble keeps beside the island while the island swings.
    _placeBubble() {
        if (this._gone)
            return;
        const main = this._shape;
        const top = main.y + Math.max(0, Math.min(main.boxHeight, 56) - BUBBLE) / 2;
        this._bubble.setAnchor(main.x + main.boxWidth + BUBBLE_GAP + BUBBLE / 2, top);
    }

    _clicked(shape, button) {
        const {main, bubble} = this._pick();
        if (shape === this._bubble) {
            // The bubble's thing takes the island; what was there moves aside.
            if (bubble) {
                this._focus = bubble.id;
                this._render();
            }
            return;
        }
        if (button === Clutter.BUTTON_SECONDARY) {
            this._collapse(main);
            return;
        }
        if (button !== Clutter.BUTTON_PRIMARY)
            return;
        if (!main) {
            this._onClock?.();
            return;
        }
        if (main.large && this._expanded !== main.id) {
            this._expanded = main.id;
            this._render();
            return;
        }
        if (main.onClick) {
            main.onClick();
            if (main.hint)
                this.remove(main.id);
            return;
        }
        if (main.large && this._expanded === main.id) {
            this._expanded = null;
            this._render();
        }
    }

    // A right click: an open island closes to its small look, a small one
    // gives way to what comes next.
    _collapse(main) {
        if (!main)
            return;
        if (this._expanded === main.id) {
            this._expanded = null;
        } else if (main.hint) {
            main.onDismiss?.();
            this._activities.delete(main.id);
        } else {
            this._dismissed.add(main.id);
            if (this._focus === main.id)
                this._focus = null;
        }
        this._render();
        this._scheduleExpiry();
    }

    _holdChanged() {
        this._scheduleExpiry();
    }

    _scheduleExpiry() {
        if (this._expiry)
            GLib.source_remove(this._expiry);
        this._expiry = 0;
        if (this._gone)
            return;
        const hints = [...this._activities.values()].filter(activity => activity.hint);
        if (hints.length === 0)
            return;
        const next = Math.min(...hints.map(activity => activity.until));
        const wait = Math.max(this._shape.hover ? HOLD_MS : 0, next - Date.now());
        this._expiry = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(16, wait), () => {
            this._expiry = 0;
            this._expire();
            return GLib.SOURCE_REMOVE;
        });
    }

    _expire() {
        if (this._gone)
            return;
        const now = Date.now();
        const {main} = this._pick();
        let changed = false;
        for (const activity of [...this._activities.values()]) {
            if (!activity.hint || activity.until > now)
                continue;
            // The pointer holds what it rests on, and a hint that waits for
            // an answer (a critical notification) stays until it gets one.
            if ((activity === main && this._shape.hover) || activity.sticky) {
                activity.until = now + HOLD_MS;
                continue;
            }
            activity.onExpire?.();
            this._activities.delete(activity.id);
            changed = true;
        }
        if (changed)
            this._render();
        this._scheduleExpiry();
    }
}
