import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Bars} from './lib/bar/bars.js';
import {GnomeMenus} from './lib/bar/gnomemenus.js';
import {GnomePanel} from './lib/bar/gnomepanel.js';
import {strutHeight} from './lib/bar/layout.js';
import {GnomeQuickSettings} from './lib/qs/gnome.js';
import {QuickSettingsPanel} from './lib/qs/panel.js';
import {QuickSettingsTakeover} from './lib/qs/takeover.js';
import {TileSet} from './lib/qs/tiles.js';
import {Appearance} from './lib/shared/appearance.js';
import {setMotion} from './lib/shared/choreo.js';
import {Conflicts} from './lib/shared/conflicts.js';
import {loadIcons, unloadIcons} from './lib/shared/icons.js';
import {SettingsStore} from './lib/shared/settings.js';
import {loadSymbols, unloadSymbols} from './lib/shared/symbols.js';
import {SystemState} from './lib/shared/system.js';
import {SchemeView, ThemeController} from './lib/shared/theme.js';

// The gap between the bar and a panel that opens below it.
const PANEL_GAP = 8;

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
        this._appearance = new Appearance(this._settings);
        this._system = new SystemState();
        this._conflicts = new Conflicts();
        this._gnomePanel = new GnomePanel();
        this._gnomeQs = new GnomeQuickSettings();
        this._tiles = new TileSet(this._gnomeQs, this._appearance, this._settings);
        this._gnomeMenus = this._newGnomeMenus();
        this._bars = null;
        this._qs = null;
        this._takeover = null;
        this._applyParts(this._settings.current);
    }

    disable() {
        this._takeover?.destroy();
        this._takeover = null;
        this._qs?.destroy();
        this._qs = null;
        this._bars?.destroy();
        this._bars = null;
        this._gnomeMenus.destroy();
        this._gnomeMenus = null;
        this._tiles.destroy();
        this._tiles = null;
        this._gnomeQs.destroy();
        this._gnomeQs = null;
        this._gnomePanel.destroy();
        this._gnomePanel = null;
        this._conflicts.destroy();
        this._conflicts = null;
        this._system.destroy();
        this._system = null;
        this._appearance.destroy();
        this._appearance = null;
        this._barTheme.destroy();
        this._barTheme = null;
        this._theme.destroy();
        this._theme = null;
        this._settings.destroy();
        this._settings = null;
        unloadSymbols();
        unloadIcons();
    }

    _newGnomeMenus() {
        const menus = new GnomeMenus();
        menus.watch((name, open) => this._bars?.setOpen(name === 'dateMenu' ? 'clock' : 'status', open));
        return menus;
    }

    _applyParts(settings) {
        // The quick settings first: the bar's status pill opens them.
        if (settings.parts.quickSettings && !this._qs) {
            this._qs = new QuickSettingsPanel({
                theme: this._barTheme,
                settings: this._settings,
                appearance: this._appearance,
                system: this._system,
                gnome: this._gnomeQs,
                conflicts: this._conflicts,
                tiles: this._tiles,
                top: () => this._panelTop(),
            }, open => this._bars?.setOpen('status', open));
            this._takeover = new QuickSettingsTakeover(this._qs);
        } else if (!settings.parts.quickSettings && this._qs) {
            this._takeover.destroy();
            this._takeover = null;
            this._qs.destroy();
            this._qs = null;
        }

        if (settings.parts.bar && !this._bars) {
            this._gnomePanel.hide();
            this._bars = new Bars(this._barTheme, this._system, {
                // Halo's center comes in a later step; until then, and
                // whenever a part is off, GNOME's own opens here.
                onClock: actor => this._gnomeMenus.toggle('dateMenu', actor),
                onStatus: actor => (this._qs ? this._qs.toggle(actor) : this._gnomeMenus.toggle('quickSettings', actor)),
            });
            this._bars.setSettings(settings);
        } else if (!settings.parts.bar && this._bars) {
            this._bars.destroy();
            this._bars = null;
            this._gnomeMenus.destroy();
            this._gnomeMenus = this._newGnomeMenus();
            this._gnomePanel.show();
        } else if (this._bars) {
            this._bars.setSettings(settings);
        }
    }

    // Where a panel below the bar starts on the main monitor.
    _panelTop() {
        const monitor = Main.layoutManager.primaryMonitor;
        const settings = this._settings.current;
        const bar = this._bars ? strutHeight(settings.floating) - (settings.floating ? PANEL_GAP : 0) : Main.panel.height;
        return monitor.y + bar + PANEL_GAP;
    }

    _settingsChanged(settings) {
        setMotion(settings);
        this._theme.setColour(settings.colour);
        this._barTheme.setForceLight(settings.lightBar);
        this._appearance.apply(settings);
        this._tiles.settingsChanged();
        this._applyParts(settings);
        this._qs?.settingsChanged();
    }
}
