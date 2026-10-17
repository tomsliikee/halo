// The top edge of the main monitor while the bar is away: pushing the
// pointer up against it brings the bar down. A pressure barrier, as GNOME's
// hot corner uses, so nothing lies over the windows: a click in the top
// pixel row of a fullscreen app still reaches the app.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// How far the pointer has to push, in pixels, within the time below.
const THRESHOLD = 40;
const TIMEOUT_MS = 800;

export class TopEdge {
    constructor(onPush) {
        this._barrier = null;
        this._rect = '';
        this._pressure = new Layout.PressureBarrier(THRESHOLD, TIMEOUT_MS,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
        this._pressure.connect('trigger', () => onPush());
    }

    // on: the bar is away and may be pushed down.
    sync(on) {
        const monitor = Main.layoutManager.primaryMonitor;
        const rect = on && monitor ? `${monitor.x},${monitor.y},${monitor.width}` : '';
        if (rect === this._rect)
            return;
        this._rect = rect;
        this._remove();
        if (!rect)
            return;
        this._barrier = new Meta.Barrier({
            backend: global.backend,
            x1: monitor.x, x2: monitor.x + monitor.width, y1: monitor.y, y2: monitor.y,
            directions: Meta.BarrierDirection.POSITIVE_Y,
        });
        this._pressure.addBarrier(this._barrier);
    }

    destroy() {
        this._remove();
        this._pressure.destroy();
    }

    _remove() {
        if (!this._barrier)
            return;
        this._pressure.removeBarrier(this._barrier);
        this._barrier.destroy();
        this._barrier = null;
    }
}
