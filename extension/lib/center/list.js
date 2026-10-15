// The notification list of the center (PDF page 6): one card per app and
// conversation. A card with more messages opens to show them; actions are
// pills; a card follows the pointer sideways and goes when it is swiped
// far enough, or springs back. While the pointer is on a card, a close
// button takes the place of its time.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {expressive, spring, SPRINGS, stopSprings, stretch} from '../shared/choreo.js';
import {icon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {agoText, swipeDismisses} from './words.js';

// A press that moves less than this is a click, not a swipe.
const CLICK_PX = 6;
const STAGGER_MS = 50;
// The cards come once the center's card shows (center.js REVEAL_MS).
const INTRO_MS = 320;
const INTRO_FADE_MS = 240;

function box(styleClass, {vertical = false, children = [], ...params} = {}) {
    const actor = new St.BoxLayout({style_class: styleClass, vertical, ...params});
    for (const child of children.filter(Boolean))
        actor.add_child(child);
    return actor;
}

function ago(time) {
    return agoText(Math.max(0, (Date.now() - time) / 1000));
}

function pill(label, onClick, {main = false, tonal = false} = {}) {
    const actor = new St.Bin({
        style_class: `halo-center-action${main ? ' halo-center-action-main' : ''}${tonal ? ' halo-center-action-tonal' : ''}`,
        child: text('island-action', {text: label}),
        y_align: Clutter.ActorAlign.CENTER,
    });
    actor.accessible_name = label;
    pressable(actor, () => onClick(), {focus: true});
    return actor;
}

function wrapping(label, lines = 2) {
    label.clutter_text.line_wrap = true;
    label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    // St has no line count; a height cap of about `lines` lines does it.
    label.style = `max-height: ${lines * 20}px;`;
    return label;
}

export class NotificationList {
    // ctx: {model, close()}: the model, and closing the center after a click.
    constructor(ctx) {
        this._ctx = ctx;
        this._expanded = new Set();
        this._fresh = new Set();
        // What came after this was not in the center yet. The island may
        // have shown it, so GNOME's "seen" does not tell.
        this._seenAt = Date.now();
        this.actor = new St.BoxLayout({style_class: 'halo-center-list', vertical: true, x_expand: true});
        this._empty = box('halo-center-empty', {
            vertical: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, y_expand: true,
            children: [icon('notifications', {size: 32, styleClass: 'halo-center-empty-icon'}), text('qs-row', {text: 'No notifications', styleClass: 'halo-center-dim'})],
        });
        this._model = ctx.model;
        this._times = [];
        this._later = 0;
        // Closed, nothing is built: opening builds it fresh.
        this._model.connectObject('changed', () => {
            if (this.actor.mapped)
                this.rebuild();
        }, this);
    }

    // A minute passed: the times say so; the cards stay as they are.
    refreshTimes() {
        for (const {label, time} of this._times)
            label.text = ago(time);
    }

    // The center opened: what came since it was last open is marked.
    opened() {
        // Notification times have whole seconds.
        const since = Math.floor(this._seenAt / 1000) * 1000;
        this._fresh = new Set(this._model.items.filter(item => item.time >= since).map(item => item.id));
        this._seenAt = Date.now() + 1000;
        this.rebuild({intro: true});
    }

    get cards() {
        return this.actor.get_children().filter(child => child !== this._empty);
    }

    rebuild({intro = false} = {}) {
        // A card held under the pointer stays; the change shows after.
        if (this._swiping) {
            this._pending = true;
            return;
        }
        this.actor.remove_all_children();
        for (const child of this._built ?? [])
            child.destroy();
        this._built = [];
        this._times = [];
        const groups = this._model.groups;
        if (groups.length === 0) {
            this.actor.add_child(this._empty);
            return;
        }
        groups.forEach((group, i) => {
            const card = this._card(group);
            this._built.push(card);
            this.actor.add_child(card);
            if (intro && expressive()) {
                card.set({opacity: 0, translation_y: 12});
                spring(card, {translation_y: 0}, {spring: SPRINGS.pop, delay: INTRO_MS + i * STAGGER_MS});
                card.ease({opacity: 255, delay: stretch(INTRO_MS + i * STAGGER_MS), duration: stretch(INTRO_FADE_MS), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            }
        });
    }

    destroy() {
        if (this._later)
            GLib.source_remove(this._later);
        this._later = 0;
        this._model.disconnectObject(this);
        this._empty.destroy();
        this.actor.destroy();
    }

    _card(group) {
        const [newest, ...older] = group.items;
        const expanded = this._expanded.has(group.key);
        const fresh = group.items.some(item => this._fresh.has(item.id));
        const card = box(`halo-center-card${fresh ? ' halo-fresh' : ''}`, {vertical: true, reactive: true, track_hover: true, x_expand: true});
        card.accessible_name = `${newest.app}: ${newest.title}`;

        const lead = new St.Bin({
            style_class: 'halo-center-icon',
            child: new St.Icon({gicon: newest.gicon ?? newest.appIcon, fallback_icon_name: 'dialog-information-symbolic', icon_size: newest.gicon ? 40 : 22}),
            y_align: Clutter.ActorAlign.START,
        });
        if (newest.gicon)
            lead.add_style_class_name('halo-center-picture');

        const app = text('qs-caption', {styleClass: 'halo-center-app', ellipsize: true, text: older.length > 0 ? `${newest.app} · ${group.items.length}` : newest.app});
        app.x_expand = true;
        const when = text('qs-caption', {styleClass: 'halo-center-dim', text: ago(newest.time)});
        this._times.push({label: when, time: newest.time});
        const close = new St.Bin({style_class: 'halo-center-close', child: icon('close', {size: 16}), visible: false, accessible_name: 'Dismiss'});
        pressable(close, () => this._dismiss(card, group), {focus: true});
        const header = box('halo-center-header', {children: [app, when, close]});
        const title = text('qs-tile', {styleClass: 'halo-center-title', ellipsize: true, text: newest.title || newest.app});
        const body = wrapping(text('body', {styleClass: 'halo-center-body', text: newest.body}), expanded ? 6 : 2);
        body.visible = Boolean(newest.body);
        const words = box('halo-center-words', {vertical: true, x_expand: true, children: [header, title, body]});

        // One action sits beside the words, as in the design; more get a row.
        const actions = newest.actions;
        const side = actions.length === 1 ? pill(actions[0].label, () => this._act(actions[0]), {tonal: true}) : null;
        card.add_child(box('halo-center-top', {children: [lead, words, side]}));

        if (older.length > 0 && expanded) {
            for (const item of older) {
                const line = text('body', {styleClass: 'halo-center-body', text: item.body || item.title});
                wrapping(line, 3);
                const time = text('qs-caption', {styleClass: 'halo-center-dim', text: ago(item.time)});
                this._times.push({label: time, time: item.time});
                const sub = box('halo-center-sub', {vertical: true, children: [line, time], reactive: true});
                pressable(sub, () => this._activate(item.notification), {scale: 0.98});
                card.add_child(sub);
            }
        }
        if (older.length > 0) {
            const more = pill(expanded ? 'Show less' : `${older.length} more`, () => {
                if (expanded)
                    this._expanded.delete(group.key);
                else
                    this._expanded.add(group.key);
                this.rebuild();
            });
            more.add_style_class_name('halo-center-more');
            card.add_child(box('halo-center-actions halo-center-more-row', {children: [more]}));
        }
        if (actions.length > 1) {
            const row = box('halo-center-actions');
            actions.slice(0, 3).forEach((action, i) => row.add_child(pill(action.label, () => this._act(action), {main: i === 0})));
            card.add_child(row);
        }

        card.connect('notify::hover', () => {
            close.visible = card.hover;
            when.visible = !card.hover;
        });
        this._swipeable(card, group, newest);
        return card;
    }

    _act(action) {
        action.activate();
        this._ctx.close();
    }

    _activate(notification) {
        notification.activate();
        this._ctx.close();
    }

    _dismiss(card, group, direction = 1) {
        stopSprings(card);
        const done = () => {
            for (const item of group.items) {
                if (!item.resident)
                    this._model.dismiss(item.notification);
            }
        };
        if (!expressive()) {
            done();
            return;
        }
        // Slides away and gives its room back; the list springs closed.
        card.ease({
            translation_x: direction * (card.width + 40), opacity: 0,
            duration: stretch(180), mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onComplete: () => {
                spring(card, {height: 0}, {spring: SPRINGS.leave, onDone: done});
            },
        });
    }

    // Follows the pointer sideways; a short press without moving is a click.
    _swipeable(card, group, newest) {
        let start = null;
        let grab = null;
        let last = null;
        card.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            const [x] = event.get_coords();
            start = x;
            last = {x, time: event.get_time()};
            grab = global.stage.grab(card);
            stopSprings(card, ['translation_x']);
            return Clutter.EVENT_STOP;
        });
        card.connect('motion-event', (_actor, event) => {
            if (start === null)
                return Clutter.EVENT_PROPAGATE;
            const [x] = event.get_coords();
            const offset = x - start;
            if (Math.abs(offset) > CLICK_PX)
                this._swiping = true;
            if (this._swiping) {
                card.translation_x = offset;
                card.opacity = Math.round(255 * Math.max(0.3, 1 - Math.abs(offset) / card.width));
            }
            last = {x, time: event.get_time(), speed: (x - last.x) / Math.max(1, event.get_time() - last.time)};
            return Clutter.EVENT_STOP;
        });
        const release = event => {
            if (start === null)
                return Clutter.EVENT_PROPAGATE;
            grab?.dismiss();
            grab = null;
            const [x] = event.get_coords();
            const offset = x - start;
            start = null;
            const swiped = this._swiping;
            this._swiping = false;
            if (!swiped) {
                this._activate(newest.notification);
                return Clutter.EVENT_STOP;
            }
            // A swipe that stopped before it was let go is no flick.
            const speed = last && event.get_time() - last.time < 100 ? last.speed ?? 0 : 0;
            if (swipeDismisses(offset, card.width, speed)) {
                this._dismiss(card, group, Math.sign(offset) || 1);
            } else {
                spring(card, {translation_x: 0}, {spring: SPRINGS.release});
                card.ease({opacity: 255, duration: stretch(140), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            }
            // Changes that came while it was held show now.
            if (this._pending) {
                this._pending = false;
                this._later ||= GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    this._later = 0;
                    if (!this._swiping)
                        this.rebuild();
                    return GLib.SOURCE_REMOVE;
                });
            }
            return Clutter.EVENT_STOP;
        };
        card.connect('button-release-event', (_actor, event) => release(event));
        card.connect('destroy', () => grab?.dismiss());
    }
}
