// Calendar events from GNOME's calendar server, through the event source
// GNOME's date menu keeps (the one Ledge's agenda reads too). The center
// asks it for the month it shows; otherwise it covers this month, for
// today's events and the bar's chip.
//
// Emits "changed" when events came or went.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {monthRange, sameDay} from './calendar.js';

const DAY_MS = 24 * 3600 * 1000;

export class Agenda extends EventEmitter {
    constructor() {
        super();
        this._month = null;
        this._source = null;
        // GNOME's date menu replaces its source when the screen locks and
        // unlocks, and disposes the old one.
        Main.sessionMode.connectObject('updated', () => this._follow(), this);
        this._follow();
    }

    _follow() {
        const source = Main.panel.statusArea.dateMenu?._eventSource ?? null;
        if (source === this._source)
            return;
        this._source?.disconnectObject(this);
        this._source = source;
        this._source?.connectObject('changed', () => this.emit('changed'), 'notify::has-calendars', () => this.emit('changed'), this);
        const month = this._month;
        this._month = null;
        if (month)
            this.showMonth(...month.split('-').map(Number));
        else
            this.showToday();
        this.emit('changed');
    }

    get available() {
        return Boolean(this._source?.hasCalendars);
    }

    // Asks the server for a whole month.
    showMonth(year, month) {
        const key = `${year}-${month}`;
        if (this._month === key || !this._source)
            return;
        this._month = key;
        const {begin, end} = monthRange(year, month);
        try {
            this._source.requestRange(begin, end);
        } catch (e) {
            console.log(`Halo: the calendar did not answer (${e.message})`);
        }
    }

    // Back to this month, for today's events.
    showToday() {
        this.showMonth(new Date().getFullYear(), new Date().getMonth());
    }

    // [{id, summary, start, end}] of a day, by start.
    eventsOn(day) {
        if (!this._source)
            return [];
        const begin = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const end = new Date(begin.getTime() + DAY_MS);
        try {
            return (this._source.getEvents(begin, end) ?? [])
                .map(event => ({id: event.id, summary: event.summary, start: event.date, end: event.end}))
                .sort((a, b) => a.start - b.start);
        } catch {
            return [];
        }
    }

    hasEvents(day) {
        try {
            return Boolean(this._source?.hasEvents(day));
        } catch {
            return false;
        }
    }

    // The next event of today that has not begun, within `withinMs`.
    nextToday(withinMs, now = new Date()) {
        return this.eventsOn(now).find(event => event.start > now && sameDay(event.start, now) &&
            event.start.getTime() - now.getTime() <= withinMs && event.end.getTime() - event.start.getTime() < DAY_MS) ?? null;
    }

    destroy() {
        Main.sessionMode.disconnectObject(this);
        this._source?.disconnectObject(this);
        this._source = null;
        this.disconnectAll();
    }
}

