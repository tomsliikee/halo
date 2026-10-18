// Whether the island floats free in "island" mode: no window of the active
// workspace lies below it, dialogs included. Window moves and resizes are
// gathered into one look per frame; onChange(free) hears only a change.

import Meta from 'gi://Meta';

import {anyOverlaps, FREE_MARGIN} from '../bar/modes.js';

const BACKGROUND = [Meta.WindowType.DESKTOP, Meta.WindowType.DOCK];

// Desktops, docks, menus and tooltips never count; nor a window kept out
// of the task list (a desktop icons window), unless it is a dialog of
// another window.
function skipped(window) {
    if (window.is_override_redirect() || BACKGROUND.includes(window.get_window_type()))
        return true;
    return window.skip_taskbar && !window.get_transient_for();
}

export class FreeWatch {
    // rect(): {x, y, width, height} of the island at its grown width, or
    // null while there is none.
    constructor({rect, onChange}) {
        this._rect = rect;
        this._onChange = onChange;
        this._windows = new Set();
        this._later = 0;
        this.free = false;
        global.display.connectObject(
            'window-created', (_display, window) => this._watch(window),
            'restacked', () => this.queue(), this);
        // Super+D hides the windows without minimising them.
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this.queue(),
            'showing-desktop-changed', () => this.queue(), this);
        for (const actor of global.get_window_actors())
            this._watch(actor.meta_window);
        // Only once every window is known: a look before would find the
        // island free for a frame.
        this.free = this._look();
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
                    // Minimised, or hidden while the desktop shows.
                    minimized: window.minimized || !window.showing_on_its_workspace(),
                    skipped: skipped(window),
                };
            });
        return !anyOverlaps(around, windows);
    }
}
