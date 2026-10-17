// Rain coming within the hour, or a weather warning: one word for each,
// from the weather the center shows too (../../center/weather.js). While
// this event is on, the weather is asked every half hour; without it, only
// when the center opens.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {rainText} from '../words.js';

const REFRESH_S = 30 * 60;
const SHOW_MS = 6000;

export class WeatherSource {
    constructor(island, weather) {
        this._island = island;
        this._weather = weather;
        // What was told, so the same rain is not told every half hour.
        this._told = null;
        weather.connectObject('changed', () => this._changed(), this);
        this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, REFRESH_S, () => {
            if (this._island.allows('weather') && !Main.sessionMode.isLocked)
                this._weather.refresh();
            return GLib.SOURCE_CONTINUE;
        });
        if (this._island.allows('weather'))
            this._weather.refresh();
    }

    destroy() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        this._weather.disconnectObject(this);
    }

    _changed() {
        const soon = this._weather.soon;
        const told = soon && (soon.warning || soon.rainIn !== null) ? `${soon.warning ?? 'rain'}` : null;
        const before = this._told;
        this._told = told;
        if (!told || told === before || !this._island.allows('weather'))
            return;
        const {title, note} = rainText(soon);
        this._island.set({
            id: 'hint:weather', kind: 'weather', hint: true, duration: SHOW_MS, view: 'info',
            data: {icon: soon.warning?.startsWith('Thunder') ? 'thunderstorm' : soon.warning?.includes('snow') ? 'weather-snowy' : 'rainy',
                tone: soon.warning ? 'alarm' : 'primary', square: true, title, note},
        });
    }
}
