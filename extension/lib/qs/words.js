// What the quick settings write, worked out from plain values, so it can be
// tested without a shell. Units are written with a space (design system,
// Voice).

import {durationText} from '../bar/words.js';

export const COLOUR_NAMES = {
    blue: 'Blue', violet: 'Violet', green: 'Green', teal: 'Teal',
    orange: 'Orange', salmon: 'Salmon', pink: 'Pink', white: 'White',
};

export const PROFILES = {
    'performance': {title: 'Performance', note: 'Fast, uses more battery', icon: 'speed'},
    'balanced': {title: 'Balanced', note: 'The default for every day', icon: 'balance'},
    'power-saver': {title: 'Power saver', note: 'Dimmer, quieter, longer', icon: 'energy-savings-leaf'},
};

// "86 %" under the header's number: how long the battery lasts or loads.
export function batteryNote({charging, full, secondsLeft}) {
    if (full)
        return 'Fully charged';
    if (!secondsLeft)
        return charging ? 'Charging' : '';
    return charging ? `Full in ${durationText(secondsLeft)}` : `${durationText(secondsLeft)} left`;
}

// "19:50": the clock time a battery runs out at. now is a Date.
export function clockAt(now, secondsLeft, twelveHour = false) {
    const end = new Date(now.getTime() + secondsLeft * 1000);
    const minutes = String(end.getMinutes()).padStart(2, '0');
    if (!twelveHour)
        return `${String(end.getHours()).padStart(2, '0')}:${minutes}`;
    const hours = end.getHours() % 12 || 12;
    return `${hours}:${minutes} ${end.getHours() < 12 ? 'AM' : 'PM'}`;
}

// The energy page's line under "Battery": until when it lasts.
export function lastsText({charging, full, secondsLeft}, now, twelveHour = false) {
    if (full)
        return 'Fully charged';
    if (!secondsLeft)
        return charging ? 'Charging' : 'Working out how long it lasts';
    return charging
        ? `Full at about ${clockAt(now, secondsLeft, twelveHour)}`
        : `Lasts until about ${clockAt(now, secondsLeft, twelveHour)}`;
}

// "2 devices", or the one device's name, or whether Bluetooth is on.
export function bluetoothNote(on, connected) {
    if (!on)
        return 'Off';
    if (connected.length === 1)
        return connected[0];
    if (connected.length > 1)
        return `${connected.length} devices`;
    return 'On';
}

// GNOME keeps the night light's end as hours in a double (6.5 = 06:30).
export function hoursText(hours) {
    const total = Math.round(hours * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function nightLightNote(on, automatic, until) {
    if (!on)
        return 'Off';
    return automatic ? 'Until sunrise' : `Until ${hoursText(until)}`;
}

export function onOff(on) {
    return on ? 'On' : 'Off';
}

export function darkNote(style, dark) {
    if (style === 'auto')
        return dark ? 'Auto · on' : 'Auto · off';
    return onOff(dark);
}

// "Connected · 5 GHz · 480 Mbit/s"; frequency in MHz, bitrate in kbit/s.
export function wifiDetails(frequency, bitrate) {
    const parts = ['Connected'];
    if (frequency > 0)
        parts.push(frequency >= 5900 ? '6 GHz' : frequency >= 4900 ? '5 GHz' : '2.4 GHz');
    if (bitrate > 0)
        parts.push(`${Math.round(bitrate / 1000)} Mbit/s`);
    return parts.join(' · ');
}

// A device's battery, and whether it wants charging soon.
export const DEVICE_LOW = 20;

export function deviceBatteryNote(percent) {
    return percent < DEVICE_LOW ? 'charge soon' : 'battery';
}

export function backgroundAppsText(count) {
    return count === 1 ? '1 app in the background' : `${count} apps in the background`;
}

// Minutes since midnight of "HH:MM".
export function minutesOf(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// Whether "Auto" is dark at a minute of the day: from `from` until `to`,
// across midnight when `to` comes first.
export function isDarkAt(minute, from, to) {
    const start = minutesOf(from);
    const end = minutesOf(to);
    if (start === end)
        return false;
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

// Minutes from `minute` until the next switch of "Auto".
export function minutesToSwitch(minute, from, to) {
    const ahead = target => (target - minute + 24 * 60) % (24 * 60) || 24 * 60;
    return Math.min(ahead(minutesOf(from)), ahead(minutesOf(to)));
}

// The tiles in their order: those the user placed first, in that order,
// then the rest as they come. Hidden ones stay out.
export function orderTiles(ids, order, hidden = []) {
    const known = new Set(ids);
    const placed = order.filter(id => known.has(id));
    const rest = ids.filter(id => !placed.includes(id));
    return [...placed, ...rest].filter(id => !hidden.includes(id));
}

// Moves one id to another's place in the full order, for drag and drop.
export function moveTile(ids, order, id, target) {
    const full = orderTiles(ids, order);
    const from = full.indexOf(id);
    const to = full.indexOf(target);
    if (from < 0 || to < 0 || from === to)
        return full;
    full.splice(from, 1);
    full.splice(to, 0, id);
    return full;
}
