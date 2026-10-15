// GNOME's list of notifications (and its media player) on the lock screen,
// kept hidden while the island tells about them there, so they do not show
// twice. GNOME makes the lock screen anew each time it locks; the list
// decides its own visibility in _updateVisibility, which is shadowed on
// that one list. A new notification still wakes the screen.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class LockBox {
    // takes(): whether the island takes notifications (Halo's settings).
    constructor(takes) {
        this._takes = takes;
        this._box = null;
        Main.screenShield?.connectObject('lock-screen-shown', () => this.update(), this);
    }

    // The screen locked or unlocked, or the setting changed.
    update() {
        const box = Main.sessionMode.isLocked && this._takes()
            ? Main.screenShield?._dialog?._notificationsBox ?? null
            : null;
        if (box === this._box)
            return;
        this._release();
        if (!box)
            return;
        this._box = box;
        box._updateVisibility = () => box.hide();
        box.connectObject('destroy', () => (this._box = null), this);
        box.hide();
    }

    destroy() {
        Main.screenShield?.disconnectObject(this);
        this._release();
    }

    _release() {
        const box = this._box;
        this._box = null;
        if (!box)
            return;
        box.disconnectObject(this);
        delete box._updateVisibility;
        box._updateVisibility();
    }
}
