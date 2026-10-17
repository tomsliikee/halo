// Updates ready to install, as PackageKit tells: only its signal is heard,
// so nothing wakes PackageKit that was not running anyway. When it says
// the updates changed, one transaction counts them; the island speaks up
// only when there are more than before.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {updatesText} from '../words.js';

const NAME = 'org.freedesktop.PackageKit';
const PATH = '/org/freedesktop/PackageKit';
const SHOW_MS = 5000;
// Just after Halo starts, a count is the first reading, not news.
const SETTLE_MS = 60 * 1000;

export class UpdatesSource {
    constructor(island) {
        this._island = island;
        this._count = null;
        this._startedAt = Date.now();
        this._cancellable = new Gio.Cancellable();
        this._bus = Gio.DBus.system;
        this._signal = this._bus.signal_subscribe(NAME, NAME, 'UpdatesChanged', PATH, null,
            Gio.DBusSignalFlags.NONE, () => this._changed());
    }

    destroy() {
        this._cancellable.cancel();
        this._bus.signal_unsubscribe(this._signal);
        this._signal = 0;
    }

    _changed() {
        if (!this._island.allows('updates'))
            return;
        this._countUpdates(count => {
            const before = this._count;
            this._count = count;
            if (before === null && Date.now() - this._startedAt < SETTLE_MS)
                return;
            if (count > (before ?? 0))
                this._tell(count);
        });
    }

    // Counts what GetUpdates lists, without the ones it marks as blocked.
    _countUpdates(done) {
        this._bus.call(NAME, PATH, NAME, 'CreateTransaction', null, new GLib.VariantType('(o)'),
            Gio.DBusCallFlags.NO_AUTO_START, -1, this._cancellable, (bus, result) => {
                let path;
                try {
                    [path] = bus.call_finish(result).deepUnpack();
                } catch {
                    return;
                }
                let count = 0;
                const iface = `${NAME}.Transaction`;
                const packages = bus.signal_subscribe(NAME, iface, 'Package', path, null, Gio.DBusSignalFlags.NONE,
                    (_c, _s, _p, _i, _n, params) => {
                        // The info enum: 18 is "blocked".
                        if (params.get_child_value(0).get_uint32() !== 18)
                            count++;
                    });
                const finished = bus.signal_subscribe(NAME, iface, 'Finished', path, null, Gio.DBusSignalFlags.NONE, () => {
                    bus.signal_unsubscribe(packages);
                    bus.signal_unsubscribe(finished);
                    if (!this._cancellable.is_cancelled())
                        done(count);
                });
                // Filter "none": every update there is.
                bus.call(NAME, path, iface, 'GetUpdates', new GLib.Variant('(t)', [0]), null,
                    Gio.DBusCallFlags.NONE, -1, this._cancellable, (_bus, callResult) => {
                        try {
                            _bus.call_finish(callResult);
                        } catch {
                            bus.signal_unsubscribe(packages);
                            bus.signal_unsubscribe(finished);
                        }
                    });
            });
    }

    _tell(count) {
        const {title, note} = updatesText(count);
        this._island.set({
            id: 'hint:updates', kind: 'updates', hint: true, duration: SHOW_MS, view: 'info',
            data: {icon: 'download', tone: 'primary', square: true, title, note},
            onClick: () => {
                try {
                    GLib.spawn_command_line_async('gnome-software --mode=updates');
                } catch (e) {
                    logError(e, 'Halo: cannot open Software');
                }
            },
        });
    }
}
