// While Halo's center is on, whatever would open GNOME's date menu opens
// Halo's: the keyboard shortcut (Super+V), GNOME's own code that closes
// it, and the clock in GNOME's bar when Halo's bar is off. Undone on
// destroy.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class CenterTakeover {
    constructor(center) {
        this._saved = [];
        this._patch(Main.panel, 'toggleCalendar', () => center.toggle());
        this._patch(Main.panel, 'closeCalendar', () => center.close());
        const menu = Main.panel.statusArea.dateMenu?.menu;
        if (menu) {
            menu.close();
            this._patch(menu, 'open', () => center.open());
            this._patch(menu, 'toggle', () => center.toggle());
        }
    }

    // Shadows a method on the object itself, so the class stays untouched.
    _patch(object, name, replacement) {
        this._saved.push([object, name, Object.hasOwn(object, name), object[name]]);
        object[name] = replacement;
    }

    destroy() {
        for (const [object, name, own, value] of this._saved.reverse()) {
            if (own)
                object[name] = value;
            else
                delete object[name];
        }
        this._saved = [];
    }
}
