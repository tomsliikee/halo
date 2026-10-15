// Downloads and copies that apps report through the LauncherEntry API
// (com.canonical.Unity.LauncherEntry, which Files, Firefox and many others
// send): one lasting pill per app with its progress.

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import {percentText} from '../../bar/words.js';

const INTERFACE = 'com.canonical.Unity.LauncherEntry';

// "application://org.gnome.Nautilus.desktop" to the app.
function appFor(uri) {
    const id = (uri ?? '').replace(/^application:\/\//, '');
    return id ? Shell.AppSystem.get_default().lookup_app(id) : null;
}

export class ProgressSource {
    constructor(island) {
        this._island = island;
        this._shown = new Set();
        this._signal = Gio.DBus.session.signal_subscribe(null, INTERFACE, 'Update', null, null,
            Gio.DBusSignalFlags.NONE, (_c, _sender, _p, _i, _n, args) => {
                const [uri, properties] = args.recursiveUnpack();
                this._update(uri, properties ?? {});
            });
    }

    destroy() {
        Gio.DBus.session.signal_unsubscribe(this._signal);
        for (const id of this._shown)
            this._island.remove(id);
        this._shown.clear();
    }

    _update(uri, properties) {
        const id = `progress:${uri}`;
        const visible = properties['progress-visible'];
        const progress = properties.progress;
        if (visible === false || typeof progress !== 'number' || !this._island.allows('progress')) {
            // An update without progress (only a count) leaves it be.
            if (visible === false || !this._island.allows('progress')) {
                this._island.remove(id);
                this._shown.delete(id);
            }
            return;
        }
        if (progress >= 1) {
            this._island.remove(id);
            this._shown.delete(id);
            return;
        }
        const app = appFor(uri);
        this._shown.add(id);
        this._island.set({
            id, kind: 'progress', view: 'info',
            data: {
                icon: 'download', gicon: app?.get_icon() ?? null, tone: 'soft',
                title: app?.get_name() ?? 'In progress', note: 'Working on it',
                trailing: percentText(progress * 100),
            },
            onClick: app ? () => app.activate() : null,
        });
    }
}
