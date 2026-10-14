// One place that knows the colour style, light or dark, and whether the
// desktop animates. Everything that paints listens to "changed".

import Gio from 'gi://Gio';
import St from 'gi://St';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {palette, warn} from './palettes.js';

export class ThemeController extends EventEmitter {
    constructor(colour) {
        super();
        this.colour = colour;
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this.scheme = this._readScheme();
        this.animations = St.Settings.get().enable_animations;
        this._interface.connectObject('changed::color-scheme', () => {
            const scheme = this._readScheme();
            if (scheme !== this.scheme) {
                this.scheme = scheme;
                this.emit('changed');
            }
        }, this);
        St.Settings.get().connectObject('notify::enable-animations', () => {
            this.animations = St.Settings.get().enable_animations;
            this.emit('changed');
        }, this);
    }

    // The roles of the current style in the current scheme.
    get roles() {
        return palette(this.colour, this.scheme);
    }

    // The same style in the other scheme, or a fixed one (a dark surface on a light desktop).
    rolesIn(scheme) {
        return palette(this.colour, scheme);
    }

    get warn() {
        return warn[this.scheme];
    }

    get key() {
        return `${this.colour}-${this.scheme}`;
    }

    setColour(colour) {
        if (colour === this.colour)
            return;
        this.colour = colour;
        this.emit('changed');
    }

    destroy() {
        this._interface.disconnectObject(this);
        St.Settings.get().disconnectObject(this);
        this.disconnectAll();
    }

    _readScheme() {
        return this._interface.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
    }
}

// The theme as the bar sees it: the same colour style, but kept light
// with "Light bar" while the desktop is dark. Same API as the controller.
export class SchemeView extends EventEmitter {
    constructor(theme, forceLight = false) {
        super();
        this._theme = theme;
        this._forceLight = forceLight;
        theme.connectObject('changed', () => this.emit('changed'), this);
    }

    setForceLight(on) {
        if (on === this._forceLight)
            return;
        const before = this.scheme;
        this._forceLight = on;
        if (this.scheme !== before)
            this.emit('changed');
    }

    get scheme() {
        return this._forceLight ? 'light' : this._theme.scheme;
    }

    get colour() {
        return this._theme.colour;
    }

    get animations() {
        return this._theme.animations;
    }

    get roles() {
        return palette(this.colour, this.scheme);
    }

    rolesIn(scheme) {
        return palette(this.colour, scheme);
    }

    get warn() {
        return warn[this.scheme];
    }

    get key() {
        return `${this.colour}-${this.scheme}`;
    }

    destroy() {
        this._theme.disconnectObject(this);
        this.disconnectAll();
    }
}

// Swaps the colour class of a root actor; the stylesheet does the rest.
export function setScheme(actor, key) {
    for (const name of (actor.get_style_class_name() ?? '').split(' ')) {
        if (name.startsWith('halo-scheme-'))
            actor.remove_style_class_name(name);
    }
    actor.add_style_class_name(`halo-scheme-${key}`);
}
