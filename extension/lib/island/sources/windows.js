// Switching to another app's window: a short word of where one is now,
// its app and the window's title. Not in the overview, not for a window
// that just opened (launch.js tells that), not for the same app.

import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHOW_MS = 900;
// A window this new was opened, not switched to.
const NEW_MS = 1500;

export class WindowsSource {
    constructor(island) {
        this._island = island;
        this._app = null;
        this._born = new WeakMap();
        global.display.connectObject(
            'window-created', (_display, window) => this._born.set(window, Date.now()),
            'notify::focus-window', () => this._focused(), this);
    }

    destroy() {
        global.display.disconnectObject(this);
    }

    _focused() {
        const window = global.display.focus_window;
        const app = window ? Shell.WindowTracker.get_default().get_window_app(window) : null;
        const before = this._app;
        this._app = app;
        if (!window || !app || app === before || !before || window.skip_taskbar)
            return;
        if (Main.overview.visible || Main.layoutManager._startingUp || !this._island.allows('windows'))
            return;
        if (Date.now() - (this._born.get(window) ?? 0) < NEW_MS)
            return;
        this._island.set({
            id: 'hint:windows', kind: 'windows', hint: true, duration: SHOW_MS, view: 'info',
            data: {gicon: app.get_icon(), icon: 'apps', tone: 'secondary', square: true, title: app.get_name(), note: window.get_title() ?? ''},
        });
    }
}
