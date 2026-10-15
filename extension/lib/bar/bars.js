// The bars on all monitors and what they show: workspaces, the focused app,
// the clock, and the system state. One state is worked out for all bars;
// each bar picks what belongs to its monitor.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {symbolFor} from '../shared/symbols.js';
import {Bar} from './bar.js';
import {strutHeight} from './layout.js';

const HARBOR_SETTINGS = GLib.build_filenamev([GLib.get_user_config_dir(), 'harbor', 'settings.json']);
// The pointer rests this long at the top edge before a hidden bar comes.
const PEEK_MS = 300;

// The symbols chosen in Harbor's dock, so an app looks the same there and here.
function harborSymbols() {
    try {
        const [, bytes] = GLib.file_get_contents(HARBOR_SETTINGS);
        const symbols = JSON.parse(new TextDecoder().decode(bytes))?.symbols;
        return symbols && typeof symbols === 'object' && !Array.isArray(symbols) ? symbols : {};
    } catch {
        return {};
    }
}

export class Bars {
    // menus: {onClock(actor), onStatus(actor)}: who opens what from the bar;
    // onRebuilt() after the bars were made anew, onState(state) after each
    // update, for the island resting on the clock.
    constructor(theme, system, menus) {
        this._theme = theme;
        this._system = system;
        this._menus = menus;
        this._settings = null;
        this._bars = [];
        this._open = {clock: false, status: false};
        this._symbols = harborSymbols();
        this._tick = 0;
        this._peekId = 0;
        this._islandClock = false;
        this._nextEvent = null;

        this._clock = new GnomeDesktop.WallClock();
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._clock.connectObject('notify::clock', () => this._update(), this);
        this._interface.connectObject('changed::clock-format', () => this._update(), this);
        this._system.connectObject('changed', () => {
            this._syncRecordingTick();
            this._update();
        }, this);
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._update(),
            'notify::n-workspaces', () => this._update(), this);
        Shell.WindowTracker.get_default().connectObject('notify::focus-app', () => this._update(), this);
        global.display.connectObject(
            'notify::focus-window', () => this._update(),
            'in-fullscreen-changed', () => this._syncFullscreen(), this);
        // The pill turns at once, not after the overview's own animation.
        this._overview = Main.overview.visible;
        Main.overview.connectObject(
            'showing', () => {
                this._overview = true;
                this._update();
            },
            'hiding', () => {
                this._overview = false;
                this._update();
            }, this);
        Main.layoutManager.connectObject('monitors-changed', () => this._rebuild(), this);
        Main.sessionMode.connectObject('updated', () => this._update(), this);

        this._edge = new St.Widget({name: 'haloEdge', reactive: true, height: 1});
        Main.layoutManager.addTopChrome(this._edge);
        this._edge.connect('enter-event', () => this._edgeEntered());
        this._edge.hide();
    }

    get all() {
        return this._bars;
    }

    // The bar on the primary monitor, where the menus open.
    get primary() {
        return this._bars.find(bar => bar.monitorIndex === Main.layoutManager.primaryIndex) ?? this._bars[0];
    }

    setSettings(settings) {
        const first = !this._settings;
        this._settings = settings;
        if (first) {
            this._rebuild();
            for (const bar of this._bars)
                bar.intro();
            return;
        }
        for (const bar of this._bars)
            bar.setSettings(settings);
        this._syncFullscreen();
        this._update();
    }

    // The island rests over the main bar's clock.
    setIslandClock(on) {
        this._islandClock = on;
        for (const bar of this._bars)
            bar.setIslandClock(on && bar === this.primary);
    }

    // The island hangs below the bar: the main bar shows its own clock
    // meanwhile.
    setIslandDropped(dropped) {
        this._islandDropped = dropped;
        this.primary?.setIslandDropped(dropped);
    }

    // Something is docked in the island's clock: the main bar's clock pill
    // takes its width (0: its own) so the groups move apart.
    setIslandDock(width) {
        this._islandDock = width;
        this.primary?.setIslandDock(width);
    }

    // {summary, text} of the next event shown as a chip beside the clock, or null.
    setNextEvent(event) {
        if (JSON.stringify(event) === JSON.stringify(this._nextEvent))
            return;
        this._nextEvent = event;
        this._update();
    }

    // name: "clock" or "status"; the pill shows the open state.
    setOpen(name, open) {
        this._open[name] = open;
        this._update();
    }

    destroy() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        if (this._peekId)
            GLib.source_remove(this._peekId);
        this._peekId = 0;
        this._clock.disconnectObject(this);
        this._clock = null;
        this._interface.disconnectObject(this);
        this._system.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        Shell.WindowTracker.get_default().disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._edge.destroy();
        for (const bar of this._bars)
            bar.destroy();
        this._bars = [];
    }

    _rebuild() {
        for (const bar of this._bars)
            bar.destroy();
        this._bars = Main.layoutManager.monitors.map((_monitor, index) => new Bar(index, this._theme, {
            onWorkspace: workspace => global.workspace_manager.get_workspace_by_index(workspace)?.activate(global.get_current_time()),
            onOverview: () => Main.overview.toggle(),
            onScroll: step => this._scrollWorkspace(step),
            onClock: actor => this._menus.onClock(actor),
            onStatus: actor => this._menus.onStatus(actor),
            onKeyboard: () => this._system.nextKeyboardLayout(),
            onStopRecording: () => this._system.stopRecording(),
        }));
        for (const bar of this._bars)
            bar.setSettings(this._settings);
        this.setIslandClock(this._islandClock);
        this.setIslandDock(this._islandDock ?? 0);
        this.setIslandDropped(Boolean(this._islandDropped));
        this._syncFullscreen();
        this._update();
        this._menus.onRebuilt?.();
    }

    _scrollWorkspace(step) {
        const manager = global.workspace_manager;
        const index = Math.max(0, Math.min(manager.n_workspaces - 1, manager.get_active_workspace_index() + step));
        manager.get_workspace_by_index(index)?.activate(global.get_current_time());
    }

    // The recording pill counts seconds; nothing else in the bar needs a tick.
    _syncRecordingTick() {
        const recording = this._system.recordingSeconds !== null;
        if (recording && !this._tick) {
            this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!recording && this._tick) {
            GLib.source_remove(this._tick);
            this._tick = 0;
        }
    }

    _state() {
        const now = GLib.DateTime.new_now_local();
        const twelve = this._interface.get_string('clock-format') === '12h';
        const manager = global.workspace_manager;
        const focusWindow = global.display.focus_window;
        const focusApp = Shell.WindowTracker.get_default().focus_app;
        // The focused app shows on the monitor of its window only.
        const apps = {};
        if (focusApp && focusWindow) {
            apps[focusWindow.get_monitor()] = {
                name: focusApp.get_name(),
                gicon: symbolFor(focusApp, this._symbols) ?? focusApp.get_icon(),
            };
        }
        return {
            workspaces: {count: manager.n_workspaces, active: manager.get_active_workspace_index()},
            apps,
            overview: this._overview,
            date: now.format('%a %-d %b'),
            dateShort: now.format('%a %-d'),
            time: twelve ? now.format('%-l:%M %p') : now.format('%H:%M'),
            unread: this._system.unread,
            keyboard: this._system.keyboardLayout,
            recordingSeconds: this._system.recordingSeconds,
            microphone: this._system.microphone,
            camera: this._system.camera,
            screenSharing: this._system.screenSharing,
            network: this._system.network,
            bluetooth: this._system.bluetooth,
            volumeIcon: this._system.volumeIcon,
            battery: this._system.battery,
            event: this._nextEvent,
            clockOpen: this._open.clock,
            statusOpen: this._open.status,
            locked: Main.sessionMode.isLocked,
        };
    }

    _update() {
        if (!this._settings)
            return;
        const state = this._state();
        for (const bar of this._bars)
            bar.update(state);
        this._menus.onState?.(state);
    }

    _syncFullscreen() {
        let any = false;
        for (const bar of this._bars) {
            const fullscreen = Boolean(Main.layoutManager.monitors[bar.monitorIndex]?.inFullscreen);
            bar.setFullscreen(fullscreen);
            any ||= fullscreen && this._settings?.hideInFullscreen;
        }
        const primary = Main.layoutManager.primaryMonitor;
        this._edge.visible = any;
        if (primary)
            this._edge.set({x: primary.x, y: primary.y, width: primary.width});
    }

    // The pointer at the top edge over a fullscreen window: after a rest,
    // the bar comes down and goes again when the pointer leaves it.
    _edgeEntered() {
        if (this._peekId)
            GLib.source_remove(this._peekId);
        this._peekId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PEEK_MS, () => {
            this._peekId = 0;
            const [, y] = global.get_pointer();
            const primary = Main.layoutManager.primaryMonitor;
            if (primary && y <= primary.y + 2)
                this._peek();
            return GLib.SOURCE_REMOVE;
        });
    }

    _peek() {
        const bar = this.primary;
        bar?.peek(true);
        const height = strutHeight(this._settings.floating);
        // Leaves again once the pointer is below the bar.
        this._peekId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            const [, y] = global.get_pointer();
            const primary = Main.layoutManager.primaryMonitor;
            if (primary && y > primary.y + height) {
                this._peekId = 0;
                bar?.peek(false);
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }
}
