import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Bars} from './lib/bar/bars.js';
import {GnomeMenus} from './lib/bar/gnomemenus.js';
import {GnomePanel} from './lib/bar/gnomepanel.js';
import {setMotion} from './lib/shared/choreo.js';
import {Conflicts} from './lib/shared/conflicts.js';
import {loadIcons, unloadIcons} from './lib/shared/icons.js';
import {SettingsStore} from './lib/shared/settings.js';
import {loadSymbols, unloadSymbols} from './lib/shared/symbols.js';
import {SystemState} from './lib/shared/system.js';
import {SchemeView, ThemeController} from './lib/shared/theme.js';

// Halo replaces GNOME's top bar, its OSD and banners, its date menu and its
// quick settings. Each of the four parts can be switched off on its own,
// and GNOME's own comes back in its place.
export default class HaloExtension extends Extension {
    enable() {
        loadIcons(this.dir.get_child('icons'));
        loadSymbols(this.dir.get_child('symbols'));
        this._settings = new SettingsStore(settings => this._settingsChanged(settings));
        setMotion(this._settings.current);
        this._theme = new ThemeController(this._settings.current.colour);
        // The bar and what it opens may stay light while the desktop is dark.
        this._barTheme = new SchemeView(this._theme, this._settings.current.lightBar);
        this._system = new SystemState();
        this._conflicts = new Conflicts();
        this._gnomePanel = new GnomePanel();
        this._gnomeMenus = new GnomeMenus();
        this._gnomeMenus.watch((name, open) => this._bars?.setOpen(name === 'dateMenu' ? 'clock' : 'status', open));
        this._bars = null;
        this._applyParts(this._settings.current);
    }

    disable() {
        this._bars?.destroy();
        this._bars = null;
        this._gnomeMenus.destroy();
        this._gnomeMenus = null;
        this._gnomePanel.destroy();
        this._gnomePanel = null;
        this._conflicts.destroy();
        this._conflicts = null;
        this._system.destroy();
        this._system = null;
        this._barTheme.destroy();
        this._barTheme = null;
        this._theme.destroy();
        this._theme = null;
        this._settings.destroy();
        this._settings = null;
        unloadSymbols();
        unloadIcons();
    }

    _applyParts(settings) {
        if (settings.parts.bar && !this._bars) {
            this._gnomePanel.hide();
            this._bars = new Bars(this._barTheme, this._system, {
                // Halo's own center and quick settings come in later steps;
                // until then, and whenever they are off, GNOME's open here.
                onClock: actor => this._gnomeMenus.toggle('dateMenu', actor),
                onStatus: actor => this._gnomeMenus.toggle('quickSettings', actor),
            });
            this._bars.setSettings(settings);
        } else if (!settings.parts.bar && this._bars) {
            this._bars.destroy();
            this._bars = null;
            this._gnomeMenus.destroy();
            this._gnomeMenus = new GnomeMenus();
            this._gnomeMenus.watch((name, open) => this._bars?.setOpen(name === 'dateMenu' ? 'clock' : 'status', open));
            this._gnomePanel.show();
        } else if (this._bars) {
            this._bars.setSettings(settings);
        }
    }

    _settingsChanged(settings) {
        setMotion(settings);
        this._theme.setColour(settings.colour);
        this._barTheme.setForceLight(settings.lightBar);
        this._applyParts(settings);
    }
}
