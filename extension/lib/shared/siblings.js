// Thomas' other extensions wear the colour style chosen in Halo. Each keeps
// it in its own place: Harbor and Tally in a JSON file, Ember and Torch in
// their daemon (asked over D-Bus, so the change shows at once), Ledge in
// GSettings. An extension that is not installed, or does not know the
// colour yet, is left alone.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// [uuid, where the colour goes, the key there]
const SIBLINGS = [
    ['harbor@thomashaiden', {file: 'harbor'}, 'colour'],
    ['tally@thomashaiden', {file: 'tally'}, 'style'],
    ['ember@thomashaiden', {bus: 'io.github.tomsliikee.Ember'}, 'style'],
    ['torch@thomashaiden', {bus: 'io.github.tomsliikee.Torch'}, 'style'],
    ['ledge@thomashaiden', {gsettings: 'org.gnome.shell.extensions.ledge'}, 'style'],
];

// The colours an installed extension knows, read from its own code: the
// generated tokens of the four, Harbor's palette list.
function knownColours(extension) {
    for (const path of ['lib/tokens.js', 'lib/palettes.js']) {
        try {
            const [, bytes] = extension.dir.resolve_relative_path(path).load_contents(null);
            const source = new TextDecoder().decode(bytes);
            const match = /export const (?:styles|COLOURS) = (\[[^\]]*\])/.exec(source);
            if (match)
                return JSON.parse(match[1].replace(/'/g, '"'));
        } catch {
            // Not this file.
        }
    }
    return [];
}

function writeFile(name, key, colour) {
    const path = GLib.build_filenamev([GLib.get_user_config_dir(), name, 'settings.json']);
    const file = Gio.File.new_for_path(path);
    let settings = {};
    try {
        const [, bytes] = file.load_contents(null);
        settings = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        // No settings yet, or broken ones: start from nothing but the colour.
    }
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings))
        settings = {};
    if (settings[key] === colour)
        return;
    settings[key] = colour;
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
    const bytes = new TextEncoder().encode(`${JSON.stringify(settings, null, 2)}\n`);
    file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

function callDaemon(name, key, colour) {
    const path = `/${name.replaceAll('.', '/')}`;
    Gio.DBus.session.call(name, path, name, 'SetSetting',
        new GLib.Variant('(ss)', [key, JSON.stringify(colour)]), null,
        Gio.DBusCallFlags.NO_AUTO_START, -1, null, (connection, result) => {
            try {
                connection.call_finish(result);
            } catch (e) {
                console.log(`Halo: ${name} did not take the colour (${e.message})`);
            }
        });
}

function writeGSettings(extension, schemaId, key, colour) {
    const source = Gio.SettingsSchemaSource.new_from_directory(extension.dir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup(schemaId, true);
    if (!schema)
        return;
    const settings = new Gio.Settings({settings_schema: schema});
    if (settings.get_string(key) !== colour)
        settings.set_string(key, colour);
}

export function shareColour(colour) {
    for (const [uuid, place, key] of SIBLINGS) {
        const extension = Main.extensionManager.lookup(uuid);
        if (!extension || !knownColours(extension).includes(colour))
            continue;
        try {
            if (place.file)
                writeFile(place.file, key, colour);
            else if (place.bus)
                callDaemon(place.bus, key, colour);
            else
                writeGSettings(extension, place.gsettings, key, colour);
        } catch (e) {
            console.log(`Halo: cannot hand the colour to ${uuid} (${e.message})`);
        }
    }
}
