// Moving to another workspace: a short word of where one is now, its name
// or number and what is open there. Not while the overview shows the
// workspaces anyway, and not for the move GNOME makes at the start.

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {workspaceNote, workspaceTitle} from '../words.js';

const SHOW_MS = 1400;
const APPS = 3;

export class WorkspaceSource {
    constructor(island) {
        this._island = island;
        this._prefs = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        global.workspace_manager.connectObject('active-workspace-changed', () => this._changed(), this);
    }

    destroy() {
        global.workspace_manager.disconnectObject(this);
        this._prefs = null;
    }

    _changed() {
        if (Main.overview.visible || Main.layoutManager._startingUp || !this._island.allows('workspace'))
            return;
        const manager = global.workspace_manager;
        const index = manager.get_active_workspace_index();
        const windows = manager.get_active_workspace().list_windows().filter(window => !window.skip_taskbar);
        const tracker = Shell.WindowTracker.get_default();
        const names = [...new Set(windows.map(window => tracker.get_window_app(window)?.get_name()).filter(Boolean))].slice(0, APPS);
        const note = [workspaceNote(windows.length), names.join(', ')].filter(Boolean).join(' · ');
        this._island.set({
            id: 'hint:workspace', kind: 'workspace', hint: true, duration: SHOW_MS, view: 'info',
            data: {icon: 'grid-view', tone: 'secondary', square: true, title: workspaceTitle(index, this._prefs.get_strv('workspace-names')), note},
        });
    }
}
