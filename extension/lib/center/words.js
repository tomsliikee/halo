// What the notification center writes, worked out from plain values, so it
// can be tested without a shell. Units are written with a space (design
// system, Voice).

import {durationText} from '../bar/words.js';

// "now", "2 min ago", "3 h ago", "yesterday", "4 days ago".
export function agoText(seconds) {
    if (seconds < 60)
        return 'now';
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 24 * 3600)
        return `${Math.floor(seconds / 3600)} h ago`;
    const days = Math.floor(seconds / (24 * 3600));
    return days === 1 ? 'yesterday' : `${days} days ago`;
}

function clock(date, twelveHour) {
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if (!twelveHour)
        return `${String(date.getHours()).padStart(2, '0')}:${minutes}`;
    return `${date.getHours() % 12 || 12}:${minutes}`;
}

// "14:45–16:15", or "All day" for an event that covers whole days.
export function eventTimeText(start, end, twelveHour = false) {
    if (isAllDay(start, end))
        return 'All day';
    return `${clock(start, twelveHour)}–${clock(end, twelveHour)}`;
}

export function isAllDay(start, end) {
    return start.getHours() === 0 && start.getMinutes() === 0 && end.getTime() - start.getTime() >= 24 * 3600 * 1000;
}

// The note beside an event of today: "in 13 min", "now", or nothing once
// it is over or more than a few hours away.
export function eventSoonText(start, end, now) {
    if (isAllDay(start, end))
        return '';
    if (now >= start && now < end)
        return 'now';
    const seconds = (start.getTime() - now.getTime()) / 1000;
    if (seconds > 0 && seconds <= 3 * 3600)
        return seconds < 60 ? 'now' : `in ${durationText(seconds)}`;
    return '';
}

// The time difference of a world clock: "−6 h", "+5 h 30 min", "same time".
export function offsetText(seconds) {
    if (seconds === 0)
        return 'same time';
    const sign = seconds < 0 ? '−' : '+';
    const minutes = Math.round(Math.abs(seconds) / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${sign}${h > 0 ? `${h} h` : ''}${h > 0 && m > 0 ? ' ' : ''}${m > 0 ? `${m} min` : ''}`;
}

export function temperatureText(celsius) {
    return `${Math.round(celsius)}°`;
}

// WMO weather codes as Open-Meteo gives them, to Halo's weather icons.
export function weatherIcon(code, isDay = true) {
    if (code === 0)
        return isDay ? 'sunny' : 'moon-stars';
    if (code === 1 || code === 2)
        return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
    if (code === 3)
        return 'cloud';
    if (code === 45 || code === 48)
        return 'foggy';
    if ([51, 53, 55, 56, 57].includes(code))
        return 'rainy-light';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
        return 'rainy';
    if ([71, 73, 75, 77, 85, 86].includes(code))
        return 'weather-snowy';
    if ([95, 96, 99].includes(code))
        return 'thunderstorm';
    return 'cloud';
}

const newestFirst = (a, b) => b.time - a.time || b.id - a.id;

// Notifications as the center lists them: one card per app and
// conversation (the same title from the same app), newest card first,
// newest message first within it.
// items: [{id, app, title, time (ms)}]; returns [{key, items}]. Of two
// in the same second, the later id is the newer.
export function groupNotifications(items) {
    const groups = new Map();
    for (const item of items) {
        const key = `${item.app}\u0000${item.title}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(item);
    }
    return [...groups.entries()]
        .map(([key, list]) => ({key, items: list.sort(newestFirst)}))
        .sort((a, b) => newestFirst(a.items[0], b.items[0]));
}

// How far a swiped card has to go before it is dismissed, as a share of
// its width; a quick flick counts too.
export const SWIPE_SHARE = 0.35;
export const SWIPE_SPEED = 0.9;

export function swipeDismisses(offset, width, speed) {
    return Math.abs(offset) > width * SWIPE_SHARE || (Math.abs(speed) > SWIPE_SPEED && Math.sign(speed) === Math.sign(offset));
}
