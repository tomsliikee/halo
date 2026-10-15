import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Bars} from './lib/bar/bars.js';
import {GnomeMenus} from './lib/bar/gnomemenus.js';
import {GnomePanel} from './lib/bar/gnomepanel.js';
import {strutHeight} from './lib/bar/layout.js';
import {Island} from './lib/island/island.js';
import {BannerSource} from './lib/island/sources/banners.js';
import {ClaudeSource} from './lib/island/sources/claude.js';
import {EventsSource} from './lib/island/sources/events.js';
import {MediaSource} from './lib/island/sources/media.js';
import {OsdSource} from './lib/island/sources/osd.js';
import {ProgressSource} from './lib/island/sources/progress.js';
import {SystemSource} from './lib/island/sources/system.js';
import {TimerSource} from './lib/island/sources/timer.js';
import {GnomeQuickSettings} from './lib/qs/gnome.js';
import {QuickSettingsPanel} from './lib/qs/panel.js';
import {QuickSettingsTakeover} from './lib/qs/takeover.js';
import {TileSet} from './lib/qs/tiles.js';
import {Appearance} from './lib/shared/appearance.js';
import {setMotion} from './lib/shared/choreo.js';
import {Conflicts} from './lib/shared/conflicts.js';
import {follow} from './lib/shared/follow.js';
import {loadIcons, unloadIcons} from './lib/shared/icons.js';
import {SettingsStore} from './lib/shared/settings.js';
import {loadSymbols, unloadSymbols} from './lib/shared/symbols.js';
import {SystemState} from './lib/shared/system.js';
import {TimerStore} from './lib/shared/timerstore.js';
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
        this._timers = new TimerStore();
        this._tiles = new TileSet(this._gnomeQs, this._appearance, this._settings, this._timers);
        this._gnomeMenus = this._newGnomeMenus();
        this._bars = null;
        this._qs = null;
        this._takeover = null;
        this._island = null;
        this._islandLater = 0;
        this._islandSources = [];
        this._unfollow = null;
        this._applyParts(this._settings.current);
    }

    disable() {
        this._stopIsland();
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
        this._timers.destroy();
        this._timers = null;
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
                onRebuilt: () => this._followClock(),
                // The island shows the date the bar has room for.
                onState: state => this._island?.setRest({
                    date: ['full', 'islands'].includes(this._settings.current.barLayout) ? state.date : state.dateShort,
                    time: state.time, unread: state.unread, open: state.clockOpen,
                }),
            });
            this._bars.setSettings(settings);
            this._bars.setIslandClock(Boolean(this._island));
        } else if (!settings.parts.bar && this._bars) {
            this._bars.destroy();
            this._bars = null;
            this._followClock();
            this._gnomeMenus.destroy();
            this._gnomeMenus = this._newGnomeMenus();
            this._gnomePanel.show();
        } else if (this._bars) {
            this._bars.setSettings(settings);
        }

        if (settings.parts.island && !this._island)
            this._startIsland();
        else if (!settings.parts.island && this._island)
            this._stopIsland();
    }

    _startIsland() {
        this._island = new Island({
            theme: this._theme,
            settings: this._settings,
            anchor: () => this._islandAnchor(),
            onClock: () => {
                const clock = this._bars?.primary?.clockPill;
                if (clock)
                    this._gnomeMenus.toggle('dateMenu', clock);
            },
        });
        const island = this._island;
        this._islandSources = [
            new OsdSource(island),
            new BannerSource(island),
            new MediaSource(island),
            new SystemSource(island, this._system),
            new TimerSource(island, this._timers, () => this._openQuickSettings('timer')),
            new ClaudeSource(island),
            new ProgressSource(island),
            new EventsSource(island),
        ];
        this._bars?.setIslandClock(true);
        this._bars?.setSettings(this._settings.current);
        this._followClock();
    }

    _queueIslandRelayout() {
        if (this._islandLater)
            return;
        this._islandLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._islandLater = 0;
            this._island?.relayout();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopIsland() {
        if (this._islandLater)
            global.compositor.get_laters().remove(this._islandLater);
        this._islandLater = 0;
        this._unfollow?.();
        this._unfollow = null;
        for (const source of this._islandSources.reverse())
            source.destroy();
        this._islandSources = [];
        this._island?.destroy();
        this._island = null;
        this._bars?.setIslandClock(false);
    }

    // The island goes where the main bar's clock goes.
    _followClock() {
        this._unfollow?.();
        this._unfollow = null;
        if (!this._island)
            return;
        const clock = this._bars?.primary?.clockPill ?? Main.panel.statusArea.dateMenu;
        // A move is seen during the stage's layout, where nothing may be
        // moved; the island follows just before the next frame is drawn.
        if (clock)
            this._unfollow = follow(clock, () => this._queueIslandRelayout());
        this._island.relayout();
    }

    // {x (centre), y (top), width, height, visible} of the clock the island
    // rests on; without Halo's bar it hangs below GNOME's panel.
    _islandAnchor() {
        const bar = this._bars?.primary;
        const clock = bar?.clockPill;
        const monitor = Main.layoutManager.primaryMonitor;
        if (clock?.get_stage()) {
            const [x, y] = clock.get_transformed_position();
            const [w, h] = clock.get_transformed_size();
            // Before its first allocation the clock has no size yet.
            if (![x, y, w, h].every(Number.isFinite))
                return null;
            return {
                x: x + w / 2, y, width: Math.round(w), height: Math.round(h),
                visible: clock.is_mapped() && !bar.hidden,
                fallbackY: monitor.y + PANEL_GAP,
            };
        }
        const dateMenu = Main.panel.statusArea.dateMenu;
        const [x] = dateMenu?.get_transformed_position() ?? [monitor.x + monitor.width / 2];
        const [w] = dateMenu?.get_transformed_size() ?? [0];
        return {x: x + w / 2, y: 0, width: 0, height: 0, visible: false, fallbackY: monitor.y + Main.panel.height + PANEL_GAP};
    }

    // Opens Halo's quick settings on one of its pages.
    _openQuickSettings(page) {
        if (!this._qs)
            return;
        this._qs.open(this._bars?.primary?.statusPill ?? null);
        this._qs.navigate(page);
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
        this._island?.relayout();
        this._qs?.settingsChanged();
    }
}
