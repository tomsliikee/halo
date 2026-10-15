// What the system does, as the island tells it: recording and what uses
// the camera or microphone (lasting), and short messages for charging, a
// low battery, the keyboard layout, the network, Bluetooth devices, the
// power mode, settings, screenshots and copied text.
//
// A change is told only after the first reading, so nothing speaks up just
// because Halo started.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {batteryIcon, percentText} from '../../bar/words.js';
import {PROFILES, batteryNote, onOff} from '../../qs/words.js';
import {copiedText, lowMark, recordingText} from '../words.js';

// GNOME's quick settings come up asynchronously; look again this often.
const RETRY_MS = 500;
const RETRIES = 40;
// Changes in the first moments are Halo starting, not news.
const SETTLE_MS = 3000;
// A screenshot is also copied; that copy is not told twice.
const SCREENSHOT_COPY_MS = 2000;
const PASSWORD_HINT = 'x-kde-passwordManagerHint';

function deviceIcon(name) {
    const icon = name ?? '';
    if (icon.startsWith('audio-headphones') || icon.startsWith('audio-headset'))
        return 'headphones';
    if (icon.startsWith('audio'))
        return 'speaker';
    if (icon.startsWith('input-mouse') || icon.startsWith('input-tablet'))
        return 'mouse';
    if (icon.startsWith('input-keyboard'))
        return 'keyboard';
    if (icon.startsWith('input-gaming'))
        return 'sports-esports';
    if (icon.startsWith('phone'))
        return 'mobile';
    if (icon.startsWith('computer'))
        return 'computer';
    return 'bluetooth';
}

export class SystemSource {
    constructor(island, system) {
        this._island = island;
        this._system = system;
        this._startedAt = Date.now();
        this._battery = null;
        this._recordingTick = 0;
        this._retry = 0;
        this._tries = 0;
        this._watched = new Set();
        this._connected = null;
        this._primary = undefined;
        this._vpns = null;
        this._profile = null;
        this._lastCopy = {text: null, at: 0};
        this._lastScreenshot = 0;

        this._system.connectObject('changed', () => this._systemChanged(), this);

        this._notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._notifications.connectObject('changed::show-banners', () => {
            const on = !this._notifications.get_boolean('show-banners');
            this._hint('settings', 'settings', {
                icon: 'do-not-disturb-on', tone: 'soft', square: true,
                title: on ? 'Do not disturb on' : 'Do not disturb off',
                note: on ? 'Until you turn it off' : 'Notifications are back',
            });
        }, this);
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._interface.connectObject('changed::color-scheme', () => {
            const dark = this._interface.get_string('color-scheme') === 'prefer-dark';
            this._hint('settings', 'settings', {icon: dark ? 'dark-mode' : 'light-mode', title: `Dark style ${onOff(dark).toLowerCase()}`});
        }, this);
        this._color = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});
        this._color.connectObject('changed::night-light-enabled', () => {
            const on = this._color.get_boolean('night-light-enabled');
            this._hint('settings', 'settings', {icon: 'nightlight', title: `Night light ${onOff(on).toLowerCase()}`});
        }, this);

        Main.screenshotUI.connectObject('screenshot-taken', (_ui, file) => this._screenshot(file), this);
        global.display.get_selection().connectObject('owner-changed', (_selection, type, owner) => this._copied(type, owner), this);

        this._watchQuickSettings();
        this._systemChanged();
    }

    destroy() {
        for (const id of [this._recordingTick, this._retry]) {
            if (id)
                GLib.source_remove(id);
        }
        this._recordingTick = 0;
        this._retry = 0;
        this._system.disconnectObject(this);
        this._notifications.disconnectObject(this);
        this._interface.disconnectObject(this);
        this._color.disconnectObject(this);
        Main.screenshotUI.disconnectObject(this);
        global.display.get_selection().disconnectObject(this);
        for (const object of this._watched)
            object.disconnectObject(this);
        this._watched.clear();
        for (const id of ['recording', 'privacy'])
            this._island.remove(id);
    }

    get _settled() {
        return Date.now() - this._startedAt > SETTLE_MS;
    }

    // A short message, if its event may open the island. data: see infoView.
    _hint(id, event, data, extra = {}) {
        if (!this._settled || !this._island.allows(event))
            return;
        this._island.set({id: `hint:${id}`, kind: event, hint: true, view: 'info', data, ...extra});
    }

    _systemChanged() {
        this._recording();
        this._privacy();
        this._batteryChanged();
    }

    _recording() {
        const seconds = this._system.recordingSeconds;
        if (seconds === null || !this._island.allows('recording')) {
            this._island.remove('recording');
            if (this._recordingTick)
                GLib.source_remove(this._recordingTick);
            this._recordingTick = 0;
            return;
        }
        this._island.set({
            id: 'recording', kind: 'recording', view: 'recording',
            data: {seconds, text: recordingText(seconds)},
            onStop: () => this._system.stopRecording(),
        });
        if (!this._recordingTick) {
            this._recordingTick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._recording();
                return this._recordingTick ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
            });
        }
    }

    _privacy() {
        const {camera, microphone, screenSharing} = this._system;
        const uses = [
            camera && {icon: 'videocam', title: 'Camera in use'},
            screenSharing && {icon: 'screen-share', title: 'Sharing your screen'},
            microphone && {icon: 'mic', title: 'Microphone in use'},
        ].filter(Boolean);
        if (uses.length === 0 || !this._island.allows('privacy')) {
            this._island.remove('privacy');
            return;
        }
        const [first, ...rest] = uses;
        this._island.set({
            id: 'privacy', kind: 'privacy', view: 'info',
            data: {
                icon: first.icon, tone: 'alarm', title: first.title,
                note: rest.length > 0 ? rest.map(use => use.title.replace(/ in use$/, '')).join(' and ') + ' too' : null,
            },
        });
    }

    _batteryChanged() {
        const battery = this._system.battery;
        const before = this._battery;
        this._battery = battery ? {percent: battery.percent, charging: battery.charging} : null;
        if (!battery || !before)
            return;
        if (battery.charging !== before.charging) {
            const percent = percentText(battery.percent);
            this._hint('charging', 'charging', battery.charging
                ? {icon: 'bolt', tone: 'go', title: 'Charging', note: batteryNote(battery), trailing: percent, trailingTone: 'good'}
                : {icon: batteryIcon(battery.percent, false), title: 'On battery', note: batteryNote(battery), trailing: percent});
        }
        const mark = lowMark(before, battery);
        if (mark !== null) {
            this._hint('battery', 'battery', {
                icon: 'battery-android-alert', tone: 'alarm', title: 'Battery low',
                note: mark <= 10 ? 'Plug in now' : 'Plug in soon',
                trailing: percentText(battery.percent), trailingTone: 'alarm',
            }, {duration: 6000});
        }
    }

    _watch(object, signals) {
        if (!object || this._watched.has(object))
            return;
        this._watched.add(object);
        object.connectObject(...signals, this);
    }

    // NetworkManager, Bluetooth and power profiles come from GNOME's quick
    // settings, which come up a while after the shell.
    _watchQuickSettings() {
        const qs = Main.panel.statusArea.quickSettings;
        const client = qs?._network?._client;
        if (client) {
            this._watch(client, [
                'notify::primary-connection', () => this._networkChanged(client),
                'active-connection-added', () => this._vpnChanged(client),
                'active-connection-removed', () => this._vpnChanged(client),
            ]);
            if (this._primary === undefined)
                this._networkChanged(client);
            if (this._vpns === null)
                this._vpnChanged(client);
        }
        const bluetooth = qs?._bluetooth?._client;
        if (bluetooth) {
            this._watch(bluetooth, ['devices-changed', () => this._devicesChanged(bluetooth)]);
            if (this._connected === null)
                this._devicesChanged(bluetooth);
        }
        const proxy = qs?._powerProfiles?.quickSettingsItems?.[0]?._proxy;
        if (proxy) {
            this._watch(proxy, ['g-properties-changed', () => this._profileChanged(proxy)]);
            if (this._profile === null)
                this._profile = proxy.ActiveProfile ?? null;
        }
        const keyboard = this._system._inputSources;
        if (keyboard) {
            this._watch(keyboard, ['current-source-changed', () => this._keyboardChanged(keyboard)]);
        }
        const complete = qs?._network !== undefined && qs?._bluetooth !== undefined && qs?._powerProfiles !== undefined;
        if (complete || this._tries >= RETRIES)
            return;
        this._tries++;
        this._retry = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_MS, () => {
            this._retry = 0;
            this._watchQuickSettings();
            return GLib.SOURCE_REMOVE;
        });
    }

    _networkChanged(client) {
        const connection = client.primary_connection;
        const name = connection?.get_id?.() ?? null;
        const type = connection?.get_connection_type?.() ?? '';
        const before = this._primary;
        this._primary = name;
        if (before === undefined || before === name)
            return;
        // A VPN as the main connection is told by _vpnChanged.
        if (type === 'vpn' || type === 'wireguard')
            return;
        if (name) {
            const wired = type === '802-3-ethernet';
            this._hint('network', 'network', {icon: wired ? 'lan' : 'wifi', title: wired ? 'Wired network connected' : 'Wi-Fi connected', note: name});
        } else {
            this._hint('network', 'network', {icon: 'wifi-off', tone: 'soft', title: 'Offline', note: 'No network connection'});
        }
    }

    _vpnChanged(client) {
        const vpns = new Map(client.get_active_connections()
            .filter(connection => connection.vpn || connection.get_connection_type?.() === 'wireguard')
            .map(connection => [connection.get_id(), connection]));
        const before = this._vpns;
        this._vpns = new Set(vpns.keys());
        if (!before)
            return;
        const added = [...this._vpns].find(name => !before.has(name));
        const removed = [...before].find(name => !this._vpns.has(name));
        if (added)
            this._hint('vpn', 'network', {icon: 'vpn-key', title: 'VPN connected', note: added});
        else if (removed)
            this._hint('vpn', 'network', {icon: 'vpn-key', tone: 'soft', title: 'VPN disconnected', note: removed});
    }

    _devicesChanged(client) {
        const devices = [...client.getDevices()];
        const connected = new Map(devices.filter(device => device.connected).map(device => [device.address, device]));
        const before = this._connected;
        this._connected = new Set(connected.keys());
        if (!before)
            return;
        for (const [address, device] of connected) {
            if (before.has(address))
                continue;
            const audio = (device.icon ?? '').startsWith('audio');
            const battery = device.battery_percentage > 0 ? percentText(device.battery_percentage) : null;
            this._hint(`device:${address}`, 'devices', {
                icon: deviceIcon(device.icon), tone: 'soft',
                title: `${device.alias || device.name || 'Device'} connected`,
                note: audio ? 'Audio switches to it' : null,
                trailing: battery,
            }, {duration: 4000});
        }
        for (const address of before) {
            if (connected.has(address))
                continue;
            const device = devices.find(d => d.address === address);
            this._hint(`device:${address}`, 'devices', {
                icon: deviceIcon(device?.icon), tone: 'soft',
                title: `${device?.alias || device?.name || 'Device'} disconnected`,
            });
        }
    }

    _profileChanged(proxy) {
        const profile = proxy.ActiveProfile ?? null;
        const before = this._profile;
        this._profile = profile;
        if (!before || before === profile || !PROFILES[profile])
            return;
        this._hint('power-mode', 'powerMode', {icon: PROFILES[profile].icon, title: PROFILES[profile].title, note: 'Power mode'});
    }

    _keyboardChanged(sources) {
        const source = sources.currentSource;
        if (!source || Object.keys(sources.inputSources ?? {}).length < 2)
            return;
        this._hint('keyboard', 'keyboard', {
            icon: 'keyboard', title: source.displayName ?? source.shortName, note: 'Keyboard layout',
            trailing: (source.shortName ?? '').toUpperCase(),
        }, {duration: 1600});
    }

    _screenshot(file) {
        this._lastScreenshot = Date.now();
        if (!this._island.allows('screenshot'))
            return;
        const picture = new Gio.FileIcon({file});
        this._island.set({
            id: 'hint:screenshot', kind: 'screenshot', hint: true, duration: 4000, view: 'info',
            data: {picture, icon: 'screenshot-region', title: 'Screenshot taken', note: 'Copied too · click to open'},
            onClick: () => {
                try {
                    Gio.AppInfo.launch_default_for_uri(file.get_uri(), global.create_app_launch_context(0, -1));
                } catch (e) {
                    console.log(`Halo: could not open the screenshot (${e.message})`);
                }
            },
        });
    }

    _copied(type, owner) {
        if (type !== Meta.SelectionType.SELECTION_CLIPBOARD || !owner || !this._settled)
            return;
        if (Date.now() - this._lastScreenshot < SCREENSHOT_COPY_MS || !this._island.allows('clipboard'))
            return;
        const types = owner.get_mimetypes?.() ?? [];
        // Password managers mark what they copy; it never shows.
        if (types.includes(PASSWORD_HINT))
            return;
        if (types.some(mime => mime.startsWith('image/')) && !types.some(mime => mime.startsWith('text/'))) {
            this._hint('clipboard', 'clipboard', {icon: 'content-copy', title: 'Image copied'}, {duration: 1600});
            return;
        }
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, content) => {
            const line = copiedText(content);
            const now = Date.now();
            if (!line || (line === this._lastCopy.text && now - this._lastCopy.at < SCREENSHOT_COPY_MS))
                return;
            this._lastCopy = {text: line, at: now};
            this._hint('clipboard', 'clipboard', {icon: 'content-copy', title: 'Copied', note: line}, {duration: 1800});
        });
    }
}
