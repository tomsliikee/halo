// Light or dark, and the colour style. Light and dark are GNOME's own
// colour scheme, so every app follows; "Auto" switches it at two fixed
// times. The colour style is Halo's and is handed on to Thomas' other
// extensions (siblings.js), so they all wear the same one.
//
// Emits "changed" when the style, the scheme or the colour changed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {isDarkAt, minutesToSwitch} from '../qs/words.js';
import {shareColour} from './siblings.js';

const CHECK_S = 300;

export class Appearance extends EventEmitter {
    // settings: Halo's SettingsStore.
    constructor(settings) {
        super();
        this._settings = settings;
        this._timer = 0;
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._interface.connectObject('changed::color-scheme', () => this._schemeChanged(), this);
        this.apply(settings.current);
    }

    get style() {
        return this._settings.current.darkStyle;
    }

    get colour() {
        return this._settings.current.colour;
    }

    get dark() {
        return this._interface.get_string('color-scheme') === 'prefer-dark';
    }

    // From the settings, also after an edit by hand.
    apply(settings) {
        this._schedule(settings);
        this.emit('changed');
    }

    setStyle(style) {
        this._settings.set('darkStyle', style);
        if (style !== 'auto')
            this._setDark(style === 'dark');
    }

    setColour(colour) {
        this._settings.set('colour', colour);
        shareColour(colour);
    }

    destroy() {
        this._stop();
        this._interface.disconnectObject(this);
        this.disconnectAll();
    }

    _setDark(dark) {
        const scheme = dark ? 'prefer-dark' : 'default';
        if (this._interface.get_string('color-scheme') !== scheme)
            this._interface.set_string('color-scheme', scheme);
    }

    // GNOME's own switch was used: Light or Dark follows it; Auto stays
    // until its next time comes.
    _schemeChanged() {
        if (this.style !== 'auto') {
            const style = this.dark ? 'dark' : 'light';
            if (style !== this.style)
                this._settings.set('darkStyle', style);
        }
        this.emit('changed');
    }

    _schedule({darkStyle, darkFrom, darkTo}) {
        this._stop();
        if (darkStyle !== 'auto')
            return;
        const now = GLib.DateTime.new_now_local();
        const minute = now.get_hour() * 60 + now.get_minute();
        this._setDark(isDarkAt(minute, darkFrom, darkTo));
        // Wakes at the next switch, a little after the minute turns. The
        // timer's clock stands still while the laptop sleeps, so it also
        // looks again every few minutes.
        const seconds = Math.min(minutesToSwitch(minute, darkFrom, darkTo) * 60 - now.get_second() + 1, CHECK_S);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._timer = 0;
            this._schedule(this._settings.current);
            return GLib.SOURCE_REMOVE;
        });
    }

    _stop() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
    }
}
