// An app that is starting: its icon and name until its first window shows,
// so a slow start is seen to be happening.

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

// Longer than this and the start is not told any more.
const MAX_MS = 10000;

export class LaunchSource {
    constructor(island) {
        this._island = island;
        this._waits = new Map();
        Shell.AppSystem.get_default().connectObject('app-state-changed', (_system, app) => this._changed(app), this);
    }

    destroy() {
        Shell.AppSystem.get_default().disconnectObject(this);
        for (const id of [...this._waits.keys()])
            this._done(id);
    }

    _changed(app) {
        const id = app.get_id() ?? app.get_name();
        if (app.state === Shell.AppState.STARTING) {
            if (!this._island.allows('launch') || this._waits.has(id))
                return;
            this._waits.set(id, GLib.timeout_add(GLib.PRIORITY_DEFAULT, MAX_MS, () => {
                this._waits.delete(id);
                this._island.remove(`hint:launch:${id}`);
                return GLib.SOURCE_REMOVE;
            }));
            this._island.set({
                id: `hint:launch:${id}`, kind: 'launch', hint: true, sticky: true, duration: MAX_MS, view: 'info',
                data: {gicon: app.get_icon(), title: app.get_name(), note: 'Opening…'},
            });
        } else {
            this._done(id);
        }
    }

    _done(id) {
        const wait = this._waits.get(id);
        if (wait === undefined)
            return;
        GLib.source_remove(wait);
        this._waits.delete(id);
        this._island.remove(`hint:launch:${id}`);
    }
}
