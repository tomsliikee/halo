// The world clocks chosen in GNOME Clocks, which GNOME Shell keeps in
// org.gnome.shell.world-clocks.

import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather';
import Gio from 'gi://Gio';

// [{name, timezone (GLib.TimeZone)}], in the order Clocks has them.
export function worldClocks() {
    try {
        const settings = new Gio.Settings({schema_id: 'org.gnome.shell.world-clocks'});
        const world = GWeather.Location.get_world();
        return settings.get_value('locations').deepUnpack()
            .map(value => world.deserialize(value))
            .filter(location => location?.get_timezone())
            .map(location => ({name: location.get_city_name() ?? location.get_name(), timezone: location.get_timezone()}));
    } catch {
        return [];
    }
}

// {time, offset}: the time there as a GLib.DateTime, and its offset from
// here in seconds.
export function timeAt(clock) {
    const here = GLib.DateTime.new_now_local();
    const there = here.to_timezone(clock.timezone);
    return {time: there, offset: (there.get_utc_offset() - here.get_utc_offset()) / 1e6};
}
