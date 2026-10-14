import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {GnomePanel} from './lib/bar/gnomepanel.js';
import {setMotion} from './lib/shared/choreo.js';
import {SettingsStore} from './lib/shared/settings.js';
import {SchemeView, ThemeController} from './lib/shared/theme.js';

// Halo replaces GNOME's top bar, its OSD and banners, its date menu and its
// quick settings. Each of the four parts can be switched off on its own,
// and GNOME's own comes back in its place.
export default class HaloExtension extends Extension {
    enable() {
        this._settings = new SettingsStore(settings => this._settingsChanged(settings));
        setMotion(this._settings.current);
        this._theme = new ThemeController(this._settings.current.colour);
        // The bar and what it opens may stay light while the desktop is dark.
        this._barTheme = new SchemeView(this._theme, this._settings.current.lightBar);
        this._gnomePanel = new GnomePanel();
        this._applyParts(this._settings.current);
    }

    disable() {
        this._gnomePanel.destroy();
        this._gnomePanel = null;
        this._barTheme.destroy();
        this._barTheme = null;
        this._theme.destroy();
        this._theme = null;
        this._settings.destroy();
        this._settings = null;
    }

    _applyParts(settings) {
        if (settings.parts.bar)
            this._gnomePanel.hide();
        else
            this._gnomePanel.show();
    }

    _settingsChanged(settings) {
        setMotion(settings);
        this._theme.setColour(settings.colour);
        this._barTheme.setForceLight(settings.lightBar);
        this._applyParts(settings);
    }
}
