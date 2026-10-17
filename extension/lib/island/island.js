// The Dynamic Island: rests as the clock and grows out of it, downwards,
// when something happens (PDF pages 4 and 5). Sources put activities in
// with set() and take them out with remove(); the island picks what shows
// (rank.js), keeps short hints for their time, holds them while the
// pointer is on them, and puts the second lasting thing into a bubble.
//
// An activity: {id, kind, hint, duration (ms, hints only), view (a builder
// of views.js), large (the builder of its opened look), data, and what a
// click does: onOpen (its app's window), onClick, onStop, onPlay, onPrevious, onNext, onAction; and
// onScroll(steps) for a scroll up (+) or down (-) on it}.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {isSwipeUp, restShown} from '../bar/modes.js';
import {expressive, spring, SPRINGS, stretch} from '../shared/choreo.js';
import {islandScheme, palette} from '../shared/palettes.js';
import {setScheme} from '../shared/theme.js';
import {Handle} from './handle.js';
import {accumulate, pick, placement, scrollIntent, shownWhileLocked} from './rank.js';
import {IslandShape, MAX_RADIUS} from './shape.js';
import * as Views from './views.js';

// A hint lasts this long unless it says otherwise.
export const HINT_MS = 2500;
// A hint the pointer rests on stays; this often it looks again.
const HOLD_MS = 600;
const BUBBLE_GAP = 8;
// The height of a compact look, which the bubble centres on.
const COMPACT = 60;
// The pointer rests this long on a small look before it shows more.
const PEEK_MS = 300;
// After a swap, a swipe's remaining motion does not swap back.
const SWAP_PAUSE_MS = 450;
// Room the island grows by on each side while the pointer is on a small
// look: wider more than longer, the content keeps its size.
const HOVER_X = 18;
const HOVER_Y = 6;
// The pencil circle while the center is open.
const EDIT = 36;
// Below the bar, where the island hangs when there is no clock to grow from.
const FALLBACK_TOP = 8;
// Something running drops below the bar this long before it rises into the
// clock.
const INTRO_MS = HINT_MS;
// What the island shows hangs this far lower than the resting clock, so it
// reaches a little further into the window below. The resting clock and
// what is docked in it stay centred in the bar.
const OPEN_DROP = 6;
// In "handle" mode the island goes back into the grip this long after the
// pointer left both.
const HANDLE_LEAVE_MS = 400;
const HANDLE_POLL_MS = 100;
// How far two fingers go up, in scroll steps, to send the island away.
const SWIPE_STEPS = 1.5;
// Above the screen, where the island waits while it is away.
const AWAY_GAP = 24;

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
    // the island rests on; onClock(): the resting clock was clicked;
    // onSettings(): the pencil circle was, while the center is open;
    // onDock(width): the clock's pill should be this wide for what is docked
    // in it, or 0 for its own width; onDrop(dropped): the island left the
    // clock for below the bar, or came back.
    // glance(): [{icon, text}] the resting clock shows below itself under
    // the pointer (weather, the next event).
    constructor({theme, settings, anchor, onClock, onSettings, onDock, onDrop, glance = () => []}) {
        this._glance = glance;
        this._theme = theme;
        this._settings = settings;
        this._anchor = anchor;
        this._onClock = onClock;
        this._onSettings = onSettings;
        this._onDock = onDock;
        this._onDrop = onDrop;
        this._dropped = false;
        this._dockWidth = 0;
        this._docked = false;
        this._dockWait = 0;
        this._activities = new Map();
        this._dismissed = new Set();
        this._focus = null;
        this._expanded = null;
        this._shown = null;
        this._fill = '#000000';
        this._bubbleShown = null;
        this._bubbleSize = 0;
        this._view = null;
        this._bubbleView = null;
        this._rest = {date: '', time: '', unread: false, open: false};
        this._expiry = 0;
        this._pressed = 0;
        this._locked = false;
        this._outside = 0;
        // "island" mode: a swipe up sent the clock away until then.
        this._swipedUntil = 0;
        this._swipeWait = 0;
        // "handle" mode: the pointer brought the island out of the grip.
        this._handleOpen = false;
        this._handleLeave = 0;
        this._handle = null;
        this._press = null;
        this._grab = null;

        this._shape = new IslandShape({name: 'haloIsland'});
        this._bubble = new IslandShape({name: 'haloIslandBubble'});
        this._bubble.set_pivot_point(0.5, 0.5);
        for (const shape of [this._shape, this._bubble]) {
            Main.layoutManager.addTopChrome(shape);
            shape.connect('button-press-event', (_actor, event) => {
                this._pressed = event.get_button();
                const [x, y] = event.get_coords();
                this._press = {x, y};
                // Held until let go, also off the shape: a drag up may leave it.
                this._grab?.dismiss();
                this._grab = global.stage.grab(shape);
                spring(shape, {scale_x: 0.97, scale_y: 0.97}, {spring: SPRINGS.press});
                return Clutter.EVENT_STOP;
            });
            shape.connect('button-release-event', (_actor, event) => {
                const button = this._pressed;
                const press = this._press;
                this._pressed = 0;
                this._press = null;
                this._grab?.dismiss();
                this._grab = null;
                spring(shape, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.release});
                const [x, y] = event.get_coords();
                if (press && shape === this._shape && isSwipeUp(x - press.x, y - press.y)) {
                    this._swipeAway();
                    return Clutter.EVENT_STOP;
                }
                if (button && button === event.get_button())
                    this._clicked(shape, button);
                return Clutter.EVENT_STOP;
            });
            shape.connect('notify::hover', () => this._holdChanged());
            shape.connect('scroll-event', (_actor, event) => this._scrolled(event));
        }
        this._scrollSum = {x: 0, y: 0};
        this._swappedAt = 0;
        this._peek = null;
        this._peekWait = 0;
        this._shape.connect('notify::hover', () => {
            this._peekChanged();
            this._handleHoverChanged();
        });
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

    // The id of the activity showing its preview line, or null.
    get peeking() {
        return this._peek;
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
        if (this._shown === null || this._docked)
            this._render();
    }

    // The settings changed: where the island hangs may too.
    refresh() {
        if (!this._gone)
            this._render();
    }

    // The mode in use: "bar", "island" or "handle". Without Halo's bar,
    // and on the lock screen, there is only "bar".
    get _mode() {
        const anchor = this._anchor();
        return anchor?.mode ?? 'bar';
    }

    // Whether the resting island (the clock, or what is docked in it)
    // shows now, or waits above the screen.
    _restShown(place = this._place()) {
        if (this._locked)
            return true;
        return restShown({
            mode: this._mode, barShown: Boolean(place.barDown), handleOpen: this._handleOpen,
            swipedUntil: this._swipedUntil, now: Date.now(),
        });
    }

    // "island" mode: a swipe up sends the clock island away for the time
    // set in Halo's settings; hints still come meanwhile.
    _swipeAway() {
        if (this._mode !== 'island' || this._locked)
            return;
        const {main} = this._pick();
        if (main && !this._docked)
            return;
        const ms = this._settings.current.islandHideSeconds * 1000;
        this._swipedUntil = Date.now() + ms;
        if (this._swipeWait)
            GLib.source_remove(this._swipeWait);
        this._swipeWait = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms + 16, () => {
            this._swipeWait = 0;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
        this._render();
    }

    // "handle" mode: the pointer rests on the grip or on the island that
    // came out of it; it goes back a moment after the pointer left both.
    // Looked at by where the pointer is: a shape that springs out past a
    // resting pointer is not always told about the hover.
    _handleHoverChanged() {
        if (this._gone || this._mode !== 'handle' || !this._handleOpen || this._handleLeave)
            return;
        let away = 0;
        this._handleLeave = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HANDLE_POLL_MS, () => {
            if (this._gone || !this._handleOpen || this._mode !== 'handle') {
                this._handleLeave = 0;
                return GLib.SOURCE_REMOVE;
            }
            const on = this._pointerOn(this._shape) || this._pointerOn(this._handle?.actor) || this._pointerOn(this._bubble);
            away = on ? 0 : away + HANDLE_POLL_MS;
            if (away < HANDLE_LEAVE_MS)
                return GLib.SOURCE_CONTINUE;
            this._handleLeave = 0;
            this._handleOpen = false;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Whether the pointer is on the island: St's hover, held to where the
    // pointer really is, since a shape that springs under or past a
    // resting pointer is not always told when it left.
    get _hovered() {
        return this._shape.hover && this._pointerOn(this._shape);
    }

    _pointerOn(actor) {
        if (!actor?.visible)
            return false;
        const [x, y] = global.get_pointer();
        const [ax, ay] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        return x >= ax && x < ax + w && y >= ay && y < ay + h;
    }

    _handleRested(on) {
        if (on && !this._handleOpen) {
            this._handleOpen = true;
            this._render();
        }
        this._handleHoverChanged();
    }

    // The grip shows in "handle" mode while the bar is away, with a dot
    // when something running waits in it.
    _syncHandle(place, running) {
        const wanted = this._mode === 'handle' && !this._locked;
        if (wanted && !this._handle) {
            this._handle = new Handle({onHover: on => this._handleRested(on)});
            this._handle.setColor(this._fill);
        } else if (!wanted && this._handle) {
            this._handle.destroy();
            this._handle = null;
            this._handleOpen = false;
        }
        this._handle?.sync({shown: !place.barDown, running});
    }

    // The resting clock as the center grows out of it and back:
    // {x, y, width, height, radius, color} on the stage, or null where the
    // island has no clock.
    restShape() {
        if (this._gone)
            return null;
        const place = this._place();
        if (!this._pick().main && !this._restShown(place)) {
            // Away: the center grows out of the grip, or rises by itself.
            const grip = this._handle?.rect;
            if (this._mode !== 'handle' || !grip)
                return null;
            return {...grip, radius: grip.height / 2, color: this._fill};
        }
        if (!place.visible || !place.width)
            return null;
        return {
            x: place.x - place.width / 2, y: place.y, width: place.width, height: place.height,
            radius: Math.min(place.height / 2, MAX_RADIUS), color: this._fill,
        };
    }

    // A press that a panel's grab took, at the island's place: the island
    // handles it as its own click (the pencil circle, an event shown while
    // the center is open). Returns whether it was on the island.
    pressAt(event) {
        if (this._gone)
            return false;
        const shape = this._shapeAt(event);
        if (!shape)
            return false;
        this._clicked(shape, event.get_button());
        return true;
    }

    // The island's shape or bubble under an event, or null.
    _shapeAt(event) {
        const [x, y] = event.get_coords();
        for (const shape of [this._shape, this._bubble]) {
            if (!shape.visible)
                continue;
            const [sx, sy] = shape.get_transformed_position();
            const [w, h] = shape.get_transformed_size();
            if (x >= sx && x < sx + w && y >= sy && y < sy + h)
                return shape;
        }
        return null;
    }

    // While a large look is open, a press anywhere else closes it to its
    // small look; the press still goes where it was meant to.
    _syncOutside() {
        const open = !this._gone && this._expanded !== null;
        if (open && !this._outside) {
            this._outside = global.stage.connect('captured-event', (_stage, event) => {
                if (event.type() === Clutter.EventType.BUTTON_PRESS && this._expanded !== null && !this._shapeAt(event)) {
                    this._expanded = null;
                    this._render();
                }
                return Clutter.EVENT_PROPAGATE;
            });
        } else if (!open && this._outside) {
            global.stage.disconnect(this._outside);
            this._outside = 0;
        }
    }

    // The size of the resting island: the clock's, or the pencil circle's
    // while the center is open.
    _restSize(place) {
        return this._rest.open ? {width: EDIT, height: EDIT} : {width: place.width, height: place.height};
    }

    // The anchor moved: the bar relaid out, came or went. The island goes
    // with it at once; only a resting island changes its size.
    relayout({force = false} = {}) {
        if (this._gone)
            return;
        const place = this._place();
        // Followed allocations come often; nothing to do where the clock
        // stayed on the same pixels.
        const key = [Math.round(place.x), Math.round(place.y), place.width, place.height, place.visible, place.dropY, place.barDown, place.mode].join(',');
        if (key === this._placeKey && !force)
            return;
        this._placeKey = key;
        // What hangs from the clock follows it at once; a mode or the bar
        // pushed down changes what shows.
        if (this._docked || place.mode !== this._placedMode || Boolean(place.barDown) !== this._placedDown) {
            this._render();
            return;
        }
        const main = this._pick().main;
        const where = this._placement(main);
        const away = this._away(main, where, place);
        this._shape.setAnchor(place.x, this._top(place, where, away, main));
        this._syncShown(place, main, away);
        if (this._shown !== null)
            return;
        const {width, height} = this._restSize(place);
        const glancing = this._viewKey?.startsWith('glance');
        if (width && !glancing && (this._shape.boxWidth !== width || this._shape.boxHeight !== height)) {
            this._view?.actor.set_size(width, height);
            this._shape.resize(width, height, {animate: false});
        }
    }

    // Shown and reactive: an activity always; the resting island where
    // there is a clock and it is not away.
    _syncShown(place, main = this._pick().main, away = false) {
        const on = main ? !away : place.visible && !away;
        this._shape.visible = main ? true : place.visible;
        this._setReactive(on);
    }

    // A shape that stops taking the pointer while under it gets no leave
    // event and would stay hovered; it lets go of the hover itself.
    _setReactive(on) {
        this._shape.reactive = on;
        if (!on && this._shape.hover)
            this._shape.hover = false;
    }

    destroy() {
        for (const source of [this._swipeWait, this._handleLeave]) {
            if (source)
                GLib.source_remove(source);
        }
        this._swipeWait = 0;
        this._handleLeave = 0;
        this._grab?.dismiss();
        this._grab = null;
        this._handle?.destroy();
        this._handle = null;
        if (this._dockWait)
            GLib.source_remove(this._dockWait);
        this._dockWait = 0;
        if (this._outside)
            global.stage.disconnect(this._outside);
        this._outside = 0;
        if (this._peekWait)
            GLib.source_remove(this._peekWait);
        this._peekWait = 0;
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
        const scheme = islandScheme(this._theme.scheme);
        const key = `${this._theme.colour}-${scheme}`;
        const color = palette(this._theme.colour, scheme).islandFill;
        this._fill = color;
        for (const shape of [this._shape, this._bubble]) {
            setScheme(shape, key);
            shape.setColor(color);
        }
        this._handle?.setColor(color);
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

    // Where the island is for what it shows: {drop, docked}. On the lock
    // screen and where there is no clock it stays as it was.
    _placement(main) {
        const place = this._place();
        const settings = this._settings.current;
        if (this._locked || !place.visible)
            return {drop: false, docked: false};
        const where = placement({
            main, expanded: this._expanded, dock: settings.islandDock,
            now: Date.now(), introMs: INTRO_MS,
        });
        // Without a bar there is nothing to drop below: everything hangs
        // where the clock would be.
        if (this._mode !== 'bar' && !place.barDown)
            return {drop: false, docked: where.docked};
        return where;
    }

    // Whether the island is away above the screen: the resting island or
    // what is docked in it, while its mode sends it away.
    _away(main, where, place) {
        return (!main || where.docked) && !this._restShown(place);
    }

    // The top the island hangs from: the clock's while it rests or docks,
    // a little lower while it shows something, below the bar when dropped,
    // or above the screen while away.
    _top(place, where = this._placement(this._pick().main), away = false, main = this._pick().main) {
        if (away) {
            const monitor = Main.layoutManager.primaryMonitor;
            return (monitor?.y ?? 0) - Math.max(this._shape.boxHeight, place.height || 36) - AWAY_GAP;
        }
        const top = where.drop ? place.dropY ?? place.y : place.y;
        return main && !where.docked ? top + OPEN_DROP : top;
    }

    // A running thing rises into the clock once its intro is over.
    _scheduleDock(main) {
        if (this._dockWait)
            GLib.source_remove(this._dockWait);
        this._dockWait = 0;
        if (!main || main.hint)
            return;
        const wait = main.at + INTRO_MS - Date.now();
        if (wait <= 0)
            return;
        this._dockWait = GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait + 16, () => {
            this._dockWait = 0;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    _render({animate = true} = {}) {
        if (this._gone)
            return;
        const {main, bubble} = this._pick();
        const place = this._place();
        const where = this._placement(main);
        const away = this._away(main, where, place);
        this._docked = where.docked;
        this._placedMode = place.mode;
        this._placedDown = Boolean(place.barDown);
        this._shape.setAnchor(place.x, this._top(place, where, away, main), {animate});
        this._syncHandle(place, away && Boolean(main));
        this._scheduleDock(main);
        this._syncPad(main, animate);
        let dockWidth = 0;

        if (main && where.docked) {
            // Docked: the clock's pill with the running thing beside the time.
            const key = `dock:${main.kind}:${main.id}`;
            this._shape.visible = true;
            this._setReactive(!away);
            if (this._shown === main.id && this._viewKey === key && this._view?.update) {
                this._view.update(main, this._rest);
            } else {
                this._shown = main.id;
                this._viewKey = key;
                this._view = Views.dockView(this._rest, main);
                this._shape.setContent(this._view.actor, {height: place.height, animate});
            }
            const [, w] = this._view.actor.get_preferred_width(place.height);
            const width = Math.max(Math.round(w), place.width);
            dockWidth = width;
            if (Math.round(this._view.actor.width) !== width) {
                this._view.actor.set_size(width, place.height);
                this._shape.resize(width, place.height, {animate});
            }
        } else if (!main) {
            // Resting: the clock, the pencil circle while the clock has
            // become the center, or nothing where there is no clock.
            this._expanded = null;
            const items = this._peek === 'rest' && !this._rest.open && !away ? this._glance() : [];
            const key = this._rest.open ? 'edit' : items.length > 0 ? `glance:${JSON.stringify(items)}` : 'rest';
            const {width, height} = this._restSize(place);
            if (this._shown !== null || !this._view || this._viewKey !== key) {
                this._shown = null;
                this._viewKey = key;
                if (items.length > 0) {
                    // As wide as it needs, never narrower than the clock.
                    this._view = Views.glanceView(this._rest, items);
                    this._view.actor.set_style(`min-width: ${width}px;`);
                    this._shape.setContent(this._view.actor, {animate});
                } else {
                    this._view = key === 'edit' ? Views.editView() : Views.restView(this._rest);
                    this._shape.setContent(this._view.actor, {width, height, animate});
                }
            } else if (items.length > 0) {
                this._view.update?.(this._rest);
            } else {
                this._view.update?.(this._rest);
                if (width && (this._shape.boxWidth !== width || this._shape.boxHeight !== height)) {
                    this._view.actor.set_size(width, height);
                    this._shape.resize(width, height, {animate});
                }
            }
            this._syncShown(place, null, away);
        } else {
            const base = this._expanded === main.id && main.large ? main.large : main.view;
            const peeking = this._peek === main.id && base === main.view && Boolean(main.data?.peek) && !this._locked;
            const key = peeking ? `${base}+peek` : base;
            this._shape.visible = true;
            this._shape.reactive = true;
            if (this._shown === main.id && this._viewKey === key && this._view?.update) {
                this._view.update(main);
                this._fit(animate);
            } else {
                this._shown = main.id;
                this._viewKey = key;
                this._view = peeking ? Views.withPeek(BUILDERS[base](main), main) : BUILDERS[base](main);
                this._shape.setContent(this._view.actor, {animate});
            }
        }
        // Beside the resting clock only a dismissed thing waits; while the
        // clock is the center the pencil circle is alone.
        const resting = away || (!main && (this._rest.open || !place.visible));
        const small = !main || where.docked;
        this._renderBubble(resting ? null : bubble, small ? place.height || Views.BUBBLE : Views.BUBBLE);
        this._syncDockWidth(dockWidth);
        this._syncOutside();
        if (where.drop !== this._dropped) {
            this._dropped = where.drop;
            this._onDrop?.(where.drop);
        }
    }

    // The clock's pill makes room for what is docked in it.
    _syncDockWidth(width) {
        if (width === this._dockWidth)
            return;
        this._dockWidth = width;
        this._onDock?.(width);
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

    _renderBubble(bubble, size) {
        const shape = this._bubble;
        if (!bubble) {
            if (this._bubbleShown !== null) {
                this._bubbleShown = null;
                this._bubbleSize = 0;
                this._bubbleView = null;
                spring(shape, {scale_x: 0.4, scale_y: 0.4, opacity: 0}, {spring: SPRINGS.leave, onDone: () => shape.hide()});
            }
            return;
        }
        if (this._bubbleShown === bubble.id && this._bubbleSize === size) {
            this._bubbleView?.update?.(bubble);
            return;
        }
        const first = this._bubbleShown === null;
        this._bubbleShown = bubble.id;
        this._bubbleSize = size;
        this._bubbleView = Views.bubbleView(bubble, size);
        shape.show();
        shape.setContent(this._bubbleView.actor, {width: size, height: size, animate: !first});
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
        const size = this._bubbleSize || Views.BUBBLE;
        // Centred on the compact part, which grows with the hover room.
        const extra = Math.max(0, main.boxHeight - main.innerHeight);
        const top = main.y + Math.max(0, Math.min(main.boxHeight, COMPACT + extra) - size) / 2;
        this._bubble.setAnchor(main.x + main.boxWidth + BUBBLE_GAP + size / 2, top);
    }

    _clicked(shape, button) {
        const {main, bubble} = this._pick();
        if (shape === this._bubble) {
            // The bubble's thing takes the island, also one that was
            // dismissed; what was there moves aside.
            if (bubble) {
                this._dismissed.delete(bubble.id);
                this._focus = bubble.id;
                this._render();
            }
            return;
        }
        if (button === Clutter.BUTTON_SECONDARY) {
            this._collapse(main);
            return;
        }
        if (button !== Clutter.BUTTON_PRIMARY && button !== Clutter.BUTTON_MIDDLE)
            return;
        if (!main) {
            if (button !== Clutter.BUTTON_PRIMARY)
                return;
            if (this._rest.open)
                this._onSettings?.();
            else
                this._onClock?.();
            return;
        }
        // Clicking opens the thing's app, or first its large look, as
        // chosen in Halo's settings; the middle button always opens the
        // large look.
        const opensApp = this._settings.current.islandClick === 'app' && main.onOpen;
        if (button === Clutter.BUTTON_MIDDLE || !opensApp) {
            if (main.large && this._expanded !== main.id) {
                this._expanded = main.id;
                this._render();
                return;
            }
        }
        if (button === Clutter.BUTTON_MIDDLE) {
            if (main.large && this._expanded === main.id) {
                this._expanded = null;
                this._render();
            }
            return;
        }
        // Its app, else what the thing does on a click; an opened look
        // without either closes.
        const open = main.onOpen ?? main.onClick;
        if (open) {
            open();
            if (main.hint)
                this.remove(main.id);
            return;
        }
        if (main.large && this._expanded === main.id) {
            this._expanded = null;
            this._render();
        }
    }

    // A scroll or a touchpad swipe: sideways swaps what shows with the
    // bubble; up and down go to what shows (activity.onScroll(steps)).
    _scrolled(event) {
        const {main, bubble} = this._pick();
        if (!main || this._docked) {
            // On the resting clock (and what is docked in it) a swipe up
            // with two fingers sends the island away in "island" mode.
            if (this._mode === 'island' && this._swipedUp(event))
                return Clutter.EVENT_STOP;
            if (!main)
                return Clutter.EVENT_PROPAGATE;
        }
        // A wheel click comes twice, once as a step and once as an
        // emulated smooth scroll; the step counts.
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;
        if (event.is_scroll_stop?.()) {
            this._scrollSum = {x: 0, y: 0};
            return Clutter.EVENT_STOP;
        }
        let dx = 0;
        let dy = 0;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.SMOOTH:
            [dx, dy] = event.get_scroll_delta();
            break;
        case Clutter.ScrollDirection.UP:
            dy = -1;
            break;
        case Clutter.ScrollDirection.DOWN:
            dy = 1;
            break;
        case Clutter.ScrollDirection.LEFT:
            dx = -1;
            break;
        case Clutter.ScrollDirection.RIGHT:
            dx = 1;
            break;
        }
        const shift = (event.get_state() & Clutter.ModifierType.SHIFT_MASK) !== 0;
        const {axis, amount} = scrollIntent(dx, dy, shift);
        const {sum, steps} = accumulate(this._scrollSum[axis], amount);
        this._scrollSum[axis] = sum;
        if (steps === 0)
            return Clutter.EVENT_STOP;
        if (axis === 'x') {
            const now = GLib.get_monotonic_time() / 1000;
            if (bubble && now - this._swappedAt > SWAP_PAUSE_MS) {
                this._swappedAt = now;
                this._scrollSum.x = 0;
                this._focus = bubble.id;
                this._render();
            }
        } else {
            main.onScroll?.(steps);
        }
        return Clutter.EVENT_STOP;
    }

    // Whether a touchpad swipe has gone far enough up to send the island
    // away; a wheel never does.
    _swipedUp(event) {
        if (event.get_scroll_direction() !== Clutter.ScrollDirection.SMOOTH || event.is_pointer_emulated())
            return false;
        if (event.is_scroll_stop?.()) {
            this._swipeSum = 0;
            return false;
        }
        const [dx, dy] = event.get_scroll_delta();
        if (Math.abs(dx) > Math.abs(dy))
            return false;
        // The fingers going up: with natural scrolling (GNOME's default
        // for touchpads) that scrolls down, without it up.
        this._touchpad ??= new Gio.Settings({schema_id: 'org.gnome.desktop.peripherals.touchpad'});
        const natural = this._touchpad.get_boolean('natural-scroll');
        this._swipeSum = (this._swipeSum ?? 0) + (natural ? dy : -dy);
        if (Math.abs(this._swipeSum) < SWIPE_STEPS)
            return dy !== 0;
        const up = this._swipeSum > 0;
        this._swipeSum = 0;
        if (up)
            this._swipeAway();
        return true;
    }

    // A right click: an open island closes to its small look, a small one
    // gives way to what comes next and waits in the bubble. On the resting
    // clock it brings back everything dismissed.
    _collapse(main) {
        if (!main) {
            if (this._dismissed.size > 0 && !this._rest.open) {
                this._dismissed.clear();
                this._render();
            }
            return;
        }
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

    // A small look under the pointer grows around itself; the clock, an
    // opened look and the lock screen stay as they are.
    _syncPad(main, animate = true) {
        const on = Boolean(main) && this._hovered && !this._locked && !this._docked && !(this._expanded === main.id && main.large);
        this._shape.setPad(on ? HOVER_X : 0, on ? HOVER_Y : 0, {animate});
    }

    // The pointer came onto the island or left it: at once it grows a
    // little; after a moment a small look shows its preview line; leaving
    // takes both away.
    _peekChanged() {
        if (!this._gone)
            this._syncPad(this._pick().main);
        if (this._peekWait)
            GLib.source_remove(this._peekWait);
        this._peekWait = 0;
        if (this._gone)
            return;
        if (!this._hovered) {
            if (this._peek !== null) {
                this._peek = null;
                this._render();
            }
            return;
        }
        this._peekWait = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PEEK_MS, () => {
            this._peekWait = 0;
            const {main} = this._pick();
            if (this._gone || !this._hovered)
                return GLib.SOURCE_REMOVE;
            if (main) {
                this._peek = main.id;
                this._render();
            } else if (!this._rest.open && !this._locked && this.allows('glance')) {
                // The resting clock shows what the weather and the day hold.
                this._peek = 'rest';
                this._render();
            }
            return GLib.SOURCE_REMOVE;
        });
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
        const wait = Math.max(this._hovered ? HOLD_MS : 0, next - Date.now());
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
            if ((activity === main && this._hovered) || activity.sticky) {
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
