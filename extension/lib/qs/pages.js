// The quick settings' pages behind the tiles and buttons, as in the
// design: Wi-Fi, Bluetooth, energy, appearance, and the smaller ones for
// the VPN, the sound devices, power off, and other extensions' menus.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import {networkIcon, percentText} from '../bar/words.js';
import {spring, SPRINGS} from '../shared/choreo.js';
import {icon} from '../shared/icons.js';
import {COLOURS, palette} from '../shared/palettes.js';
import {pressable} from '../shared/press.js';
import {BADGE} from '../shared/shapes.js';
import {HaloShape} from '../shared/shape.js';
import {text} from '../shared/text.js';
import {clockText, POMODORO_PHASES} from '../island/words.js';
import {isPaused, runningTimer} from '../shared/timers.js';
import {HaloSwitch, roundButton} from './controls.js';
import {Page, caption, column, row, settingsLink, trailingIcon, trailingText} from './page.js';
import {SettingsPage} from './settingspage.js';
import {
    COLOUR_NAMES, DEVICE_LOW, PROFILES, deviceBatteryNote, lastsText, wifiDetails,
} from './words.js';

// Waits a moment so several changes at once rebuild a list only once.
function debounce(owner, callback) {
    let id = 0;
    const run = () => {
        if (id)
            return;
        id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            id = 0;
            callback();
            return GLib.SOURCE_REMOVE;
        });
    };
    owner.actor.connect('destroy', () => {
        if (id)
            GLib.source_remove(id);
        id = 0;
    });
    return run;
}

// Wi-Fi

class WifiPage extends Page {
    constructor(ctx, tile) {
        super(ctx, 'Wi‑Fi', {toggle: () => tile.activate()});
        this._tile = tile;
        this._toggle = ctx.gnome.qs._network?._wirelessToggle ?? null;
        this._connected = this.add(new St.BoxLayout({style_class: 'halo-qs-connected', x_expand: true}));
        this._caption = this.add(caption('Available networks'));
        this._list = this.add(column('halo-qs-list'));
        this.add(settingsLink(ctx, 'All Wi‑Fi settings', 'gnome-wifi-panel.desktop'));

        this._refresh = debounce(this, () => this._update());
        tile.connectObject('changed', this._refresh, this);
        this._watchNetworks();
        this._update({animated: false});
        // GNOME scans while its own menu is open; Halo's page asks the same.
        this._toggle?._startScanning?.();
    }

    _watchNetworks() {
        const device = this._tile.deviceItem;
        this._device = device;
        device?.section?.box?.connectObject('child-added', this._refresh, 'child-removed', this._refresh, this);
        device?.connectObject('notify::name', this._refresh, 'notify::icon-name', this._refresh, this);
    }

    _networks() {
        const sorter = this._device?._itemSorter;
        return sorter ? [...sorter].filter(item => item.visible).map(item => item.network) : [];
    }

    _update({animated = true} = {}) {
        const on = this._tile.active;
        this.switch.set(on, {animated});
        if (this._tile.deviceItem !== this._device) {
            this._device?.section?.box?.disconnectObject(this);
            this._device?.disconnectObject(this);
            this._watchNetworks();
        }

        const networks = this._networks();
        const active = networks.find(network => network.is_active) ?? null;
        this._connected.destroy_all_children();
        this._connected.visible = on && Boolean(active);
        if (active) {
            const nmDevice = this._device._device;
            const ap = nmDevice?.active_access_point;
            const badge = new St.Bin({style_class: 'halo-qs-connected-icon', child: icon('wifi', {size: 24, fill: true}),
                y_align: Clutter.ActorAlign.CENTER});
            this._connected.add_child(badge);
            const words = column();
            words.y_align = Clutter.ActorAlign.CENTER;
            words.add_child(text('qs-tile', {styleClass: 'halo-qs-connected-title', ellipsize: true, text: active.name}));
            words.add_child(text('qs-tile-note', {styleClass: 'halo-qs-connected-note',
                text: wifiDetails(ap?.frequency ?? 0, nmDevice?.bitrate ?? 0)}));
            this._connected.add_child(words);
            const gear = new St.Bin({style_class: 'halo-qs-connected-gear', child: icon('settings', {size: 20}),
                accessible_name: 'Network settings', y_align: Clutter.ActorAlign.CENTER});
            pressable(gear, () => {
                this.ctx.close();
                Gio.Subprocess.new(['gnome-control-center', 'wifi'], Gio.SubprocessFlags.NONE);
            }, {scale: 0.85});
            this._connected.add_child(gear);
        }

        this._list.destroy_all_children();
        const others = on ? networks.filter(network => network !== active) : [];
        this._caption.visible = others.length > 0;
        for (const network of others) {
            const line = row({
                iconName: networkIcon(network.icon_name) ?? 'wifi',
                title: network.name,
                trailing: network.secure ? trailingIcon('lock') : null,
                onClick: () => network.activate(),
            });
            this._list.add_child(line.actor);
        }
        if (on && networks.length === 0) {
            this._caption.visible = true;
            this._list.add_child(text('qs-row-note', {styleClass: 'halo-qs-empty', text: 'Looking for networks…'}));
        }
    }

    _destroy() {
        this._toggle?._stopScanning?.();
        this._tile.disconnectObject(this);
        this._device?.section?.box?.disconnectObject(this);
        this._device?.disconnectObject(this);
    }
}

// Bluetooth

const DEVICE_ICONS = {
    'audio-headphones': 'headphones', 'audio-headset': 'headphones', 'audio-speakers': 'speaker',
    'audio-card': 'speaker', 'input-mouse': 'mouse', 'input-tablet': 'mouse', 'input-keyboard': 'keyboard',
    'input-gaming': 'sports-esports', 'phone': 'mobile', 'computer': 'computer', 'watch': 'watch',
};

function deviceIcon(device) {
    return DEVICE_ICONS[device.icon] ?? 'bluetooth';
}

class BluetoothPage extends Page {
    constructor(ctx, tile) {
        super(ctx, 'Bluetooth', {toggle: () => tile.activate()});
        this._tile = tile;
        this._connectedCaption = this.add(caption('Connected'));
        this._cards = this.add(column('halo-qs-device-grid'));
        this._pairedCaption = this.add(caption('Paired, not connected'));
        this._list = this.add(column('halo-qs-list'));
        const pair = this.add(new St.BoxLayout({style_class: 'halo-qs-wide-button', x_expand: true}));
        pair.add_child(icon('add', {size: 20}));
        pair.add_child(text('qs-row', {text: 'Pair new device'}));
        pair.accessible_name = 'Pair new device';
        pressable(pair, () => {
            ctx.close();
            Gio.Subprocess.new(['gnome-control-center', 'bluetooth'], Gio.SubprocessFlags.NONE);
        }, {scale: 0.97, focus: true});
        this.add(settingsLink(ctx, 'All Bluetooth settings', 'gnome-bluetooth-panel.desktop'));

        this._refresh = debounce(this, () => this._update());
        tile.connectObject('changed', this._refresh, this);
        this._devices = new Set();
        this._update({animated: false});
    }

    _watch(devices) {
        for (const device of devices) {
            if (this._devices.has(device))
                continue;
            this._devices.add(device);
            device.connectObject('notify::battery-percentage', this._refresh, 'notify::connected', this._refresh, this);
        }
    }

    _update({animated = true} = {}) {
        this.switch.set(this._tile.active, {animated});
        const devices = this._tile.devices;
        this._watch(devices);
        const connected = devices.filter(device => device.connected);
        const paired = devices.filter(device => !device.connected);

        this._cards.destroy_all_children();
        this._connectedCaption.visible = connected.length > 0;
        for (let i = 0; i < connected.length; i += 2) {
            const line = new St.BoxLayout({style_class: 'halo-qs-device-row', x_expand: true});
            line.layout_manager.homogeneous = true;
            for (const device of connected.slice(i, i + 2))
                line.add_child(this._card(device));
            if (connected.length - i === 1)
                line.add_child(new St.Widget({x_expand: true}));
            this._cards.add_child(line);
        }

        this._list.destroy_all_children();
        this._pairedCaption.visible = paired.length > 0;
        for (const device of paired) {
            const line = row({
                iconName: deviceIcon(device),
                title: device.alias,
                trailing: trailingText('Connect'),
                onClick: () => this._tile.client.toggleDevice(device),
            });
            this._list.add_child(line.actor);
        }
    }

    _card(device) {
        const percent = device.battery_percentage;
        const hasBattery = typeof percent === 'number' && percent > 0;
        const low = hasBattery && percent < DEVICE_LOW;
        const card = column('halo-qs-device');
        if (!low)
            card.add_style_class_name('halo-on');
        const circle = new St.Bin({style_class: 'halo-qs-device-icon', child: icon(deviceIcon(device), {size: 20, fill: !low}),
            x_align: Clutter.ActorAlign.START});
        card.add_child(circle);
        card.add_child(text('qs-tile', {styleClass: 'halo-qs-device-name', ellipsize: true, text: device.alias}));
        const battery = new St.BoxLayout({style_class: 'halo-qs-device-battery'});
        if (hasBattery) {
            const number = text('qs-big', {styleClass: 'halo-qs-device-percent', text: percentText(percent)});
            if (low)
                number.add_style_class_name('halo-low');
            battery.add_child(number);
            const note = text('qs-tile-note', {styleClass: 'halo-qs-device-note', text: deviceBatteryNote(percent)});
            note.y_align = Clutter.ActorAlign.END;
            battery.add_child(note);
        } else {
            battery.add_child(text('qs-tile-note', {styleClass: 'halo-qs-device-note', text: 'Connected'}));
        }
        card.add_child(battery);
        card.accessible_name = hasBattery ? `${device.alias}, ${percentText(percent)}` : device.alias;
        pressable(card, () => this._tile.client.toggleDevice(device), {scale: 0.96, focus: true});
        return card;
    }

    _destroy() {
        this._tile.disconnectObject(this);
        for (const device of this._devices)
            device.disconnectObject(this);
        this._devices.clear();
    }
}

// Energy

const UPOWER = 'org.freedesktop.UPower';
const DEVICE_IFACE = 'org.freedesktop.UPower.Device';

class EnergyPage extends Page {
    constructor(ctx, tile) {
        super(ctx, 'Energy');
        this._tile = tile;
        this._battery = this.add(new St.BoxLayout({style_class: 'halo-qs-card halo-qs-battery', x_expand: true}));
        const badge = new St.Widget({layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER});
        this._badge = new HaloShape({size: 76, shape: BADGE, color: ctx.theme.roles.loud});
        badge.add_child(this._badge);
        this._badgeNumber = text('qs-big', {styleClass: 'halo-qs-badge-number'});
        this._badgeNumber.x_align = Clutter.ActorAlign.CENTER;
        badge.add_child(this._badgeNumber);
        this._battery.add_child(badge);
        const words = column();
        words.y_align = Clutter.ActorAlign.CENTER;
        words.add_child(text('qs-caption', {styleClass: 'halo-qs-small', text: 'Battery'}));
        this._lasts = text('qs-tile', {styleClass: 'halo-qs-lasts', wrap: true});
        words.add_child(this._lasts);
        words.add_child(text('qs-tile-note', {styleClass: 'halo-qs-small', text: 'Estimated from recent use.'}));
        this._battery.add_child(words);

        this._profiles = this.add(column('halo-qs-list'));
        this._limit = this.add(new St.BoxLayout({style_class: 'halo-qs-row halo-qs-limit', x_expand: true, visible: false}));
        const limitWords = column();
        limitWords.y_align = Clutter.ActorAlign.CENTER;
        limitWords.add_child(text('qs-row', {styleClass: 'halo-qs-row-title', text: 'Protect battery'}));
        this._limitNote = text('qs-row-note', {styleClass: 'halo-qs-row-note', text: 'Charge only up to 80 %'});
        limitWords.add_child(this._limitNote);
        this._limit.add_child(limitWords);
        this._limitSwitch = new HaloSwitch({theme: ctx.theme, accessibleName: 'Protect battery',
            onToggle: on => this._setLimit(on)});
        this._limit.add_child(this._limitSwitch);
        this.add(settingsLink(ctx, 'All power settings', 'gnome-power-panel.desktop'));

        ctx.system.connectObject('changed', () => this._updateBattery(), this);
        ctx.theme.connectObject('changed', () => this._badge.setColor(ctx.theme.roles.loud), this);
        tile.connectObject('changed', () => this._updateProfiles(), this);
        this._updateBattery();
        this._updateProfiles();
        this._findLimit();
    }

    shown() {
        this._badge.set_pivot_point(0.5, 0.5);
        this._badge.set({scale_x: 0.6, scale_y: 0.6, rotation_angle_z: -40});
        spring(this._badge, {scale_x: 1, scale_y: 1, rotation_angle_z: 0}, {spring: SPRINGS.pop, delay: 60});
    }

    _updateBattery() {
        const battery = this.ctx.system.battery;
        this._battery.visible = Boolean(battery);
        if (!battery)
            return;
        this._badgeNumber.text = String(Math.round(battery.percent));
        const twelve = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).get_string('clock-format') === '12h';
        this._lasts.text = lastsText(battery, new Date(), twelve);
    }

    _updateProfiles() {
        const proxy = this._tile.proxy;
        this._profiles.destroy_all_children();
        if (!proxy)
            return;
        const available = (proxy.Profiles ?? []).map(entry => entry.Profile?.unpack?.() ?? entry.Profile);
        for (const id of ['performance', 'balanced', 'power-saver']) {
            if (!available.includes(id))
                continue;
            const profile = PROFILES[id];
            const chosen = proxy.ActiveProfile === id;
            const line = row({
                iconName: profile.icon,
                title: profile.title,
                note: profile.note,
                chosen,
                trailing: chosen ? trailingIcon('check-circle') : null,
                onClick: () => {
                    proxy.ActiveProfile = id;
                },
            });
            this._profiles.add_child(line.actor);
        }
    }

    // The battery that can stop charging early, if there is one.
    _findLimit() {
        Gio.DBus.system.call(UPOWER, '/org/freedesktop/UPower', UPOWER, 'EnumerateDevices', null, null,
            Gio.DBusCallFlags.NONE, -1, null, (connection, result) => {
                let paths = [];
                try {
                    [paths] = connection.call_finish(result).deepUnpack();
                } catch {
                    return;
                }
                const battery = paths.find(path => path.includes('/battery_'));
                if (!battery || !this.actor || this._gone)
                    return;
                Gio.DBusProxy.new(Gio.DBus.system, Gio.DBusProxyFlags.NONE, null, UPOWER, battery, DEVICE_IFACE,
                    null, (_source, res) => {
                        try {
                            this._limitProxy = Gio.DBusProxy.new_finish(res);
                        } catch {
                            return;
                        }
                        if (this._gone)
                            return;
                        this._limitProxy.connectObject('g-properties-changed', () => this._updateLimit(), this);
                        this._updateLimit({animated: false});
                    });
            });
    }

    _updateLimit({animated = true} = {}) {
        const read = name => this._limitProxy?.get_cached_property(name)?.unpack();
        const supported = Boolean(read('ChargeThresholdSupported'));
        this._limit.visible = supported;
        if (!supported)
            return;
        const end = read('ChargeEndThreshold') || 80;
        this._limitNote.text = `Charge only up to ${end} %`;
        this._limitSwitch.set(Boolean(read('ChargeThresholdEnabled')), {animated});
    }

    _setLimit(on) {
        this._limitProxy?.call('EnableChargeThreshold', new GLib.Variant('(b)', [on]), Gio.DBusCallFlags.NONE, -1, null,
            (proxy, result) => {
                try {
                    proxy.call_finish(result);
                } catch (e) {
                    console.log(`Halo: the charge limit was not changed (${e.message})`);
                }
            });
    }

    _destroy() {
        this._gone = true;
        this.ctx.system.disconnectObject(this);
        this.ctx.theme.disconnectObject(this);
        this._tile.disconnectObject(this);
        this._limitProxy?.disconnectObject(this);
    }
}

// Appearance

const LAYOUT_NAMES = {full: 'Full', left: 'Left', centre: 'Centre', right: 'Right', islands: 'Islands'};
const STYLE_CHOICES = [['light', 'Light', 'light-mode'], ['dark', 'Dark', 'dark-mode'], ['auto', 'Auto', 'brightness-auto']];

// A small picture of the bar in one layout: a bar in the colour of the
// frame, its groups in primary.
function layoutPicture(layout) {
    const picture = new St.Widget({style_class: 'halo-qs-layout-picture', layout_manager: new Clutter.BinLayout()});
    const bar = new St.BoxLayout({style_class: 'halo-qs-layout-bar', x_expand: true, y_align: Clutter.ActorAlign.START});
    const spots = {
        full: [['full', true]],
        left: [['short', false]],
        centre: [['short', false]],
        right: [['short', false]],
        islands: [['dot', false], ['dot', false], ['dot', false]],
    }[layout];
    bar.x_align = {left: Clutter.ActorAlign.START, right: Clutter.ActorAlign.END}[layout] ?? Clutter.ActorAlign.FILL;
    if (layout === 'centre')
        bar.x_align = Clutter.ActorAlign.CENTER;
    if (layout === 'islands')
        bar.x_expand = true;
    for (const [kind] of spots) {
        const spot = new St.Widget({style_class: `halo-qs-layout-spot halo-${kind}`, x_expand: layout === 'islands' || kind === 'full'});
        bar.add_child(spot);
    }
    picture.add_child(bar);
    return picture;
}

class AppearancePage extends Page {
    constructor(ctx) {
        super(ctx, 'Appearance');
        const {appearance, settings} = ctx;

        const colours = this.add(column('halo-qs-card'));
        this._colourCaption = caption('');
        colours.add_child(this._colourCaption);
        this._swatches = new Map();
        for (const line of [COLOURS.slice(0, 4), COLOURS.slice(4)]) {
            const box = new St.BoxLayout({style_class: 'halo-qs-swatch-row', x_expand: true});
            box.layout_manager.homogeneous = true;
            for (const colour of line) {
                const swatch = new St.Bin({
                    style_class: 'halo-qs-swatch',
                    x_expand: true,
                    accessible_name: COLOUR_NAMES[colour],
                    accessible_role: 'radio-button',
                    child: icon('check', {size: 22}),
                });
                pressable(swatch, () => appearance.setColour(colour), {scale: 0.9, focus: true});
                this._swatches.set(colour, swatch);
                box.add_child(swatch);
            }
            colours.add_child(box);
        }

        this._styles = new Map();
        const styles = this.add(new St.BoxLayout({style_class: 'halo-qs-segments', x_expand: true}));
        styles.layout_manager.homogeneous = true;
        for (const [style, name, iconName] of STYLE_CHOICES) {
            const segment = new St.BoxLayout({style_class: 'halo-qs-segment', x_expand: true, accessible_name: name});
            const inner = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'halo-qs-segment-inner'});
            inner.add_child(icon(iconName, {size: 18}));
            inner.add_child(text('qs-row', {text: name}));
            segment.add_child(inner);
            pressable(segment, () => appearance.setStyle(style), {scale: 0.94, focus: true});
            this._styles.set(style, segment);
            styles.add_child(segment);
        }
        this._autoNote = this.add(text('qs-row-note', {styleClass: 'halo-qs-small halo-qs-auto-note'}));

        const layouts = this.add(column('halo-qs-card'));
        layouts.add_child(caption('Top bar'));
        const layoutRow = new St.BoxLayout({style_class: 'halo-qs-layout-row', x_expand: true});
        layoutRow.layout_manager.homogeneous = true;
        this._layouts = new Map();
        for (const [layout, name] of Object.entries(LAYOUT_NAMES)) {
            const choice = column('halo-qs-layout');
            choice.add_child(layoutPicture(layout));
            const label = text('qs-caption', {styleClass: 'halo-qs-layout-name', text: name});
            label.x_align = Clutter.ActorAlign.CENTER;
            choice.add_child(label);
            choice.accessible_name = name;
            pressable(choice, () => settings.set('barLayout', layout), {scale: 0.92, focus: true});
            this._layouts.set(layout, choice);
            layoutRow.add_child(choice);
        }
        layouts.add_child(layoutRow);

        this._islandSwitch = new HaloSwitch({
            theme: ctx.theme,
            accessibleName: 'Dynamic Island',
            onToggle: on => settings.set('parts', {...settings.current.parts, island: on}),
        });
        const island = row({
            iconName: 'graphic-eq',
            title: 'Dynamic Island',
            note: 'Media, timer, volume, hints',
            trailing: this._islandSwitch,
        });
        island.actor.add_style_class_name('halo-qs-card-row');
        this.add(island.actor);

        appearance.connectObject('changed', () => this._update(), this);
        ctx.theme.connectObject('changed', () => this._update(), this);
        this._update({animated: false});
    }

    _update({animated = true} = {}) {
        const {appearance, settings, theme} = this.ctx;
        const colour = appearance.colour;
        this._colourCaption.text = `Colour style · ${COLOUR_NAMES[colour]}`;
        for (const [name, swatch] of this._swatches) {
            const roles = palette(name, theme.scheme);
            const chosen = name === colour;
            swatch.set_style(`background-color: ${roles.primary}; color: ${roles.onPrimary};` +
                (chosen ? ` border-color: ${theme.roles.on};` : ''));
            const was = swatch.has_style_class_name('halo-chosen');
            if (chosen)
                swatch.add_style_class_name('halo-chosen');
            else
                swatch.remove_style_class_name('halo-chosen');
            swatch.child.visible = chosen;
            if (chosen && !was && animated) {
                swatch.set_pivot_point(0.5, 0.5);
                swatch.set({scale_x: 0.82, scale_y: 0.82});
                spring(swatch, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.pop});
            }
        }
        for (const [style, segment] of this._styles) {
            if (style === appearance.style)
                segment.add_style_class_name('halo-chosen');
            else
                segment.remove_style_class_name('halo-chosen');
        }
        const {darkFrom, darkTo} = settings.current;
        this._autoNote.text = `Auto is dark from ${darkFrom} until ${darkTo}. Change the times in Halo's settings.`;
        this._autoNote.visible = appearance.style === 'auto';
        for (const [layout, choice] of this._layouts) {
            if (layout === settings.current.barLayout)
                choice.add_style_class_name('halo-chosen');
            else
                choice.remove_style_class_name('halo-chosen');
        }
        this._islandSwitch.set(settings.current.parts.island, {animated});
    }

    // The settings changed elsewhere (the layout, the island).
    settingsChanged() {
        this._update();
    }

    _destroy() {
        this.ctx.appearance.disconnectObject(this);
        this.ctx.theme.disconnectObject(this);
    }
}

// VPN

class VpnPage extends Page {
    constructor(ctx, tile) {
        super(ctx, 'VPN', {toggle: () => tile.activate()});
        this._tile = tile;
        this._list = this.add(column('halo-qs-list'));
        this.add(settingsLink(ctx, 'VPN settings', 'gnome-network-panel.desktop'));
        this._refresh = debounce(this, () => this._update());
        tile.connectObject('changed', this._refresh, this);
        tile.toggle?._client?.connectObject('notify::active-connections', this._refresh, this);
        this._update({animated: false});
    }

    _update({animated = true} = {}) {
        const toggle = this._tile.toggle;
        this.switch.set(this._tile.active, {animated});
        this._list.destroy_all_children();
        const client = toggle?._client;
        if (!client)
            return;
        const active = client.get_active_connections();
        for (const connection of toggle._items.keys()) {
            const running = active.find(entry => entry.connection === connection) ?? null;
            const line = row({
                iconName: 'vpn-key',
                title: connection.get_id(),
                note: running ? 'Connected' : '',
                chosen: Boolean(running),
                trailing: running ? trailingIcon('check-circle') : trailingText('Connect'),
                onClick: () => {
                    if (running)
                        toggle.deactivateConnection(running);
                    else
                        toggle.activateConnection(connection);
                },
            });
            this._list.add_child(line.actor);
        }
    }

    _destroy() {
        this._tile.disconnectObject(this);
        this._tile.toggle?._client?.disconnectObject(this);
    }
}

// Sound devices

class SoundPage extends Page {
    constructor(ctx) {
        super(ctx, 'Sound');
        const qs = ctx.gnome.qs;
        this._output = qs._volumeOutput?._output ?? null;
        this._input = qs._volumeInput?._input ?? null;
        this.add(caption('Output'));
        this._outputs = this.add(column('halo-qs-list'));
        this._inputCaption = this.add(caption('Input'));
        this._inputs = this.add(column('halo-qs-list'));
        this.add(settingsLink(ctx, 'All sound settings', 'gnome-sound-panel.desktop'));
        this._refresh = debounce(this, () => this._update());
        for (const slider of [this._output, this._input]) {
            slider?._control?.connectObject('active-output-update', this._refresh, 'active-input-update', this._refresh,
                'output-added', this._refresh, 'output-removed', this._refresh,
                'input-added', this._refresh, 'input-removed', this._refresh, this);
        }
        this._update();
    }

    _fill(list, slider, kind) {
        list.destroy_all_children();
        if (!slider)
            return 0;
        const control = slider._control;
        const current = slider._stream ? control.lookup_device_from_stream(slider._stream) : null;
        let count = 0;
        for (const id of slider._deviceItems.keys()) {
            const device = kind === 'output' ? control.lookup_output_id(id) : control.lookup_input_id(id);
            if (!device)
                continue;
            const chosen = current?.get_id() === id;
            const line = row({
                iconName: kind === 'output' ? (/head/i.test(device.get_description()) ? 'headphones' : 'speaker') : 'mic',
                title: device.get_description(),
                note: device.get_origin() ?? '',
                chosen,
                trailing: chosen ? trailingIcon('check-circle') : null,
                onClick: () => (kind === 'output' ? control.change_output(device) : control.change_input(device)),
            });
            list.add_child(line.actor);
            count++;
        }
        return count;
    }

    _update() {
        this._fill(this._outputs, this._output, 'output');
        const inputs = this._fill(this._inputs, this._input, 'input');
        this._inputCaption.visible = inputs > 0;
    }

    _destroy() {
        this._output?._control?.disconnectObject(this);
        this._input?._control?.disconnectObject(this);
    }
}

// Power off

class PowerPage extends Page {
    constructor(ctx) {
        super(ctx, 'Power');
        const actions = SystemActions.getDefault();
        actions.forceUpdate();
        const list = this.add(column('halo-qs-list'));
        const items = [
            ['can-suspend', 'bedtime', 'Suspend', () => actions.activateSuspend()],
            ['can-restart', 'restart-alt', 'Restart…', () => actions.activateRestart()],
            ['can-power-off', 'power-settings-new', 'Power off…', () => actions.activatePowerOff()],
            ['can-logout', 'logout', 'Log out…', () => actions.activateLogout()],
            ['can-switch-user', 'person', 'Switch user…', () => actions.activateSwitchUser()],
        ];
        for (const [property, iconName, title, act] of items) {
            if (!actions[property.replaceAll('-', '_')])
                continue;
            list.add_child(row({iconName, title, onClick: () => {
                ctx.close();
                act();
            }}).actor);
        }
    }
}

// Another extension's menu, or a toggle's, shown inside the page. The menu
// is lent: its box moves here while the page is open and goes back after.

class HostedPage extends Page {
    constructor(ctx, tile) {
        const isToggle = Boolean(tile.toggle);
        super(ctx, tile.title, {toggle: isToggle ? () => tile.activate() : null});
        this._tile = tile;
        this._menu = tile.menu;
        this._holder = this.add(column('halo-qs-hosted'));
        if (isToggle) {
            this.switch.set(tile.active, {animated: false});
            tile.connectObject('changed', () => this.switch.set(tile.active), this);
        }
        this._borrow();
    }

    _borrow() {
        const menu = this._menu;
        if (!menu?.box)
            return;
        this._parent = menu.box.get_parent();
        this._manager = Main.panel.menuManager;
        // While lent, GNOME's menu manager must not grab for it.
        this._managed = this._manager._menus?.includes(menu) ?? false;
        if (this._managed)
            this._manager.removeMenu(menu);
        this._parent?.remove_child(menu.box);
        menu.box.opacity = 255;
        this._holder.add_child(menu.box);
        // Its owner may fill it when it opens. Only for menus of GNOME's
        // bar: another manager would grab the pointer for it.
        if (this._managed && !menu.isOpen) {
            menu.isOpen = true;
            this._opened = true;
            menu.emit('open-state-changed', true);
        }
        // An item that was chosen closes the menu; the quick settings close too.
        menu.connectObject('open-state-changed', (_menu, open) => {
            if (!open && !this._returning)
                this.ctx.close();
        }, this);
    }

    _destroy() {
        this._tile.disconnectObject(this);
        const menu = this._menu;
        if (!menu?.box)
            return;
        this._returning = true;
        menu.disconnectObject(this);
        this._holder.remove_child(menu.box);
        this._parent?.add_child(menu.box);
        if (this._opened && menu.isOpen) {
            menu.isOpen = false;
            menu.emit('open-state-changed', false);
        }
        if (this._managed)
            this._manager.addMenu(menu);
        // A toggle's menu keeps its own height; it was closed all along.
        if (menu.actor && menu.actor !== menu.box && this._tile.toggle)
            menu.actor.hide();
    }
}

// Timer

const TIMER_PRESETS = [5, 15, 25, 45];
const TIMER_KINDS = [
    ['pomodoro', 'Pomodoro', 'Focus 25 min, then a break'],
    ['stopwatch', 'Stopwatch', 'Counts up from zero'],
];

// The timer, the stopwatch and the pomodoro shared with Ledge: what runs,
// a quick start for a timer, and the other two with start and reset.
class TimerPage extends Page {
    constructor(ctx, tile) {
        super(ctx, 'Timer', {toggle: () => tile.activate()});
        this._tile = tile;
        this._store = tile.store;

        const now = this.add(new St.BoxLayout({style_class: 'halo-qs-card halo-qs-timer-now', x_expand: true}));
        const words = column();
        words.x_expand = true;
        words.y_align = Clutter.ActorAlign.CENTER;
        this._nowLabel = text('qs-caption', {styleClass: 'halo-qs-small'});
        this._nowTime = text('qs-big', {styleClass: 'halo-qs-timer-time'});
        words.add_child(this._nowLabel);
        words.add_child(this._nowTime);
        now.add_child(words);

        this.add(caption('Start a timer'));
        const presets = this.add(new St.BoxLayout({style_class: 'halo-qs-segments', x_expand: true}));
        presets.layout_manager.homogeneous = true;
        for (const minutes of TIMER_PRESETS) {
            const segment = new St.BoxLayout({style_class: 'halo-qs-segment', x_expand: true, accessible_name: `${minutes} minutes`});
            const inner = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'halo-qs-segment-inner'});
            inner.add_child(text('qs-row', {text: `${minutes} min`}));
            segment.add_child(inner);
            pressable(segment, () => this._store.startTimer(minutes), {scale: 0.94, focus: true});
            presets.add_child(segment);
        }

        this._rows = new Map();
        const list = this.add(column('halo-qs-list'));
        for (const [kind, title, note] of [['timer', 'Timer', 'Started above'], ...TIMER_KINDS]) {
            const line = row({iconName: kind === 'stopwatch' ? 'schedule' : 'timer', title, note, onClick: () => this._store.toggle(kind)});
            const reset = roundButton('restart-alt', () => this._store.reset(kind), {accessibleName: `Reset ${title}`});
            // The words take the room, the reset button sits at the end.
            line.title.get_parent().x_expand = true;
            line.actor.add_child(reset);
            list.add_child(line.actor);
            this._rows.set(kind, {actor: line.actor, label: line.note, rest: note, reset});
        }
        this.add(text('qs-row-note', {styleClass: 'halo-qs-small', text: 'Shared with Ledge: what runs here runs on its widgets too.', wrap: true}));

        this._store.connectObject('changed', () => this._update(), this);
        this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
        this._update({animated: false});
    }

    _update({animated = true} = {}) {
        const now = Date.now();
        const timers = this._store.timers;
        const running = runningTimer(timers, now);
        this.switch.set(Boolean(running), {animated});
        this._nowLabel.text = running
            ? (running.kind === 'pomodoro' ? `Pomodoro · ${POMODORO_PHASES[running.phase]}` : running.kind === 'timer' ? 'Timer' : 'Stopwatch')
            : 'Nothing running';
        this._nowTime.text = running ? clockText(running.shown, {countdown: running.countdown}) : '00:00';
        for (const [kind, line] of this._rows) {
            const on = running?.kind === kind;
            const paused = isPaused(timers, kind);
            line.label.text = on ? 'Running · tap to pause' : paused ? 'Paused · tap to go on' : line.rest;
            line.reset.visible = on || paused;
            if (on)
                line.actor.add_style_class_name('halo-chosen');
            else
                line.actor.remove_style_class_name('halo-chosen');
        }
    }

    _destroy() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        this._store.disconnectObject(this);
    }
}

export const PAGES = {
    wifi: (ctx, tile) => new WifiPage(ctx, tile),
    bluetooth: (ctx, tile) => new BluetoothPage(ctx, tile),
    energy: (ctx, tile) => new EnergyPage(ctx, tile),
    appearance: ctx => new AppearancePage(ctx),
    vpn: (ctx, tile) => new VpnPage(ctx, tile),
    timer: (ctx, tile) => new TimerPage(ctx, tile ?? ctx.tiles.all.find(t => t.id === 'timer')),
    sound: ctx => new SoundPage(ctx),
    power: ctx => new PowerPage(ctx),
    hosted: (ctx, tile) => new HostedPage(ctx, tile),
    settings: (ctx, section) => new SettingsPage(ctx, section),
};
