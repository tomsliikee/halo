// What each tile of the quick settings shows and does. A tile has a title,
// a note, an icon (Halo's by name, or a Gio.Icon of whoever owns it), an
// on state, and may lead to a page. Halo writes its own words for the
// system's tiles and only borrows GNOME's toggles to act; other
// extensions' tiles and GNOME's rarer ones are shown as they come.
//
// Every model emits "changed" when anything it shows changed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import NM from 'gi://NM';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {PopupMenuBase} from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {networkIcon} from '../bar/words.js';
import {clockText} from '../island/words.js';
import {isPaused, pausedNote, runningTimer} from '../shared/timers.js';
import {COLOUR_NAMES, PROFILES, bluetoothNote, darkNote, nightLightNote, onOff, orderTiles} from './words.js';

class Tile extends EventEmitter {
    constructor(id) {
        super();
        this.id = id;
        this.title = '';
        this.note = '';
        // Halo's icon by name, or a Gio.Icon.
        this.icon = 'settings';
        this.gicon = null;
        // An actor to show a live copy of, when there is no icon.
        this.drawn = null;
        this.active = false;
        this.visible = true;
        // The page the chevron opens: a name the panel knows, or null.
        this.page = null;
        // Whether a click on the tile itself switches it; when not, the
        // whole tile opens its page.
        this.switches = true;
    }

    activate() {}

    _set(values) {
        let changed = false;
        for (const [key, value] of Object.entries(values)) {
            if (this[key] !== value) {
                this[key] = value;
                changed = true;
            }
        }
        if (changed)
            this.emit('changed');
    }

    destroy() {
        this.disconnectAll();
    }
}

// Watches GObject notifications and calls update() on each.
class WatchingTile extends Tile {
    constructor(id) {
        super(id);
        this._watched = [];
    }

    _watch(object, signals) {
        if (!object)
            return;
        const args = signals.flatMap(signal => [signal, () => this.update()]);
        object.connectObject(...args, this);
        this._watched.push(object);
    }

    update() {}

    destroy() {
        for (const object of this._watched)
            object.disconnectObject(this);
        this._watched = [];
        super.destroy();
    }
}

class WifiTile extends WatchingTile {
    constructor(qs) {
        super('wifi');
        this.title = 'Wi‑Fi';
        this.page = 'wifi';
        this._toggle = qs._network?._wirelessToggle ?? null;
        this._watch(this._toggle, ['notify::checked', 'notify::subtitle', 'notify::icon-name', 'notify::visible']);
        this.update();
    }

    get client() {
        return this._toggle?._client ?? null;
    }

    // The Wi-Fi device in charge: the one GNOME's toggle shows.
    get deviceItem() {
        return this._toggle?._itemBinding?.source ?? null;
    }

    update() {
        const client = this.client;
        const on = Boolean(client?.wireless_enabled);
        const device = this.deviceItem?._device ?? null;
        let note = 'Off';
        if (on) {
            const state = device?.state ?? NM.DeviceState.UNKNOWN;
            if (state === NM.DeviceState.ACTIVATED)
                note = this.deviceItem.name;
            else if (state >= NM.DeviceState.PREPARE && state < NM.DeviceState.ACTIVATED)
                note = 'Connecting';
            else
                note = 'Not connected';
        }
        this._set({
            visible: Boolean(this._toggle?.visible),
            active: on,
            note,
            icon: on ? networkIcon(this._toggle?.icon_name) ?? 'wifi' : 'wifi-off',
        });
    }

    activate() {
        this._toggle?.activate();
    }
}

class BluetoothTile extends WatchingTile {
    constructor(qs) {
        super('bluetooth');
        this.title = 'Bluetooth';
        this.page = 'bluetooth';
        this._indicator = qs._bluetooth ?? null;
        this._toggle = this._indicator?.quickSettingsItems[0] ?? null;
        this._watch(this.client, ['devices-changed', 'notify::active']);
        this._watch(this._toggle, ['notify::visible', 'notify::checked']);
        this.update();
    }

    get client() {
        return this._indicator?._client ?? null;
    }

    get devices() {
        return this.client ? [...this.client.getDevices()] : [];
    }

    update() {
        const on = Boolean(this.client?.active);
        const connected = this.devices.filter(device => device.connected).map(device => device.alias);
        this._set({
            visible: Boolean(this._toggle?.visible),
            active: on,
            note: bluetoothNote(on, connected),
            icon: !on ? 'bluetooth-disabled' : connected.length > 0 ? 'bluetooth-connected' : 'bluetooth',
        });
    }

    activate() {
        this.client?.toggleActive();
    }
}

class PowerTile extends WatchingTile {
    constructor(qs) {
        super('power');
        this.title = 'Energy';
        this.page = 'energy';
        this._toggle = qs._powerProfiles?.quickSettingsItems[0] ?? null;
        this._watch(this._toggle, ['notify::checked', 'notify::subtitle', 'notify::visible']);
        this.update();
    }

    get proxy() {
        return this._toggle?._proxy ?? null;
    }

    update() {
        const profile = PROFILES[this.proxy?.ActiveProfile] ?? null;
        this._set({
            visible: Boolean(this._toggle?.visible),
            active: Boolean(this._toggle?.checked),
            note: profile?.title ?? 'Custom',
            icon: profile?.icon ?? 'bolt',
        });
    }

    activate() {
        this._toggle?.emit('clicked', 1);
    }
}

class NightLightTile extends WatchingTile {
    constructor() {
        super('nightLight');
        this.title = 'Night light';
        this.icon = 'nightlight';
        this._settings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});
        this._monitors = global.backend.get_monitor_manager();
        this._watch(this._settings, ['changed']);
        this._watch(this._monitors, ['notify::night-light-supported']);
        this.update();
    }

    update() {
        const on = this._settings.get_boolean('night-light-enabled');
        this._set({
            visible: this._monitors.night_light_supported,
            active: on,
            note: nightLightNote(on, this._settings.get_boolean('night-light-schedule-automatic'),
                this._settings.get_double('night-light-schedule-to')),
        });
    }

    activate() {
        this._settings.set_boolean('night-light-enabled', !this._settings.get_boolean('night-light-enabled'));
    }
}

class DoNotDisturbTile extends WatchingTile {
    constructor() {
        super('dnd');
        this.title = 'Do not disturb';
        this.icon = 'do-not-disturb-on';
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._watch(this._settings, ['changed::show-banners']);
        this.update();
    }

    update() {
        const on = !this._settings.get_boolean('show-banners');
        this._set({active: on, note: onOff(on)});
    }

    activate() {
        this._settings.set_boolean('show-banners', !this._settings.get_boolean('show-banners'));
    }
}

// The timer, the stopwatch and the pomodoro shared with Ledge. A tap
// pauses what runs or goes on with what was paused; nothing yet, it starts
// a pomodoro. The page holds the rest.
class TimerTile extends WatchingTile {
    constructor(store) {
        super('timer');
        this.title = 'Timer';
        this.icon = 'timer';
        this.page = 'timer';
        this.store = store;
        this._tick = 0;
        this._watch(store, ['changed']);
        this.update();
    }

    update() {
        const now = Date.now();
        const running = runningTimer(this.store.timers, now);
        this._set({
            active: Boolean(running),
            note: running ? clockText(running.shown, {countdown: running.countdown}) : pausedNote(this.store.timers),
        });
        if (running && !this._tick) {
            this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this.update();
                return this._tick ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
            });
        } else if (!running && this._tick) {
            GLib.source_remove(this._tick);
            this._tick = 0;
        }
    }

    activate() {
        const timers = this.store.timers;
        const running = runningTimer(timers, Date.now());
        if (running) {
            this.store.toggle(running.kind);
            return;
        }
        const paused = ['pomodoro', 'timer', 'stopwatch'].find(kind => isPaused(timers, kind));
        this.store.toggle(paused ?? 'pomodoro');
    }

    destroy() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        super.destroy();
    }
}

class VpnTile extends WatchingTile {
    constructor(qs) {
        super('vpn');
        this.title = 'VPN';
        this.icon = 'vpn-key';
        this.page = 'vpn';
        this.toggle = qs._network?._vpnToggle ?? null;
        this._watch(this.toggle, ['notify::checked', 'notify::subtitle', 'notify::visible']);
        this.update();
    }

    update() {
        const on = Boolean(this.toggle?.checked);
        this._set({
            visible: Boolean(this.toggle?.visible),
            active: on,
            note: on ? this.toggle.subtitle || 'On' : 'Off',
        });
    }

    activate() {
        this.toggle?.emit('clicked', 1);
    }
}

// Dark style and colour style belong to Halo; the panel passes what they need.
class DarkStyleTile extends Tile {
    constructor(appearance) {
        super('darkStyle');
        this.title = 'Dark style';
        this.icon = 'dark-mode';
        this._appearance = appearance;
        appearance.connectObject('changed', () => this.update(), this);
        this.update();
    }

    update() {
        const {style, dark} = this._appearance;
        this._set({active: dark, note: darkNote(style, dark)});
    }

    activate() {
        this._appearance.setStyle(this._appearance.dark ? 'light' : 'dark');
    }

    destroy() {
        this._appearance.disconnectObject(this);
        super.destroy();
    }
}

class ColourStyleTile extends Tile {
    constructor(appearance) {
        super('colourStyle');
        this.title = 'Colour style';
        this.icon = 'palette';
        this.page = 'appearance';
        this.switches = false;
        this.active = true;
        this._appearance = appearance;
        appearance.connectObject('changed', () => this.update(), this);
        this.update();
    }

    update() {
        this._set({note: COLOUR_NAMES[this._appearance.colour] ?? ''});
    }

    destroy() {
        this._appearance.disconnectObject(this);
        super.destroy();
    }
}

// A QuickToggle of GNOME or of another extension, shown in its own words.
// Its menu, if it has one, becomes the tile's page.
export class ToggleTile extends WatchingTile {
    constructor(id, toggle) {
        super(id);
        this.toggle = toggle;
        this._watch(toggle, [
            'notify::title', 'notify::subtitle', 'notify::checked', 'notify::visible',
            'notify::gicon', 'notify::icon-name', 'notify::menu-enabled',
        ]);
        this.update();
    }

    update() {
        const toggle = this.toggle;
        const gicon = toggle.gicon ?? (toggle.icon_name ? Gio.ThemedIcon.new(toggle.icon_name) : null);
        const hasMenu = Boolean(toggle.menu) && toggle.menuEnabled !== false && toggle.hasMenu;
        this._set({
            title: toggle.title || TILE_NAMES[this.id] || '',
            note: toggle.subtitle ?? '',
            active: Boolean(toggle.checked),
            visible: toggle.visible,
            gicon,
            page: hasMenu ? 'hosted' : null,
        });
    }

    // The menu that the page hosts.
    get menu() {
        return this.toggle.menu;
    }

    activate() {
        this.toggle.emit('clicked', 1);
    }
}

function firstOf(actor, type) {
    if (actor instanceof type && actor.visible)
        return actor;
    for (const child of actor.get_children?.() ?? []) {
        const found = firstOf(child, type);
        if (found)
            return found;
    }
    return null;
}

// A button of another extension's or an app's that sat in the top bar.
// Halo shows no foreign icons in its bar, so it becomes a tile: its icon,
// the extension's name, the text it showed as the note, and its menu as
// the page.
export class ButtonTile extends Tile {
    constructor(key, button) {
        super(`panel:${key}`);
        this.button = button;
        this.switches = false;
        this.page = this.menu ? 'hosted' : null;
        this.title = Main.extensionManager.lookup(key)?.metadata.name ??
            (button.accessible_name || key.replace(/@.*$/, '').replace(/^appindicator-/, ''));
        // The icon and text change while it runs; a look now and then is enough.
        this._poll = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 2, () => {
            this.update();
            return GLib.SOURCE_CONTINUE;
        });
        this.update();
    }

    // The button's menu; a button without one (it acts on a click) may
    // still keep a menu of its own, shown on a right-click.
    get menu() {
        if (this.button.menu?.box)
            return this.button.menu;
        return Object.values(this.button).find(value => value instanceof PopupMenuBase && value.box && !value.isEmpty()) ?? null;
    }

    update() {
        const shown = firstOf(this.button, St.Icon);
        const label = firstOf(this.button, St.Label);
        let gicon = shown?.gicon ?? (shown?.icon_name ? Gio.ThemedIcon.new(shown.icon_name) : null);
        // The same icon as a new object is no change.
        if (gicon && this.gicon && gicon.equal(this.gicon))
            gicon = this.gicon;
        this._set({
            gicon,
            // A drawn mark instead of an icon is shown as a live copy.
            drawn: gicon ? null : firstOf(this.button, St.DrawingArea),
            icon: 'extension',
            note: label?.text?.trim() ?? '',
            active: Boolean(this.button.menu?.isOpen),
        });
    }

    destroy() {
        if (this._poll)
            GLib.source_remove(this._poll);
        this._poll = 0;
        super.destroy();
    }
}

// Halo's tiles first, in the design's order; the timer comes with the island.
export const HALO_TILES = ['wifi', 'bluetooth', 'power', 'nightLight', 'darkStyle', 'colourStyle', 'dnd', 'vpn', 'timer'];

export const TILE_NAMES = {
    wifi: 'Wi‑Fi', bluetooth: 'Bluetooth', power: 'Energy', nightLight: 'Night light',
    darkStyle: 'Dark style', colourStyle: 'Colour style', dnd: 'Do not disturb', vpn: 'VPN', timer: 'Timer',
    'gnome-wired': 'Wired', 'gnome-modem': 'Mobile broadband', 'gnome-tether': 'Bluetooth tethering',
    'gnome-keyboard-light': 'Keyboard light', 'gnome-airplane': 'Airplane mode', 'gnome-rotate': 'Auto rotate',
    'gnome-unsafe': 'Unsafe mode',
};

// Every tile there is right now, Halo's first, then GNOME's rarer ones,
// then other extensions' toggles and buttons.
export function buildTiles(gnome, appearance, timers) {
    const qs = gnome.qs;
    const tiles = [
        new WifiTile(qs), new BluetoothTile(qs), new PowerTile(qs), new NightLightTile(),
        new DarkStyleTile(appearance), new ColourStyleTile(appearance), new DoNotDisturbTile(), new VpnTile(qs),
        new TimerTile(timers),
    ];
    for (const [id, toggle] of gnome.plain)
        tiles.push(new ToggleTile(id, toggle));
    const seen = new Map();
    for (const toggle of gnome.foreignToggles) {
        // The class name stays the same from one session to the next.
        const name = toggle.constructor.$gtype.name.replace(/^Gjs_/, '');
        const count = seen.get(name) ?? 0;
        seen.set(name, count + 1);
        tiles.push(new ToggleTile(`ext:${name}${count ? `:${count}` : ''}`, toggle));
    }
    for (const [key, button] of gnome.foreignButtons)
        tiles.push(new ButtonTile(key, button));
    return tiles;
}

// All tiles, kept up to date as extensions come and go, and in the order
// and with the hidden ones the settings say. Emits "changed" when the list
// or the order changed; each tile emits its own "changed".
export class TileSet extends EventEmitter {
    constructor(gnome, appearance, settings, timers) {
        super();
        this._gnome = gnome;
        this._appearance = appearance;
        this._settings = settings;
        this._timers = timers;
        this.all = [];
        if (gnome.ready)
            this._rebuild();
        gnome.connectObject('ready', () => this._rebuild(), 'changed', () => this._rebuild(), this);
    }

    // Tiles to show, in their order.
    get shown() {
        const {tileOrder, hiddenTiles} = this._settings.current;
        const byId = new Map(this.all.map(tile => [tile.id, tile]));
        return orderTiles(this.all.map(tile => tile.id), tileOrder, hiddenTiles).map(id => byId.get(id));
    }

    // Every tile in its order, hidden ones too, for the settings page.
    get ordered() {
        const byId = new Map(this.all.map(tile => [tile.id, tile]));
        return orderTiles(this.all.map(tile => tile.id), this._settings.current.tileOrder).map(id => byId.get(id));
    }

    // The settings changed: the order or the hidden ones may have.
    settingsChanged() {
        const {tileOrder, hiddenTiles} = this._settings.current;
        const key = JSON.stringify([tileOrder, hiddenTiles]);
        if (key === this._key)
            return;
        this._key = key;
        this.emit('changed');
    }

    destroy() {
        this._gnome.disconnectObject(this);
        for (const tile of this.all)
            tile.destroy();
        this.all = [];
        this.disconnectAll();
    }

    // The new tiles are handed out first, so whoever listened to the old
    // ones lets go of them before they are destroyed.
    _rebuild() {
        const old = this.all;
        this.all = buildTiles(this._gnome, this._appearance, this._timers);
        this.emit('changed');
        for (const tile of old)
            tile.destroy();
    }
}
