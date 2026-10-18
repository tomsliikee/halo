// Whether the island floats free in "island" mode: no window on the main
// monitor's active workspace lies below it. Window moves and resizes are
// gathered into one look per frame; onChange(free) hears only a change.

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {anyOverlaps, FREE_MARGIN} from '../bar/modes.js';

export class FreeWatch {
    // rect(): {x, y, width, height} of the island at its grown width, or
    // null while there is none.
    constructor({rect, onChange}) {
        this._rect = rect;
        this._onChange = onChange;
        this._windows = new Set();
        this._later = 0;
        this.free = this._look();
        global.display.connectObject(
            'window-created', (_display, window) => this._watch(window),
            'restacked', () => this.queue(), this);
        global.workspace_manager.connectObject('active-workspace-changed', () => this.queue(), this);
        for (const actor of global.get_window_actors())
            this._watch(actor.meta_window);
    }

    destroy() {
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        for (const window of this._windows)
            window.disconnectObject(this);
        this._windows.clear();
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
    }

    _watch(window) {
        if (this._windows.has(window))
            return;
        this._windows.add(window);
        window.connectObject(
            'unmanaged', () => {
                window.disconnectObject(this);
                this._windows.delete(window);
                this.queue();
            },
            'position-changed', () => this.queue(),
            'size-changed', () => this.queue(),
            'workspace-changed', () => this.queue(),
            'notify::minimized', () => this.queue(), this);
        this.queue();
    }

    // Looks again just before the next frame, once however often asked.
    queue() {
        if (this._later)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            const free = this._look();
            if (free !== this.free) {
                this.free = free;
                this._onChange(free);
            }
            return false;
        });
    }

    _look() {
        const rect = this._rect();
        if (!rect)
            return false;
        const monitor = Main.layoutManager.primaryIndex;
        const workspace = global.workspace_manager.get_active_workspace();
        const around = {
            x: rect.x - FREE_MARGIN, y: rect.y - FREE_MARGIN,
            width: rect.width + 2 * FREE_MARGIN, height: rect.height + 2 * FREE_MARGIN,
        };
        const windows = [...this._windows]
            .filter(window => window.get_workspace() === workspace || window.is_on_all_workspaces())
            .map(window => {
                const frame = window.get_frame_rect();
                return {
                    rect: {x: frame.x, y: frame.y, width: frame.width, height: frame.height},
                    minimized: window.minimized,
                    skipTaskbar: window.skip_taskbar || window.get_window_type() !== Meta.WindowType.NORMAL,
                    onMonitor: window.get_monitor() === monitor,
                };
            });
        return !anyOverlaps(around, windows);
    }
}
