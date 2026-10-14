// Symbols: one flat glyph per app, so the bar and Harbor's dock look all of a piece.
// Halo ships Harbor's set (extension/symbols, see tools/build-symbols.js); an
// app shows the one chosen for it, else the one that matches its id, else
// its icon theme's symbolic icon, else its real icon in one colour.
//
// Matching by id is in match.js, as plain data in and out.

import Gio from 'gi://Gio';
import St from 'gi://St';

import {matchSymbol} from './match.js';

let folder = null;
let catalog = [];
let byKey = new Map();
let iconTheme = null;

// Reads the shipped catalog once, when Halo is switched on.
export function loadSymbols(directory) {
    folder = directory;
    try {
        const [, bytes] = directory.get_child('catalog.json').load_contents(null);
        catalog = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
        logError(e, 'Halo: cannot read the symbols');
        catalog = [];
    }
    byKey = new Map(catalog.map(entry => [entry.key, entry]));
}

export function unloadSymbols() {
    folder = null;
    catalog = [];
    byKey = new Map();
    iconTheme = null;
}

// [{key, label, group}], brands first.
export function allSymbols() {
    return catalog;
}

// The file of a shipped symbol; its name ends in "-symbolic.svg", so the
// shell paints it in the colour of its style.
export function symbolGicon(key) {
    if (!folder || !byKey.has(key))
        return null;
    return new Gio.FileIcon({file: folder.get_child(`halo-${key}-symbolic.svg`)});
}

function hasIcon(name) {
    try {
        iconTheme ??= new St.IconTheme();
        return iconTheme.has_icon(name);
    } catch {
        return false;
    }
}

// The app's symbolic icon if its icon theme has one.
export function themeSymbolic(app) {
    const icon = app.get_app_info()?.get_icon();
    if (!(icon instanceof Gio.ThemedIcon))
        return null;
    for (const name of icon.get_names()) {
        const symbolic = name.endsWith('-symbolic') ? name : `${name}-symbolic`;
        if (hasIcon(symbolic))
            return new Gio.ThemedIcon({name: symbolic});
    }
    return null;
}

// The key chosen for the app, or the one that matches it, or null.
export function symbolKeyFor(appId, chosen = {}) {
    const key = chosen[appId];
    if (key && byKey.has(key))
        return key;
    return matchSymbol(appId, catalog);
}

// What stands for the app: a gicon, or null for its real icon.
export function symbolFor(app, chosen = {}) {
    const key = symbolKeyFor(app.get_id() ?? '', chosen);
    return key ? symbolGicon(key) : themeSymbolic(app);
}
