// A calendar event that starts soon: told once, ten minutes ahead and again
// as it starts. The events come from GNOME's calendar server, through the
// source the date menu already keeps for its month.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {soonText} from '../words.js';

const AHEAD_MS = 10 * 60 * 1000;

export class EventsSource {
    constructor(island) {
        this._island = island;
        this._told = new Set();
        this.look();
    }

    destroy() {}

    // Asked once a minute, by the same tick as the bar's next event.
    look() {
        const source = Main.panel.statusArea.dateMenu?._eventSource;
        if (!source?.hasCalendars || source.isLoading || !this._island.allows('events'))
            return;
        const now = new Date();
        let events = [];
        try {
            events = source.getEvents(now, new Date(now.getTime() + AHEAD_MS)) ?? [];
        } catch {
            return;
        }
        for (const event of events) {
            const starts = event.date.getTime();
            // All-day events and those already going on are not news.
            if (starts < now.getTime() - 60 * 1000 || event.end.getTime() - starts >= 24 * 3600 * 1000)
                continue;
            const stage = starts - now.getTime() <= 60 * 1000 ? 'now' : 'soon';
            const key = `${event.id}:${starts}:${stage}`;
            if (this._told.has(key))
                continue;
            this._told.add(key);
            this._island.set({
                id: `hint:event:${event.id}`, kind: 'events', hint: true, duration: 6000, view: 'info',
                data: {icon: 'event', tone: 'tertiary', square: true, title: event.summary || 'Event', note: soonText(Math.max(0, (starts - now.getTime()) / 1000))},
            });
        }
    }
}
