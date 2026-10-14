// GNOME's own top bar, put away while Halo's bar is on and brought back as
// it was. The panel itself stays alive: other extensions keep adding their
// indicators to Main.panel.statusArea, and Halo collects them from there.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class GnomePanel {
    constructor() {
        this._hidden = false;
    }

    hide() {
        if (this._hidden)
            return;
        const box = Main.layoutManager.panelBox;
        // A tracked actor keeps its strut even while hidden, so the work
        // area would keep GNOME's bar height on top of Halo's.
        Main.layoutManager.untrackChrome(box);
        box.hide();
        this._hidden = true;
    }

    show() {
        if (!this._hidden)
            return;
        const box = Main.layoutManager.panelBox;
        box.show();
        Main.layoutManager._trackActor(box, {affectsStruts: true, trackFullscreen: true});
        this._hidden = false;
    }

    destroy() {
        this.show();
    }
}
