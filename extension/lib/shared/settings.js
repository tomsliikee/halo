// Halo's settings: a small JSON file in ~/.config/halo. Every key falls
// back to its default on its own, so one broken value never costs the rest.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {BAR_MODES, FREE_GROWS, HIDE_SECONDS} from '../bar/modes.js';
import {COLOURS} from './palettes.js';

export const BAR_LAYOUTS = ['full', 'left', 'centre', 'right', 'islands'];
export const DARK_STYLES = ['light', 'dark', 'auto'];
export const MOTION_SPEEDS = ['quick', 'normal', 'slow'];
// What a click on a small island does: open its app, or its large look.
export const ISLAND_CLICKS = ['app', 'large'];
// How far the island hangs further into the screen, in px.
export const ISLAND_DROPS = [0, 6, 12, 18, 24];

// What can open the island, each with its own switch.
export const ISLAND_EVENTS = [
    'volume', 'brightness', 'notifications', 'calls', 'media', 'recording', 'timer', 'charging',
    'settings', 'devices', 'privacy', 'progress', 'events', 'screenshot', 'clipboard', 'battery',
    'network', 'keyboard', 'powerMode', 'claude', 'workspace', 'launch', 'glance', 'locks', 'drives',
    'attention', 'updates', 'alarms', 'health', 'phone', 'weather', 'windows',
];
// Events that speak up so often they start switched off.
const QUIET_EVENTS = ['windows'];

// The four parts; each can be switched off and GNOME's own comes back.
export const PARTS = ['bar', 'island', 'center', 'quickSettings'];

const CHOICES = {
    colour: COLOURS,
    darkStyle: DARK_STYLES,
    barLayout: BAR_LAYOUTS,
    motionSpeed: MOTION_SPEEDS,
    islandClick: ISLAND_CLICKS,
    barMode: BAR_MODES,
    islandHideSeconds: HIDE_SECONDS,
    islandDrop: ISLAND_DROPS,
    islandFreeGrow: FREE_GROWS,
};

// Keys that hold one switch per name.
const SWITCHES = {parts: PARTS, islandEvents: ISLAND_EVENTS};

// Keys that hold a time of day as "HH:MM".
const TIMES = ['darkFrom', 'darkTo'];

// Keys that hold a list of words: tile ids in their order, hidden tile ids.
// and the tile ids of other extensions' icons that stay in the bar.
const WORD_LISTS = ['tileOrder', 'hiddenTiles', 'barIcons'];

function switches(value, names, off = []) {
    const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(names.map(name => [name, typeof source[name] === 'boolean' ? source[name] : !off.includes(name)]));
}

const OFF = {islandEvents: QUIET_EVENTS};

function words(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.filter(word => typeof word === 'string' && word))];
}

export function isTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(typeof value === 'string' ? value : '');
    return Boolean(match) && Number(match[1]) < 24 && Number(match[2]) < 60;
}

export const DEFAULTS = Object.freeze({
    parts: Object.freeze(switches(null, PARTS)),
    colour: 'blue',
    darkStyle: 'light',
    // Auto is dark from darkFrom until darkTo.
    darkFrom: '19:00',
    darkTo: '07:00',
    barLayout: 'full',
    // The bar floats 8px from the edges; off, it sits on them like GNOME's.
    floating: true,
    seeThrough: false,
    // The bar stays light when the desktop is dark.
    lightBar: false,
    hideInFullscreen: true,
    // "bar"; "island": no bar, the clock island alone reaches into the
    // window; "handle": only a grip at the top edge.
    barMode: 'bar',
    // How long a swipe up sends the clock island away in "island" mode.
    islandHideSeconds: 10,
    // A running thing (music, a timer…) rises into the bar's clock after a
    // moment below it; off, it stays floating below the bar.
    islandDock: true,
    // How far the resting island (without a bar to sit in) and what it
    // shows hang further into the screen.
    islandDrop: 0,
    // Its opened looks twice as wide.
    islandWide: false,
    islandFreeGrow: 25,
    islandEvents: Object.freeze(switches(null, ISLAND_EVENTS, QUIET_EVENTS)),
    // Where it has no app (a timer, volume), a click opens the large look.
    islandClick: 'app',
    tileOrder: Object.freeze([]),
    hiddenTiles: Object.freeze([]),
    barIcons: Object.freeze([]),
    expressiveMotion: true,
    motionSpeed: 'normal',
    // Writes what Halo decides to the journal; not in the settings page.
    debug: false,
});

// Takes whatever was parsed (or nothing) and returns complete settings.
export function normalize(raw) {
    const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const settings = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
        const value = source[key];
        if (key in SWITCHES)
            settings[key] = switches(value, SWITCHES[key], OFF[key]);
        else if (WORD_LISTS.includes(key))
            settings[key] = words(value);
        else if (TIMES.includes(key))
            settings[key] = isTime(value) ? value : fallback;
        else if (key in CHOICES)
            settings[key] = CHOICES[key].includes(value) ? value : fallback;
        else
            settings[key] = typeof value === 'boolean' ? value : fallback;
    }
    return settings;
}

export function parse(text) {
    try {
        return normalize(JSON.parse(text));
    } catch {
        return normalize(null);
    }
}

export function isValid(key, value) {
    if (!(key in DEFAULTS))
        return false;
    if (key in SWITCHES)
        return value !== null && typeof value === 'object' && SWITCHES[key].every(name => typeof value[name] === 'boolean');
    if (WORD_LISTS.includes(key))
        return JSON.stringify(words(value)) === JSON.stringify(value);
    if (TIMES.includes(key))
        return isTime(value);
    return key in CHOICES ? CHOICES[key].includes(value) : typeof value === 'boolean';
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Reads, writes and watches the file. onChange gets the complete settings
// whenever they differ from before, also after an edit by hand.
export class SettingsStore {
    constructor(onChange, {directory = GLib.build_filenamev([GLib.get_user_config_dir(), 'halo'])} = {}) {
        this._onChange = onChange;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'settings.json']));
        this._directory = Gio.File.new_for_path(directory);
        this.current = this._read();
        // The folder is watched, not the file: an atomic write replaces it.
        this._monitor = null;
        try {
            this._directory.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                logError(e, 'Halo: cannot create the settings folder');
        }
        try {
            this._monitor = this._directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._monitor.connect('changed', (_monitor, file, other) => {
                if (file?.get_basename() === 'settings.json' || other?.get_basename() === 'settings.json')
                    this._reload();
            });
        } catch (e) {
            logError(e, 'Halo: cannot watch the settings');
        }
    }

    set(key, value) {
        if (!isValid(key, value) || same(this.current[key], value))
            return;
        this.current = {...this.current, [key]: value};
        this._write();
        this._onChange(this.current);
    }

    destroy() {
        this._monitor?.cancel();
        this._monitor = null;
        this._onChange = () => {};
    }

    _read() {
        try {
            const [, bytes] = this._file.load_contents(null);
            return parse(new TextDecoder().decode(bytes));
        } catch {
            return normalize(null);
        }
    }

    _reload() {
        const next = this._read();
        if (same(next, this.current))
            return;
        this.current = next;
        this._onChange(this.current);
    }

    _write() {
        const bytes = new TextEncoder().encode(`${JSON.stringify(this.current, null, 2)}\n`);
        try {
            // replace_contents writes a temporary file and renames it.
            this._file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            logError(e, 'Halo: cannot save the settings');
        }
    }
}
