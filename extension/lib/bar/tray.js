// Other extensions' and apps' top bar buttons that stay in Halo's bar, one
// by one as the settings say (barIcons). The real button moves out of
// GNOME's hidden panel into the bar, so its menu, right-click and tray
// behaviour stay its own; it goes back where it was when it leaves.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// The settings name a button by its tile's id.
export const trayKey = id => (id.startsWith('panel:') ? id.slice('panel:'.length) : null);

export class Tray {
    constructor() {
        this._box = null;
        // key -> {container, parent, index}
        this._moved = new Map();
    }

    // Moves the buttons named in `ids` into `box` (the main bar's) and the
    // others back.
    sync(box, ids) {
        if (box !== this._box)
            this.restore();
        this._box = box;
        const wanted = new Set(ids.map(trayKey).filter(Boolean));
        for (const key of [...this._moved.keys()]) {
            if (!wanted.has(key) || Main.panel.statusArea[key]?.container !== this._moved.get(key).container)
                this._putBack(key);
        }
        if (!box)
            return;
        for (const key of wanted) {
            const button = Main.panel.statusArea[key];
            const container = button?.container;
            if (!container || this._moved.has(key) || button.is_finalized?.())
                continue;
            const parent = container.get_parent();
            const index = parent ? parent.get_children().indexOf(container) : -1;
            parent?.remove_child(container);
            box.add_child(container);
            container.connectObject('destroy', () => this._moved.delete(key), this);
            this._moved.set(key, {container, parent, index});
        }
        box.visible = this._moved.size > 0;
    }

    restore() {
        for (const key of [...this._moved.keys()])
            this._putBack(key);
        if (this._box)
            this._box.visible = false;
    }

    destroy() {
        this.restore();
        this._box = null;
    }

    _putBack(key) {
        const {container, parent, index} = this._moved.get(key);
        this._moved.delete(key);
        container.disconnectObject(this);
        container.get_parent()?.remove_child(container);
        // A parent that went away: GNOME's right box, where buttons go.
        const home = parent && !parent.is_finalized?.() ? parent : Main.panel._rightBox;
        home.insert_child_at_index(container, Math.max(0, Math.min(index, home.get_n_children())));
    }
}
