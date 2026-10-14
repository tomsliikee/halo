// While Halo's quick settings are on, whatever would open GNOME's opens
// Halo's: the button in GNOME's bar (when Halo's bar is off), the keyboard
// shortcut, and GNOME's own code that closes them. Undone on destroy.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class QuickSettingsTakeover {
    constructor(panel) {
        this._saved = [];
        this._patch(Main.panel, 'toggleQuickSettings', () => panel.toggle());
        this._patch(Main.panel, 'closeQuickSettings', () => panel.close());
        const menu = Main.panel.statusArea.quickSettings?.menu;
        if (menu) {
            menu.close();
            this._patch(menu, 'open', () => panel.open());
            this._patch(menu, 'toggle', () => panel.toggle());
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
