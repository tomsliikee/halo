// GNOME's own date menu and quick settings, opened from Halo's bar while
// Halo's notification center or quick settings are switched off. They
// belong to the hidden panel, so their pointer is moved to Halo's pill for
// as long as Halo's bar is there.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class GnomeMenus {
    constructor() {
        // menu → its own source actor, to put back.
        this._moved = new Map();
    }

    // name: "dateMenu" or "quickSettings".
    toggle(name, actor) {
        const button = Main.panel.statusArea[name];
        const menu = button?.menu;
        if (!menu)
            return;
        if (!this._moved.has(menu))
            this._moved.set(menu, menu.sourceActor);
        menu.sourceActor = actor;
        menu.toggle();
    }

    isOpen(name) {
        return Boolean(Main.panel.statusArea[name]?.menu?.isOpen);
    }

    // Calls back with (name, open) whenever one of the two opens or closes.
    watch(callback) {
        for (const name of ['dateMenu', 'quickSettings']) {
            Main.panel.statusArea[name]?.menu?.connectObject('open-state-changed',
                (_menu, open) => callback(name, open), this);
        }
    }

    destroy() {
        for (const name of ['dateMenu', 'quickSettings'])
            Main.panel.statusArea[name]?.menu?.disconnectObject(this);
        for (const [menu, source] of this._moved) {
            menu.close();
            menu.sourceActor = source;
        }
        this._moved.clear();
    }
}
