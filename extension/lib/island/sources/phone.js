// The phone, through GSConnect or KDE Connect where one runs: a word when
// its battery runs low. Calls and messages already come as notifications
// (banners.js). Only signals are heard; nothing is started.

import Gio from 'gi://Gio';

import {phoneBatteryText} from '../words.js';

const LOW = 20;
const SHOW_MS = 6000;

const GSCONNECT = 'org.gnome.Shell.Extensions.GSConnect';
const GSCONNECT_PATH = '/org/gnome/Shell/Extensions/GSConnect';
const KDECONNECT = 'org.kde.kdeconnect';
const KDE_BATTERY = 'org.kde.kdeconnect.device.battery';

// Whether a level is newly low: under the mark, not charging, and not low
// already before.
export function newlyLow(level, charging, before) {
    const low = !charging && level > 0 && level <= LOW;
    return {low, tell: low && !before};
}

export class PhoneSource {
    constructor(island) {
        this._island = island;
        this._bus = Gio.DBus.session;
        this._low = new Map();
        this._groups = new Map();
        this._cancellable = new Gio.Cancellable();
        this._watches = [
            Gio.bus_watch_name_on_connection(this._bus, GSCONNECT, Gio.BusNameWatcherFlags.NONE,
                () => this._gsconnectUp(), () => this._gsconnectDown()),
        ];
        // A phone paired later.
        this._added = this._bus.signal_subscribe(GSCONNECT, 'org.freedesktop.DBus.ObjectManager', 'InterfacesAdded',
            GSCONNECT_PATH, null, Gio.DBusSignalFlags.NONE, () => this._gsconnectUp());
        // KDE Connect sends "refreshed" from each device's battery.
        this._kdeSignal = this._bus.signal_subscribe(KDECONNECT, KDE_BATTERY, 'refreshed', null, null,
            Gio.DBusSignalFlags.NONE, (_c, _s, path, _i, _n, params) => {
                const [charging, level] = params.deepUnpack();
                this._battery(path, '', level, charging);
            });
    }

    destroy() {
        this._cancellable.cancel();
        for (const id of this._watches)
            Gio.bus_unwatch_name(id);
        this._watches = [];
        this._bus.signal_unsubscribe(this._kdeSignal);
        this._bus.signal_unsubscribe(this._added);
        this._gsconnectDown();
    }

    // GSConnect's devices, each with a "battery" action whose state is
    // (charging, icon, level, time).
    _gsconnectUp() {
        this._bus.call(GSCONNECT, GSCONNECT_PATH, 'org.freedesktop.DBus.ObjectManager', 'GetManagedObjects', null, null,
            Gio.DBusCallFlags.NO_AUTO_START, -1, this._cancellable, (bus, result) => {
                let objects;
                try {
                    [objects] = bus.call_finish(result).deepUnpack();
                } catch {
                    return;
                }
                for (const [path, interfaces] of Object.entries(objects)) {
                    const device = interfaces[`${GSCONNECT}.Device`];
                    if (!device || this._groups.has(path))
                        continue;
                    const name = device.Name?.deepUnpack?.() ?? '';
                    const group = Gio.DBusActionGroup.get(bus, GSCONNECT, path);
                    const look = () => {
                        const state = group.get_action_state('battery');
                        if (!state)
                            return;
                        const [charging, , level] = state.deepUnpack();
                        this._battery(path, name, level, charging);
                    };
                    group.connectObject('action-state-changed', (_g, action) => action === 'battery' && look(),
                        'action-added', (_g, action) => action === 'battery' && look(), this);
                    // Its actions come in only once one is asked for.
                    group.list_actions();
                    this._groups.set(path, group);
                }
            });
    }

    _gsconnectDown() {
        for (const group of this._groups.values())
            group.disconnectObject(this);
        this._groups.clear();
    }

    _battery(key, name, level, charging) {
        const {low, tell} = newlyLow(level, charging, this._low.get(key));
        this._low.set(key, low);
        if (!tell || !this._island.allows('phone'))
            return;
        const {title, note} = phoneBatteryText(name, level);
        this._island.set({
            id: `hint:phone-${key}`, kind: 'phone', hint: true, duration: SHOW_MS, view: 'info',
            data: {icon: 'mobile', tone: 'alarm', square: true, title, note},
        });
    }
}
