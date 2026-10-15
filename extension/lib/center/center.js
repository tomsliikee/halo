// Halo's notification center (PDF page 6): a wide card under the clock,
// the notifications on the left with "Clear all" and Do not disturb, the
// month, today's events, the weather and a world clock on the right. It
// springs open from the clock; a click outside or Escape closes it.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {expressive, spring, SPRINGS, stopSprings, stretch} from '../shared/choreo.js';
import {icon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {setScheme} from '../shared/theme.js';
import {HaloSwitch} from '../qs/controls.js';
import {NotificationList} from './list.js';
import {SidePanel} from './side.js';

export const WIDTH = 840;
const MAX_HEIGHT = 760;
const MARGIN = 8;
const FADE_MS = 140;
const STAGGER_MS = 40;

export class CenterPanel {
    // ctx: {theme, model, agenda, weather, anchor() → {x, top}}; onOpen(open)
    // tells the bar.
    constructor(ctx, onOpen) {
        this._ctx = ctx;
        this._onOpen = onOpen;
        this._grab = null;
        this._tick = 0;
        this.isOpen = false;
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});

        this.actor = new St.Widget({name: 'haloCenter', reactive: true, visible: false});
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.connect('button-press-event', (_actor, event) => this._pressOutside(event));
        this.actor.connect('touch-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.TOUCH_BEGIN)
                return this._pressOutside(event);
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });

        this._card = new St.BoxLayout({style_class: 'halo-center', reactive: true, width: WIDTH});
        this._card.set_pivot_point(0.5, 0);
        this.actor.add_child(this._card);

        // Left: the notifications
        const title = text('qs-page', {styleClass: 'halo-center-heading', text: 'Notifications'});
        title.x_expand = true;
        this._clear = new St.Bin({style_class: 'halo-center-clear', child: text('qs-link', {text: 'Clear all'}), accessible_name: 'Clear all'});
        pressable(this._clear, () => ctx.model.clearAll(), {focus: true});
        const head = new St.BoxLayout({style_class: 'halo-center-head'});
        head.add_child(title);
        head.add_child(this._clear);
        this._list = new NotificationList({model: ctx.model, close: () => this.close()});
        this._listScroll = new St.ScrollView({style_class: 'halo-center-scroll', x_expand: true, y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, child: this._list.actor});
        this._dnd = new HaloSwitch({theme: ctx.theme, accessibleName: 'Do not disturb',
            onToggle: on => this._notifications.set_boolean('show-banners', !on)});
        const dndWords = text('qs-row', {styleClass: 'halo-center-title', text: 'Do not disturb'});
        dndWords.x_expand = true;
        const dnd = new St.BoxLayout({style_class: 'halo-center-dnd'});
        dnd.add_child(icon('do-not-disturb-on', {size: 20, fill: true, styleClass: 'halo-center-dnd-icon'}));
        dnd.add_child(dndWords);
        dnd.add_child(this._dnd);
        pressable(dnd, () => this._notifications.set_boolean('show-banners', !this._notifications.get_boolean('show-banners')), {scale: 0.98});
        this._left = new St.BoxLayout({style_class: 'halo-center-left', vertical: true, x_expand: true});
        for (const child of [head, this._listScroll, dnd])
            this._left.add_child(child);
        this._card.add_child(this._left);

        // Right: the day
        this._side = new SidePanel({
            agenda: ctx.agenda, weather: ctx.weather, close: () => this.close(),
            twelveHour: () => this._interface.get_string('clock-format') === '12h',
        });
        this._sideScroll = new St.ScrollView({style_class: 'halo-center-scroll halo-center-side-scroll',
            hscrollbar_policy: St.PolicyType.NEVER, child: this._side.actor});
        this._card.add_child(this._sideScroll);

        ctx.model.connectObject('changed', () => this._syncClear(), this);
        this._notifications.connectObject('changed::show-banners', () => this._syncDnd(true), this);
        ctx.theme.connectObject('changed', () => setScheme(this.actor, ctx.theme.key), this);
        setScheme(this.actor, ctx.theme.key);
        Main.layoutManager.connectObject('system-modal-opened', () => this.close({animated: false}), this);
        this._syncDnd(false);
        this._syncClear();
    }

    get sections() {
        return [this._left, this._sideScroll];
    }

    toggle() {
        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        if (this.isOpen)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        this._grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
        this.isOpen = true;
        this._onOpen(true);

        this.actor.set_position(0, 0);
        this.actor.set_size(global.stage.width, global.stage.height);
        const {x, top} = this._ctx.anchor();
        const width = Math.min(WIDTH, monitor.width - 2 * MARGIN);
        const left = Math.max(monitor.x + MARGIN, Math.min(monitor.x + monitor.width - width - MARGIN, Math.round(x - width / 2)));
        this._card.set({x: left, y: top, width, height: Math.min(MAX_HEIGHT, monitor.y + monitor.height - top - MARGIN)});

        this._syncDnd(false);
        this._list.opened();
        this._ctx.model.acknowledgeAll();
        this._side.opened();
        this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._list.rebuild();
            this._side.refresh();
            return GLib.SOURCE_CONTINUE;
        });

        this.actor.show();
        this.actor.grab_key_focus();
        stopSprings(this._card);
        this._card.remove_all_transitions();
        if (expressive()) {
            this._card.set({scale_x: 0.9, scale_y: 0.9, translation_y: -14, opacity: 0});
            spring(this._card, {scale_x: 1, scale_y: 1, translation_y: 0}, {spring: SPRINGS.rise});
            this._card.ease({opacity: 255, duration: stretch(FADE_MS), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            this.sections.forEach((section, i) => {
                section.set({opacity: 0, translation_y: 16});
                spring(section, {translation_y: 0}, {spring: SPRINGS.pop, delay: 50 + i * STAGGER_MS});
                section.ease({opacity: 255, delay: stretch(50 + i * STAGGER_MS), duration: stretch(FADE_MS), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            });
        } else {
            this._card.set({scale_x: 1, scale_y: 1, translation_y: 0, opacity: 255});
            this.sections.forEach(section => section.set({opacity: 255, translation_y: 0}));
        }
    }

    close({animated = true} = {}) {
        if (!this.isOpen)
            return;
        this.isOpen = false;
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        this._onOpen(false);
        this._ctx.agenda.showToday();
        stopSprings(this._card);
        if (!animated || !expressive()) {
            this.actor.hide();
            return;
        }
        // Hidden even when the fade is cut short: a stage-sized catcher left
        // behind would take every click, on the lock screen too.
        this._card.ease({
            opacity: 0, scale_x: 0.95, scale_y: 0.95, translation_y: -8,
            duration: stretch(FADE_MS), mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onStopped: () => {
                if (!this.isOpen)
                    this.actor.hide();
            },
        });
    }

    destroy() {
        this.close({animated: false});
        this._ctx.model.disconnectObject(this);
        this._ctx.theme.disconnectObject(this);
        this._notifications.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._list.destroy();
        this._side.destroy();
        this.actor.destroy();
    }

    _syncDnd(animated) {
        this._dnd.set(!this._notifications.get_boolean('show-banners'), {animated});
    }

    _syncClear() {
        this._clear.visible = this._ctx.model.count > 0;
    }

    _pressOutside(event) {
        if (!this.isOpen) {
            this.actor.hide();
            return Clutter.EVENT_PROPAGATE;
        }
        const target = global.stage.get_event_actor(event);
        if (target && this._card.contains(target))
            return Clutter.EVENT_PROPAGATE;
        this.close();
        return Clutter.EVENT_STOP;
    }
}
