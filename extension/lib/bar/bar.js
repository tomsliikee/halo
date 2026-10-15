// One monitor's bar: a frame (none for islands) and three groups. The left
// group holds the workspace pill and the focused app, the centre the date
// and the clock, the right the keyboard layout, what records or listens,
// and the status pill. It draws what it is given in update() and calls
// back on clicks; it reads nothing by itself.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {expressive, spring, SPRINGS, stopSprings} from '../shared/choreo.js';
import {icon, setIcon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {setScheme} from '../shared/theme.js';
import {cornerRadius, frameRect, groupHeight, groupPositions, groupY, strutHeight} from './layout.js';
import {batteryIcon, batteryLow, elapsedText, layoutText, networkIcon, percentText, volumeIcon} from './words.js';

const DOT = 10;
const CURRENT_DOT = 26;

export class Bar {
    // callbacks: {onWorkspace(index), onOverview(), onScroll(step), onClock(actor),
    //             onStatus(actor), onKeyboard(), onStopRecording()}
    constructor(monitorIndex, theme, callbacks) {
        this.monitorIndex = monitorIndex;
        this._theme = theme;
        this._callbacks = callbacks;
        this._settings = null;
        this._state = null;
        this._relayoutId = 0;
        this._placed = false;
        this._hiddenForFullscreen = false;

        // Takes the work area off the top; the bar itself floats in it.
        this._strut = new St.Widget({name: 'haloStrut', reactive: false});
        Main.layoutManager.addChrome(this._strut, {affectsStruts: true});

        this.actor = new St.Widget({name: 'haloBar', style_class: 'halo-bar', reactive: false});
        Main.layoutManager.addChrome(this.actor);
        this.actor.connect('destroy', () => {
            this.actor = null;
        });

        this._frame = new St.Widget({style_class: 'halo-frame'});
        this.actor.add_child(this._frame);

        this._left = new St.BoxLayout({style_class: 'halo-group', y_align: Clutter.ActorAlign.CENTER});
        this._centre = new St.BoxLayout({style_class: 'halo-group', y_align: Clutter.ActorAlign.CENTER});
        this._right = new St.BoxLayout({style_class: 'halo-group', y_align: Clutter.ActorAlign.CENTER});
        for (const group of [this._left, this._centre, this._right]) {
            group.set_pivot_point(0.5, 0.5);
            // A group that grows or shrinks moves the others.
            group.connect('notify::width', () => this._queueRelayout());
            this.actor.add_child(group);
        }

        this._buildLeft();
        this._buildCentre();
        this._buildRight();

        this._theme.connectObject('changed', () => this._paint(), this);
        this._paint();
    }

    // The pill the quick settings and the notification center open from.
    get statusPill() {
        return this._status;
    }

    get clockPill() {
        return this._clock;
    }

    // The island rests over the clock: the clock makes room for its pill
    // and steps back behind it.
    setIslandClock(on) {
        if (on)
            this._clock.add_style_class_name('halo-island-clock');
        else
            this._clock.remove_style_class_name('halo-island-clock');
        this._clock.opacity = on ? 0 : 255;
        this._clock.reactive = !on;
    }

    // Whether the bar is out of sight over a fullscreen window.
    get hidden() {
        return !this.actor?.visible || (this.actor?.translation_y ?? 0) < -1;
    }

    setSettings(settings) {
        const before = this._settings;
        this._settings = settings;
        const layoutChanged = !before || before.barLayout !== settings.barLayout || before.floating !== settings.floating;
        this._paint();
        if (this._state)
            this._fill(this._state);
        this._place({animated: Boolean(before) && layoutChanged});
    }

    update(state) {
        this._state = state;
        if (!this._settings)
            return;
        this._fill(state);
        this._queueRelayout();
    }

    // Hides the bar over a fullscreen window, or brings it back.
    setFullscreen(fullscreen) {
        const hide = fullscreen && this._settings?.hideInFullscreen;
        if (hide === this._hiddenForFullscreen)
            return;
        this._hiddenForFullscreen = hide;
        this._reveal(!hide);
    }

    // Shows the bar for a while over a fullscreen window: the pointer rests
    // at the top edge.
    peek(show) {
        if (!this._hiddenForFullscreen)
            return;
        this._reveal(show);
    }

    // The bar grows out of its middle: a pill that spreads, then the groups
    // pop in, left to right.
    intro() {
        if (!this.actor || !expressive() || !this._frameTarget)
            return;
        const target = this._frameTarget;
        if (target.frame) {
            const mid = target.frame.x + target.frame.width / 2;
            this._frame.set({x: mid - target.frame.height / 2, width: target.frame.height, opacity: 0});
            spring(this._frame, {opacity: 255}, {spring: SPRINGS.press});
            spring(this._frame, {x: target.frame.x, width: target.frame.width}, {spring: SPRINGS.spread});
        }
        [this._left, this._centre, this._right].forEach((group, index) => {
            group.set({opacity: 0, scale_x: 0.6, scale_y: 0.6});
            spring(group, {opacity: 255}, {spring: SPRINGS.press, delay: 120 + index * 60});
            spring(group, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.pop, delay: 120 + index * 60});
        });
    }

    destroy() {
        if (this._relayoutId)
            GLib.source_remove(this._relayoutId);
        this._relayoutId = 0;
        this._theme.disconnectObject(this);
        this._strut.destroy();
        this.actor?.destroy();
    }

    // Building

    _buildLeft() {
        this._workspaces = new St.BoxLayout({style_class: 'halo-pill', y_align: Clutter.ActorAlign.CENTER});
        this._dots = new St.BoxLayout({style_class: 'halo-dots', y_align: Clutter.ActorAlign.CENTER});
        this._overviewBox = new St.BoxLayout({style_class: 'halo-group', y_align: Clutter.ActorAlign.CENTER, visible: false});
        this._overviewIcon = icon('grid-view', {size: 20, fill: true});
        this._overviewLabel = text('bar-app', {text: 'Overview'});
        this._overviewBox.add_child(this._overviewIcon);
        this._overviewBox.add_child(this._overviewLabel);
        this._workspaces.add_child(this._dots);
        this._workspaces.add_child(this._overviewBox);
        pressable(this._workspaces, event => {
            const dot = this._dotAt(event);
            if (dot !== null && !this._state?.overview)
                this._callbacks.onWorkspace(dot);
            else
                this._callbacks.onOverview();
        });
        this._left.add_child(this._workspaces);

        this._app = new St.BoxLayout({style_class: 'halo-plain', y_align: Clutter.ActorAlign.CENTER});
        this._appIcon = new St.Icon({style_class: 'halo-app-icon', icon_size: 20});
        this._appName = text('bar-app', {styleClass: 'halo-app-name'});
        this._app.add_child(this._appIcon);
        this._app.add_child(this._appName);
        this._left.add_child(this._app);

        this._left.reactive = true;
        this._left.connect('scroll-event', (_actor, event) => this._scrolled(event));
    }

    _buildCentre() {
        this._clock = new St.BoxLayout({style_class: 'halo-plain', y_align: Clutter.ActorAlign.CENTER});
        this._date = text('bar-date', {styleClass: 'halo-date'});
        this._time = text('bar-time', {styleClass: 'halo-time'});
        this._unread = new St.Widget({style_class: 'halo-unread', y_align: Clutter.ActorAlign.CENTER});
        this._clock.add_child(this._date);
        this._clock.add_child(this._time);
        this._clock.add_child(this._unread);
        pressable(this._clock, () => this._callbacks.onClock(this._clock));
        this._centre.add_child(this._clock);
    }

    _buildRight() {
        this._keyboard = text('bar-chip', {styleClass: 'halo-kbd'});
        const keyboardBox = new St.BoxLayout({style_class: 'halo-plain', y_align: Clutter.ActorAlign.CENTER});
        keyboardBox.add_child(this._keyboard);
        pressable(keyboardBox, () => this._callbacks.onKeyboard());
        this._keyboardBox = keyboardBox;
        this._right.add_child(keyboardBox);

        this._recording = new St.BoxLayout({style_class: 'halo-small-pill halo-recording', y_align: Clutter.ActorAlign.CENTER});
        this._recording.add_child(icon('stop-circle', {size: 20, fill: true}));
        this._recordingTime = text('bar-status', {styleClass: 'halo-status-text'});
        this._recording.add_child(this._recordingTime);
        pressable(this._recording, () => this._callbacks.onStopRecording());
        this._right.add_child(this._recording);

        this._mic = this._privacyPill('mic');
        this._camera = this._privacyPill('videocam');
        this._sharing = this._privacyPill('screen-share');

        this._status = new St.BoxLayout({style_class: 'halo-pill halo-status', y_align: Clutter.ActorAlign.CENTER});
        this._networkIcon = icon('wifi', {size: 20});
        this._vpnIcon = icon('vpn-key', {size: 20});
        this._bluetoothIcon = icon('bluetooth', {size: 20});
        this._volumeIcon = icon('volume-up', {size: 20, fill: true});
        this._batteryIcon = icon('battery-android-full', {size: 20, fill: true});
        this._batteryText = text('bar-status', {styleClass: 'halo-status-text'});
        for (const child of [this._networkIcon, this._vpnIcon, this._bluetoothIcon, this._volumeIcon, this._batteryIcon, this._batteryText])
            this._status.add_child(child);
        pressable(this._status, () => this._callbacks.onStatus(this._status));
        this._right.add_child(this._status);
    }

    _privacyPill(name) {
        const pill = new St.Bin({
            style_class: 'halo-round-pill halo-privacy',
            child: icon(name, {size: 20, fill: true}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._right.add_child(pill);
        return pill;
    }

    // Filling

    _fill(state) {
        const settings = this._settings;
        const full = settings.barLayout === 'full';

        // Workspaces, or "Overview" while the overview is open.
        this._setDots(state.workspaces.count, state.workspaces.active);
        this._dots.visible = !state.overview;
        this._overviewBox.visible = state.overview;
        this._setActive(this._workspaces, state.overview);

        const app = full && !state.overview ? state.apps[this.monitorIndex] : null;
        this._app.visible = Boolean(app);
        if (app) {
            this._appIcon.gicon = app.gicon;
            this._appName.text = app.name;
        }

        this._date.text = full || settings.barLayout === 'islands' ? state.date : state.dateShort;
        this._time.text = state.time;
        this._unread.visible = state.unread;
        this._setActive(this._clock, state.clockOpen);

        this._keyboard.text = layoutText(state.keyboard);
        this._keyboardBox.visible = Boolean(state.keyboard);
        this._recording.visible = state.recordingSeconds !== null;
        if (state.recordingSeconds !== null)
            this._recordingTime.text = elapsedText(state.recordingSeconds);
        this._mic.visible = state.microphone;
        this._camera.visible = state.camera;
        this._sharing.visible = state.screenSharing;

        const network = networkIcon(state.network.icon);
        this._networkIcon.visible = Boolean(network);
        if (network)
            setIcon(this._networkIcon, network);
        this._vpnIcon.visible = state.network.vpn;
        this._bluetoothIcon.visible = state.bluetooth;
        setIcon(this._volumeIcon, volumeIcon(state.volumeIcon), true);
        this._volumeIcon.visible = Boolean(state.volumeIcon);
        const battery = state.battery;
        this._batteryIcon.visible = Boolean(battery);
        this._batteryText.visible = Boolean(battery);
        if (battery) {
            setIcon(this._batteryIcon, batteryIcon(battery.percent, battery.charging), true);
            this._batteryText.text = percentText(battery.percent);
            const low = batteryLow(battery.percent, battery.charging);
            for (const actor of [this._batteryIcon, this._batteryText]) {
                if (low)
                    actor.add_style_class_name('halo-low');
                else
                    actor.remove_style_class_name('halo-low');
            }
        }
        this._setActive(this._status, state.statusOpen);
    }

    _setActive(actor, active) {
        if (active)
            actor.add_style_class_name('halo-active');
        else
            actor.remove_style_class_name('halo-active');
    }

    // One dot per workspace; the current one is long and the change glides.
    _setDots(count, active) {
        const dots = this._dots.get_children();
        if (dots.length !== count) {
            this._dots.destroy_all_children();
            for (let i = 0; i < count; i++) {
                const dot = new St.Widget({style_class: 'halo-dot', y_align: Clutter.ActorAlign.CENTER});
                dot.width = i === active ? CURRENT_DOT : DOT;
                if (i === active)
                    dot.add_style_class_name('halo-current');
                this._dots.add_child(dot);
            }
            this._activeDot = active;
            return;
        }
        if (this._activeDot === active)
            return;
        this._activeDot = active;
        dots.forEach((dot, i) => {
            const current = i === active;
            if (current)
                dot.add_style_class_name('halo-current');
            else
                dot.remove_style_class_name('halo-current');
            const width = current ? CURRENT_DOT : DOT;
            if (dot.width !== width)
                spring(dot, {width}, {spring: SPRINGS.glide});
        });
    }

    _dotAt(event) {
        const [x] = event.get_coords();
        const dots = this._dots.get_children();
        for (let i = 0; i < dots.length; i++) {
            const [dx] = dots[i].get_transformed_position();
            const [dw] = dots[i].get_transformed_size();
            // Half the gap on each side belongs to the dot.
            if (x >= dx - 3 && x <= dx + dw + 3)
                return i;
        }
        return null;
    }

    _scrolled(event) {
        const now = GLib.get_monotonic_time();
        // One step per flick of a touchpad, not one per event.
        if (now - (this._lastScroll ?? 0) < 250000)
            return Clutter.EVENT_STOP;
        let step = 0;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            step = -1;
            break;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            step = 1;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
            if (Math.abs(delta) > 0.3)
                step = Math.sign(delta);
            break;
        }
        }
        if (step !== 0) {
            this._lastScroll = now;
            this._callbacks.onScroll(step);
        }
        return Clutter.EVENT_STOP;
    }

    // Looks

    _paint() {
        if (!this.actor)
            return;
        setScheme(this.actor, this._theme.key);
        const settings = this._settings;
        if (!settings)
            return;
        const islands = settings.barLayout === 'islands';
        for (const group of [this._left, this._centre, this._right]) {
            if (islands)
                group.add_style_class_name('halo-island-group');
            else
                group.remove_style_class_name('halo-island-group');
            if (islands && settings.seeThrough)
                group.add_style_class_name('halo-see-through');
            else
                group.remove_style_class_name('halo-see-through');
        }
        if (settings.seeThrough)
            this._frame.add_style_class_name('halo-see-through');
        else
            this._frame.remove_style_class_name('halo-see-through');
        if (settings.floating)
            this._frame.remove_style_class_name('halo-flat');
        else
            this._frame.add_style_class_name('halo-flat');
    }

    _queueRelayout() {
        if (this._relayoutId)
            return;
        this._relayoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._relayoutId = 0;
            this._place({animated: true});
            return GLib.SOURCE_REMOVE;
        });
    }

    // Puts the strut, the frame and the groups where the layout wants them.
    _place({animated}) {
        const monitor = Main.layoutManager.monitors[this.monitorIndex];
        const settings = this._settings;
        if (!monitor || !settings || !this.actor)
            return;
        const {floating, barLayout} = settings;
        const strut = strutHeight(floating);
        this._strut.set({x: monitor.x, y: monitor.y, width: monitor.width, height: strut});
        this.actor.set({x: monitor.x, y: monitor.y, width: monitor.width, height: strut});

        const frame = frameRect(monitor.width, barLayout, floating);
        const height = groupHeight(barLayout);
        const sizes = {};
        for (const [name, group] of [['left', this._left], ['centre', this._centre], ['right', this._right]]) {
            group.height = height;
            sizes[name] = group.get_preferred_width(height)[1];
        }
        const positions = groupPositions(monitor.width, frame, sizes, floating);
        const y = groupY(floating, barLayout);
        this._frameTarget = {frame};

        this._frame.visible = Boolean(frame);
        if (frame) {
            this._frame.set_style(`border-radius: ${cornerRadius(frame.corners, 22)};`);
            this._frame.set({y: frame.y, height: frame.height});
            this._move(this._frame, {x: frame.x, width: frame.width}, animated && this._placed);
        }
        for (const [name, group] of [['left', this._left], ['centre', this._centre], ['right', this._right]]) {
            group.y = y;
            this._move(group, {x: positions[name]}, animated && this._placed);
        }
        this._placed = true;
    }

    _move(actor, to, animated) {
        if (animated)
            spring(actor, to, {spring: SPRINGS.spread});
        else {
            stopSprings(actor, Object.keys(to));
            actor.set(to);
        }
    }

    _reveal(show) {
        if (!this.actor)
            return;
        const height = strutHeight(this._settings?.floating ?? true);
        if (show)
            this.actor.show();
        spring(this.actor, {translation_y: show ? 0 : -height}, {
            spring: show ? SPRINGS.rise : SPRINGS.leave,
            onDone: () => {
                if (!show && this._hiddenForFullscreen)
                    this.actor?.hide();
            },
        });
    }
}
