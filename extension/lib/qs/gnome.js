// GNOME's quick settings, read by Halo's: their toggles already follow
// NetworkManager, BlueZ, power-profiles-daemon and the rest, so Halo draws
// its own tiles over them instead of doing that work twice. Other
// extensions' toggles live in the same grid, and their panel buttons in
// the hidden top bar; both are found here.
//
// Emits "ready" once GNOME has set its quick settings up, and "changed"
// whenever toggles or panel buttons come or go.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {QuickMenuToggle, QuickToggle} from 'resource:///org/gnome/shell/ui/quickSettings.js';

// The quick settings are set up asynchronously at start-up; background
// apps come last.
const RETRY_MS = 500;
const RETRIES = 40;

// GNOME's own buttons in the top bar; every other one belongs to an
// extension or an app's tray icon.
const GNOME_BUTTONS = new Set([
    'activities', 'appMenu', 'dateMenu', 'quickSettings', 'a11y', 'keyboard',
    'dwellClick', 'screenRecording', 'screenSharing',
]);

// GNOME's indicators whose toggles Halo shows as they are (with GNOME's
// words): [id, indicator, how to find the toggle].
const PLAIN = [
    ['gnome-wired', qs => qs._network?._wiredToggle],
    ['gnome-modem', qs => qs._network?._modemToggle],
    ['gnome-tether', qs => qs._network?._btToggle],
    ['gnome-keyboard-light', qs => qs._backlight?.quickSettingsItems[0]],
    ['gnome-airplane', qs => qs._rfkill?.quickSettingsItems[0]],
    ['gnome-rotate', qs => qs._autoRotate?.quickSettingsItems[0]],
    ['gnome-unsafe', qs => qs._unsafeMode?.quickSettingsItems[0]],
];

export function isToggle(item) {
    return item instanceof QuickToggle || item instanceof QuickMenuToggle;
}

export class GnomeQuickSettings extends EventEmitter {
    constructor() {
        super();
        this.ready = false;
        this._tries = 0;
        this._retry = 0;
        this._changedId = 0;
        this._check();
    }

    get qs() {
        return Main.panel.statusArea.quickSettings;
    }

    // All of GNOME's own toggles and sliders, whether Halo draws them or not.
    get _gnomeItems() {
        const qs = this.qs;
        const indicators = [
            qs._system, qs._volumeOutput, qs._volumeInput, qs._brightness, qs._camera, qs._remoteAccess,
            qs._thunderbolt, qs._location, qs._network, qs._bluetooth, qs._powerProfiles, qs._nightLight,
            qs._darkMode, qs._doNotDisturb, qs._backlight, qs._rfkill, qs._autoRotate, qs._unsafeMode,
            qs._backgroundApps,
        ];
        return new Set(indicators.flatMap(indicator => indicator?.quickSettingsItems ?? []));
    }

    // [id, toggle] of GNOME's toggles that Halo shows in GNOME's words.
    get plain() {
        return PLAIN.map(([id, find]) => [id, find(this.qs)]).filter(([, toggle]) => isToggle(toggle));
    }

    // Toggles other extensions put into the quick settings, in their order.
    get foreignToggles() {
        const own = this._gnomeItems;
        const grid = this.qs.menu?._grid;
        if (!grid)
            return [];
        return grid.get_children().filter(child => isToggle(child) && !own.has(child));
    }

    // [key, button] of the top bar buttons of extensions and tray icons.
    get foreignButtons() {
        return Object.entries(Main.panel.statusArea)
            .filter(([key, button]) => !GNOME_BUTTONS.has(key) && button && !button.is_finalized?.());
    }

    destroy() {
        if (this._retry)
            GLib.source_remove(this._retry);
        this._retry = 0;
        if (this._changedId)
            GLib.source_remove(this._changedId);
        this._changedId = 0;
        this.qs?.menu?._grid?.disconnectObject(this);
        for (const box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox])
            box.disconnectObject(this);
        this.disconnectAll();
    }

    _check() {
        if (this.qs?._backgroundApps !== undefined) {
            this._watch();
            this.ready = true;
            this.emit('ready');
            return;
        }
        if (++this._tries > RETRIES) {
            console.warn('Halo: GNOME\'s quick settings did not come up');
            return;
        }
        this._retry = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_MS, () => {
            this._retry = 0;
            this._check();
            return GLib.SOURCE_REMOVE;
        });
    }

    _watch() {
        const changed = () => this._queueChanged();
        this.qs.menu._grid.connectObject('child-added', changed, 'child-removed', changed, this);
        for (const box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox])
            box.connectObject('child-added', changed, 'child-removed', changed, this);
    }

    // Extensions add several things at once; one "changed" is enough.
    _queueChanged() {
        if (this._changedId)
            return;
        this._changedId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._changedId = 0;
            this.emit('changed');
            return GLib.SOURCE_REMOVE;
        });
    }
}
