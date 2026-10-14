// Extensions that change the same top bar as Halo. Halo does not fight
// them; it tells which are on, and the settings page shows a warning.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export const CONFLICTING = {
    'transparent-top-bar@zhanghai.me': 'Transparent Top Bar',
    'transparent-top-bar-tweaks@hectorandac.github.io': 'Transparent Top Bar (Adjustable transparency)',
    'top-bar-organizer@julian.gse.jsts.xyz': 'Top Bar Organizer',
    'blur-my-shell@aunetx': 'Blur my Shell',
};

export class Conflicts extends EventEmitter {
    constructor() {
        super();
        Main.extensionManager.connectObject('extension-state-changed', (_manager, extension) => {
            if (extension.uuid in CONFLICTING)
                this.emit('changed');
        }, this);
        const active = this.active;
        if (active.length > 0)
            console.warn(`Halo: these extensions change the same top bar: ${active.join(', ')}`);
    }

    // The names of the conflicting extensions that are running.
    get active() {
        return Object.entries(CONFLICTING)
            .filter(([uuid]) => Main.extensionManager.lookup(uuid)?.state === ExtensionState.ACTIVE)
            .map(([, name]) => name);
    }

    destroy() {
        Main.extensionManager.disconnectObject(this);
        this.disconnectAll();
    }
}
