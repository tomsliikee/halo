// Writes extension/symbols/ from tools/symbols.list.js: one symbolic SVG per
// symbol and catalog.json, which Halo reads.
//
//   gjs -m tools/build-symbols.js
//
// Brands come from Simple Icons (CC0), the rest from Material Symbols
// (Apache 2.0, rounded, filled), both fetched from jsDelivr at fixed
// versions. The files end in "-symbolic.svg", so St paints them in the
// colour of the text around them; every fill is removed for that.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {BRANDS, GENERIC} from './symbols.list.js';

const SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons';
const MATERIAL = 'https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/rounded';

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const out = Gio.File.new_for_path(`${root}/extension/symbols`);
const session = new Soup.Session();

function fetch(url) {
    const message = Soup.Message.new('GET', url);
    const bytes = session.send_and_read(message, null);
    if (message.get_status() !== Soup.Status.OK)
        throw new Error(`${url}: HTTP ${message.get_status()}`);
    return new TextDecoder().decode(bytes.toArray());
}

// Keeps the drawing, drops titles, fills and sizes, and gives every symbol
// the same 16 px box.
function symbolic(svg) {
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
    const paths = svg.match(/<path\b[^>]*\/>/g);
    if (!viewBox || !paths)
        throw new Error('no viewBox or path');
    const clean = paths.map(path => path.replace(/\s(fill|fill-rule|clip-rule)="[^"]*"/g, ''));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="${viewBox}">${clean.join('')}</svg>\n`;
}

function write(name, text) {
    out.get_child(name).replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

try {
    out.make_directory_with_parents(null);
} catch (e) {
    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
        throw e;
}

const catalog = [];
const failed = [];
for (const [group, list, base, suffix] of [['brand', BRANDS, SIMPLE_ICONS, ''], ['generic', GENERIC, MATERIAL, '-fill']]) {
    for (const [key, label, file, match] of list) {
        try {
            write(`halo-${key}-symbolic.svg`, symbolic(fetch(`${base}/${file}${suffix}.svg`)));
            catalog.push({key, label, group, match});
        } catch (e) {
            failed.push(`${key} (${e.message})`);
        }
    }
}
write('catalog.json', `${JSON.stringify(catalog, null, 1)}\n`);
print(`${catalog.length} symbols written to extension/symbols`);
if (failed.length > 0)
    printerr(`Not found: ${failed.join(', ')}`);
