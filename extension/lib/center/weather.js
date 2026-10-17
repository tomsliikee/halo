// The weather for the center: Open-Meteo, a free service without an
// account, for the place chosen in Ledge, else the place of GNOME Weather.
// Only the place's coordinates are sent. Asked when the center opens, at
// most every half hour.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {parsePlace, parseSoon, parseToday} from './forecast.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const FRESH_MS = 30 * 60 * 1000;
const TIMEOUT_S = 20;

// Ledge's place, read from its own settings schema.
function ledgePlace() {
    const extension = Main.extensionManager.lookup('ledge@thomashaiden');
    if (!extension?.dir)
        return null;
    try {
        const source = Gio.SettingsSchemaSource.new_from_directory(extension.dir.get_child('schemas').get_path(),
            Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup('org.gnome.shell.extensions.ledge', true);
        if (!schema?.has_key('place'))
            return null;
        return parsePlace(new Gio.Settings({settings_schema: schema}).get_string('place'));
    } catch {
        return null;
    }
}

// The place GNOME's date menu shows the weather for.
function gnomePlace() {
    const client = Main.panel.statusArea.dateMenu?._weatherItem?._weatherClient;
    const location = client?.hasLocation ? client.info?.get_location?.() : null;
    if (!location?.has_coords?.())
        return null;
    const [latitude, longitude] = location.get_coords();
    return {name: location.get_city_name?.() ?? location.get_name(), latitude, longitude};
}

export class WeatherModel extends EventEmitter {
    constructor() {
        super();
        this.place = null;
        this.today = null;
        // The next hour: {rainIn, rain, warning} (forecast.js), or null.
        this.soon = null;
        this._at = 0;
        this._session = null;
        this._cancellable = null;
    }

    // Asks again when the last answer is old or the place changed.
    refresh() {
        const place = ledgePlace() ?? gnomePlace();
        const moved = place?.name !== this.place?.name;
        this.place = place;
        if (!place) {
            this.today = null;
            this.emit('changed');
            return;
        }
        if (!moved && Date.now() - this._at < FRESH_MS)
            return;
        if (moved)
            this.today = null;
        this._fetch(place);
    }

    destroy() {
        this._cancellable?.cancel();
        this._session?.abort();
        this._session = null;
        this.disconnectAll();
    }

    _fetch(place) {
        this._session ??= new Soup.Session({user_agent: 'Halo (GNOME Shell extension)', timeout: TIMEOUT_S});
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();
        const query = [
            `latitude=${place.latitude.toFixed(3)}`, `longitude=${place.longitude.toFixed(3)}`,
            'current=temperature_2m,weather_code,is_day', 'daily=temperature_2m_max,temperature_2m_min',
            'forecast_days=1', 'timezone=auto',
            // The next hour in quarters, for the island's rain hint.
            'minutely_15=precipitation', 'forecast_minutely_15=5',
        ].join('&');
        const message = Soup.Message.new('GET', `${FORECAST}?${query}`);
        this._session.send_and_read_async(message, GLib.PRIORITY_LOW, this._cancellable, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                if (message.get_status() !== Soup.Status.OK)
                    throw new Error(`HTTP ${message.get_status()}`);
                const json = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                const today = parseToday(json);
                if (today) {
                    this.today = today;
                    this.soon = parseSoon(json, Date.now());
                    this._at = Date.now();
                    this.emit('changed');
                }
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.log(`Halo: no weather (${e.message})`);
            }
        });
    }
}
