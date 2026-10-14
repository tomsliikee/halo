// Halo's interface icons (extension/icons, see tools/build-icons.js):
// Material Symbols, rounded, outlined and filled. The file names end in
// "-symbolic.svg", so St paints them in the colour of their style.

import Gio from 'gi://Gio';
import St from 'gi://St';

let folder = null;
const cache = new Map();

export function loadIcons(directory) {
    folder = directory;
}

export function unloadIcons() {
    folder = null;
    cache.clear();
}

// name: a Material Symbols name with dashes ("battery-5-bar").
export function iconGicon(name, fill = false) {
    const file = `halo-${name}${fill ? '-fill' : ''}-symbolic.svg`;
    if (!folder)
        return null;
    if (!cache.has(file))
        cache.set(file, new Gio.FileIcon({file: folder.get_child(file)}));
    return cache.get(file);
}

export function icon(name, {size = 20, fill = false, styleClass = ''} = {}) {
    return new St.Icon({gicon: iconGicon(name, fill), icon_size: size, style_class: styleClass});
}

export function setIcon(actor, name, fill = false) {
    actor.gicon = iconGicon(name, fill);
}
