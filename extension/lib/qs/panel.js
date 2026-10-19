// Halo's quick settings: a card under the status pill on the main monitor.
// It springs open from the pill's corner, its sections rise in one after
// the other, and pages slide in from the side while the card's height
// springs to the new page. A click outside or Escape closes it; Escape on
// a page goes back first.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {expressive, spring, SPRINGS, stopSprings, stretch} from '../shared/choreo.js';
import {setScheme} from '../shared/theme.js';
import {MainPage} from './mainpage.js';
import {PAGES} from './pages.js';

export const WIDTH = 424;
const MARGIN = 8;
// The card's padding, as in the stylesheet.
const PAD = 14;
const SLIDE = 36;
const FADE_MS = 140;
const STAGGER_MS = 26;

export class QuickSettingsPanel {
    // ctx: {theme, settings, appearance, system, gnome, conflicts, top() → y under the bar}
    // onOpen(open) tells the bar.
    constructor(ctx, onOpen) {
        this._ctx = {
            ...ctx,
            navigate: (name, payload) => this.navigate(name, payload),
            back: () => this.back(),
            close: () => this.close(),
            refit: () => this._queueFit(),
        };
        this._onOpen = onOpen;
        this._grab = null;
        this._fitId = 0;
        this._stack = [];
        this.isOpen = false;

        this.actor = new St.Widget({name: 'haloQuickSettings', reactive: true, visible: false});
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.connect('button-press-event', (_actor, event) => this._pressOutside(event));
        this.actor.connect('touch-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.TOUCH_BEGIN)
                return this._pressOutside(event);
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('key-press-event', (_actor, event) => this._key(event));

        this._card = new St.BoxLayout({
            style_class: 'halo-qs',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            width: WIDTH,
        });
        this._card.set_pivot_point(1, 0);
        // Fades as one drawn texture, not label by label every frame.
        this._card.offscreen_redirect = Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY;
        this.actor.add_child(this._card);
        this._body = new St.Widget({layout_manager: new Clutter.BinLayout(), clip_to_allocation: true, x_expand: true});
        this._card.add_child(this._body);

        this._ctx.theme.connectObject('changed', () => setScheme(this.actor, this._ctx.theme.key), this);
        setScheme(this.actor, this._ctx.theme.key);
        Main.layoutManager.connectObject('system-modal-opened', () => this.close({animated: false}), this);
    }

    toggle(source) {
        if (this.isOpen)
            this.close();
        else
            this.open(source);
    }

    open(_source) {
        if (this.isOpen)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        // Built on first use, before the grab, so a failure cannot leave it.
        if (!this._main) {
            this._main = new MainPage(this._ctx);
            this._main.actor.connect('queue-relayout', () => this._queueFit());
        }
        this._grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
        this.isOpen = true;
        this._onOpen(true);

        // The whole stage catches clicks outside the card.
        this.actor.set_position(0, 0);
        this.actor.set_size(global.stage.width, global.stage.height);
        const top = this._ctx.top();
        this._card.set_position(monitor.x + monitor.width - WIDTH - MARGIN, top);
        this._maxBody = monitor.y + monitor.height - top - MARGIN - 2 * PAD;

        this._clearStack();
        this._show(this._main, 0, {animated: false});
        this._main.opened();

        this.actor.show();
        this.actor.grab_key_focus();
        stopSprings(this._card);
        this._card.remove_all_transitions();
        if (expressive()) {
            this._card.set({scale_x: 0.88, scale_y: 0.88, translation_y: -12, opacity: 0});
            spring(this._card, {scale_x: 1, scale_y: 1, translation_y: 0}, {spring: SPRINGS.rise});
            this._card.ease({opacity: 255, duration: stretch(FADE_MS), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            this._main.sections.forEach((section, i) => {
                section.set({opacity: 0, translation_y: 14});
                spring(section, {translation_y: 0}, {spring: SPRINGS.pop, delay: 40 + i * STAGGER_MS});
                section.ease({
                    opacity: 255,
                    delay: stretch(40 + i * STAGGER_MS),
                    duration: stretch(FADE_MS),
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            });
        } else {
            this._card.set({scale_x: 1, scale_y: 1, translation_y: 0, opacity: 255});
            this._main.sections.forEach(section => section.set({opacity: 255, translation_y: 0}));
        }
    }

    close({animated = true} = {}) {
        // A close still fading out ends now: on the lock screen no frame
        // may come to end it, and its stage-sized catcher would stay.
        if (!this.isOpen) {
            if (!animated && this.actor.visible) {
                this._card.remove_all_transitions();
                this.actor.hide();
            }
            return;
        }
        this.isOpen = false;
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
        this._onOpen(false);
        this._main?.closed();
        const done = () => {
            if (this.isOpen)
                return;
            this.actor.hide();
            this._clearStack();
        };
        stopSprings(this._card);
        if (!animated || !expressive()) {
            done();
            return;
        }
        this._card.ease({
            opacity: 0,
            scale_x: 0.94,
            scale_y: 0.94,
            translation_y: -8,
            duration: stretch(FADE_MS),
            mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            // Also when the fade is cut short: a stage-sized catcher left
            // behind would take every click, on the lock screen too.
            onStopped: done,
        });
    }

    // The settings changed: pages that show them follow.
    settingsChanged() {
        for (const page of this._stack)
            page.settingsChanged?.();
    }

    // A page by name (see pages.js), on top of the one shown.
    navigate(name, payload) {
        const make = PAGES[name];
        if (!make || !this.isOpen || (name === 'settings' && Main.sessionMode.isLocked))
            return;
        const page = make(this._ctx, payload);
        page.actor.connect('queue-relayout', () => this._queueFit());
        this._stack.push(page);
        this._show(page, 1);
    }

    back() {
        const page = this._stack.pop();
        if (!page)
            return;
        this._show(this._stack.at(-1) ?? this._main, -1, {leaving: page});
    }

    destroy() {
        this.close({animated: false});
        if (this._fitId)
            GLib.source_remove(this._fitId);
        this._fitId = 0;
        this._ctx.theme.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._main?.destroy();
        this._main = null;
        this.actor.destroy();
    }

    _clearStack() {
        for (const page of this._stack) {
            page.destroy();
        }
        this._stack = [];
        for (const child of this._body.get_children()) {
            if (child !== this._main?.actor)
                child.destroy();
        }
        if (this._main && this._main.actor.get_parent() !== this._body)
            this._body.add_child(this._main.actor);
        this._current = this._main ?? null;
    }

    // direction: 1 forward, -1 back, 0 at once.
    _show(page, direction, {animated = true, leaving = null} = {}) {
        const old = leaving ?? this._current;
        this._current = page;
        if (page.actor.get_parent() !== this._body)
            this._body.add_child(page.actor);
        page.actor.show();
        page.shown?.();
        const move = animated && direction !== 0 && expressive();

        if (old && old !== page) {
            const finish = () => {
                if (old === leaving)
                    old.destroy();
                else
                    old.actor.hide();
            };
            if (move) {
                old.actor.ease({
                    opacity: 0,
                    translation_x: -SLIDE * direction,
                    duration: stretch(FADE_MS),
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    onStopped: finish,
                });
            } else {
                finish();
            }
        }

        page.actor.remove_all_transitions();
        if (move) {
            page.actor.set({opacity: 0, translation_x: SLIDE * direction});
            spring(page.actor, {translation_x: 0}, {spring: SPRINGS.glide});
            page.actor.ease({opacity: 255, duration: stretch(FADE_MS + 40), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        } else {
            page.actor.set({opacity: 255, translation_x: 0});
        }
        this._fit({animated: move});
    }

    _queueFit() {
        if (this._fitId || !this.isOpen)
            return;
        this._fitId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._fitId = 0;
            this._fit({animated: true});
            return GLib.SOURCE_REMOVE;
        });
    }

    // The body takes the shown page's height, up to the screen's bottom.
    _fit({animated}) {
        if (!this._current)
            return;
        const [, natural] = this._current.actor.get_preferred_height(WIDTH - 2 * PAD);
        const height = Math.round(Math.min(natural, this._maxBody ?? natural));
        if (Math.abs(this._body.height - height) < 1 && this._body.height > 0)
            return;
        if (animated && this._body.height > 0) {
            // No scroll bar flashing up while the height springs.
            const pages = this._body.get_children();
            pages.forEach(page => (page.vscrollbar_policy = St.PolicyType.NEVER));
            spring(this._body, {height}, {
                spring: SPRINGS.glide,
                onDone: () => pages.forEach(page => (page.vscrollbar_policy = St.PolicyType.AUTOMATIC)),
            });
        } else {
            this._body.height = height;
        }
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

    _key(event) {
        if (event.get_key_symbol() !== Clutter.KEY_Escape)
            return Clutter.EVENT_PROPAGATE;
        if (this._stack.length > 0)
            this.back();
        else
            this.close();
        return Clutter.EVENT_STOP;
    }
}
