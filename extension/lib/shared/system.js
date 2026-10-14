// What the system is doing right now, read from GNOME Shell's own status
// indicators: they already follow NetworkManager, PulseAudio, the camera
// portal and the screencast, so Halo watches them instead of doing that
// work twice. The battery comes straight from UPower's display device.
//
// Emits "changed" whenever anything the bar or the island shows changed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import UPower from 'gi://UPowerGlib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';
import {getInputSourceManager} from 'resource:///org/gnome/shell/ui/status/keyboard.js';

const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXML('org.freedesktop.UPower.Device'));

// The quick settings' indicators are set up asynchronously at start-up;
// until they exist, look again this often, this many times.
const RETRY_MS = 500;
const RETRIES = 40;

export class SystemState extends EventEmitter {
    constructor() {
        super();
        this._watched = new Set();
        this._retry = 0;
        this._tries = 0;
        this._proxy = new DeviceProxy(Gio.DBus.system, 'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice', (proxy, error) => {
                if (error) {
                    console.log(`Halo: no battery information (${error.message})`);
                    return;
                }
                this._proxy?.connectObject('g-properties-changed', () => this.emit('changed'), this);
                this.emit('changed');
            });
        this._inputSources = getInputSourceManager();
        this._inputSources.connectObject(
            'current-source-changed', () => this.emit('changed'),
            'sources-changed', () => this.emit('changed'), this);
        Main.screenshotUI.connectObject('notify::screencast-in-progress', () => this._recordingChanged(), this);
        this._recordingSince = Main.screenshotUI.screencast_in_progress ? GLib.get_monotonic_time() : 0;
        this._watchIndicators();
    }

    // {icon (GNOME icon name), visible} of the main connection and the VPN.
    get network() {
        const network = this._qs?._network;
        return {
            icon: network?._primaryIndicator?.visible ? network._primaryIndicator.icon_name : null,
            vpn: Boolean(network?._vpnIndicator?.visible),
        };
    }

    get volumeIcon() {
        return this._qs?._volumeOutput?._indicator?.icon_name ?? null;
    }

    get bluetooth() {
        return Boolean(this._qs?._bluetooth?._indicator?.visible);
    }

    // null without a battery.
    get battery() {
        const proxy = this._proxy;
        if (!proxy || !proxy.IsPresent || proxy.Type !== UPower.DeviceKind.BATTERY)
            return null;
        const charging = proxy.State === UPower.DeviceState.CHARGING ||
            proxy.State === UPower.DeviceState.PENDING_CHARGE || proxy.State === UPower.DeviceState.FULLY_CHARGED;
        return {
            percent: proxy.Percentage,
            charging,
            full: proxy.State === UPower.DeviceState.FULLY_CHARGED,
            secondsLeft: charging ? proxy.TimeToFull : proxy.TimeToEmpty,
        };
    }

    // The microphone is in use and not muted.
    get microphone() {
        const indicator = this._qs?._volumeInput?._indicator;
        return Boolean(indicator?.visible && indicator.has_style_class_name('privacy-indicator'));
    }

    get camera() {
        return Boolean(this._qs?._camera?.visible);
    }

    get screenSharing() {
        return Boolean(Main.panel.statusArea.screenSharing?.visible);
    }

    // Seconds since the screencast started, or null.
    get recordingSeconds() {
        if (!this._recordingSince)
            return null;
        return Math.floor((GLib.get_monotonic_time() - this._recordingSince) / 1e6);
    }

    stopRecording() {
        Main.screenshotUI.stopScreencast();
    }

    // The short name of the keyboard layout, or null with only one.
    get keyboardLayout() {
        const sources = Object.keys(this._inputSources.inputSources ?? {});
        if (sources.length < 2)
            return null;
        return this._inputSources.currentSource?.shortName ?? null;
    }

    nextKeyboardLayout() {
        const sources = this._inputSources.inputSources ?? {};
        const indexes = Object.keys(sources).map(Number).sort((a, b) => a - b);
        const current = this._inputSources.currentSource?.index ?? 0;
        const next = indexes[(indexes.indexOf(current) + 1) % indexes.length];
        sources[next]?.activate(true);
    }

    // GNOME's date menu keeps the count of unseen notifications.
    get unread() {
        return Boolean(Main.panel.statusArea.dateMenu?._indicator?.visible);
    }

    destroy() {
        if (this._retry)
            GLib.source_remove(this._retry);
        this._retry = 0;
        for (const object of this._watched)
            object.disconnectObject(this);
        this._watched.clear();
        this._proxy?.disconnectObject(this);
        this._proxy = null;
        this._inputSources.disconnectObject(this);
        Main.screenshotUI.disconnectObject(this);
        this.disconnectAll();
    }

    get _qs() {
        return Main.panel.statusArea.quickSettings;
    }

    _recordingChanged() {
        this._recordingSince = Main.screenshotUI.screencast_in_progress ? GLib.get_monotonic_time() : 0;
        this.emit('changed');
    }

    _watch(object, signals) {
        if (!object || this._watched.has(object))
            return;
        this._watched.add(object);
        const handlers = signals.flatMap(signal => [signal, () => this.emit('changed')]);
        object.connectObject(...handlers, this);
    }

    _watchIndicators() {
        const qs = this._qs;
        const network = qs?._network;
        this._watch(network?._primaryIndicator, ['notify::icon-name', 'notify::visible']);
        this._watch(network?._vpnIndicator, ['notify::visible']);
        this._watch(qs?._volumeOutput?._indicator, ['notify::icon-name', 'notify::visible']);
        this._watch(qs?._volumeInput?._indicator, ['notify::visible', 'style-changed']);
        this._watch(qs?._bluetooth?._indicator, ['notify::visible']);
        this._watch(qs?._camera, ['notify::visible']);
        this._watch(Main.panel.statusArea.screenSharing, ['notify::visible']);
        this._watch(Main.panel.statusArea.dateMenu?._indicator, ['notify::visible']);
        // NetworkManager and Bluetooth come last, after an import.
        // Without NetworkManager or BlueZ they are set to null, not left out.
        const complete = qs?._volumeOutput && qs?._system &&
            qs._network !== undefined && qs._bluetooth !== undefined;
        if (complete || this._tries >= RETRIES) {
            this.emit('changed');
            return;
        }
        this._tries++;
        this._retry = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_MS, () => {
            this._retry = 0;
            this._watchIndicators();
            return GLib.SOURCE_REMOVE;
        });
    }
}
