// Writes extension/icons/ from tools/icons.list.js: every interface icon in
// its outlined and its filled form, from Material Symbols (Apache 2.0,
// rounded, weight 400), fetched from jsDelivr or unpkg at a fixed version.
//
//   gjs -m tools/build-icons.js
//
// The files end in "-symbolic.svg", so St paints them in the colour of the
// text around them; every fill is removed for that.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {ICONS} from './icons.list.js';

const PACKAGE = '@material-symbols/svg-400@0.48.0/rounded';
// jsDelivr answers 503 for some files it has not cached; unpkg serves the
// same package.
const MIRRORS = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const out = Gio.File.new_for_path(`${root}/extension/icons`);
const session = new Soup.Session();

function fetch(file) {
    let status = 0;
    for (const mirror of MIRRORS) {
        const message = Soup.Message.new('GET', `${mirror}/${PACKAGE}/${file}`);
        const bytes = session.send_and_read(message, null);
        status = message.get_status();
        if (status === Soup.Status.OK)
            return new TextDecoder().decode(bytes.toArray());
    }
    throw new Error(`HTTP ${status}`);
}

// Keeps the drawing, drops titles, fills and sizes.
function symbolic(svg) {
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
    const paths = svg.match(/<path\b[^>]*\/>/g);
    if (!viewBox || !paths)
        throw new Error('no viewBox or path');
    const clean = paths.map(path => path.replace(/\s(fill|fill-rule|clip-rule)="[^"]*"/g, ''));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="${viewBox}">${clean.join('')}</svg>\n`;
}

try {
    out.make_directory_with_parents(null);
} catch (e) {
    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
        throw e;
}

const failed = [];
let written = 0;
for (const name of new Set(ICONS)) {
    for (const [suffix, form] of [['', ''], ['-fill', '-fill']]) {
        try {
            const file = out.get_child(`halo-${name.replaceAll('_', '-')}${form}-symbolic.svg`);
            // jsDelivr turns many requests away for a while; a second run
            // fetches only what is missing.
            if (file.query_exists(null)) {
                written++;
                continue;
            }
            file.replace_contents(new TextEncoder().encode(symbolic(fetch(`${name}${suffix}.svg`))),
                null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            written++;
        } catch (e) {
            failed.push(`${name}${suffix} (${e.message})`);
        }
    }
}
print(`${written} icons written to extension/icons`);
if (failed.length > 0)
    printerr(`Not found: ${failed.join(', ')}`);
