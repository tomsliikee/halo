// The right column of the center (PDF page 6): the month with a dot under
// days that have events, the events of the chosen day, the weather and a
// world clock.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {spring, SPRINGS} from '../shared/choreo.js';
import {icon, iconGicon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {roundButton} from '../qs/controls.js';
import {monthGrid, sameDay, shiftMonth, weekdays} from './calendar.js';
import {timeAt, worldClocks} from './clocks.js';
import {eventSoonText, eventTimeText, offsetText, temperatureText, weatherIcon} from './words.js';

function box(styleClass, {vertical = false, children = [], ...params} = {}) {
    const actor = new St.BoxLayout({style_class: styleClass, vertical, ...params});
    for (const child of children.filter(Boolean))
        actor.add_child(child);
    return actor;
}

function openApp(id) {
    const app = Shell.AppSystem.get_default().lookup_app(id);
    app?.activate();
    return Boolean(app);
}

// A day as GLib formats it in the desktop's language.
function format(date, pattern) {
    return GLib.DateTime.new_local(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0, 0).format(pattern);
}

export class SidePanel {
    // ctx: {agenda, weather, twelveHour(), close()}
    constructor(ctx) {
        this._ctx = ctx;
        const now = new Date();
        this._shown = {year: now.getFullYear(), month: now.getMonth()};
        this._chosen = now;
        this._weekStart = Shell.util_get_week_start();
        this.actor = box('halo-center-side', {vertical: true, y_expand: true});

        // The month
        this._weekday = text('qs-caption', {styleClass: 'halo-center-dim'});
        this._date = text('island-headline', {styleClass: 'halo-center-date'});
        const titles = box('halo-center-words', {vertical: true, x_expand: true, children: [this._weekday, this._date]});
        const previous = roundButton('chevron-left', () => this._step(-1), {styleClass: 'halo-center-nav', accessibleName: 'Previous month'});
        const next = roundButton('chevron-right', () => this._step(1), {styleClass: 'halo-center-nav', accessibleName: 'Next month'});
        this._grid = new St.Widget({style_class: 'halo-center-grid', layout_manager: new Clutter.GridLayout({column_homogeneous: true})});
        this._month = box('halo-center-card halo-center-month', {vertical: true, children: [
            box('halo-center-month-head', {children: [titles, previous, next]}),
            this._grid,
        ]});
        this.actor.add_child(this._month);

        // The chosen day's events
        this._dayCaption = text('qs-caption', {styleClass: 'halo-center-caption'});
        this._events = box('halo-center-events', {vertical: true});
        this.actor.add_child(this._dayCaption);
        this.actor.add_child(this._events);

        // Weather and a world clock, side by side
        this._weatherIcon = icon('sunny', {size: 24, fill: true, styleClass: 'halo-center-accent'});
        this._temperature = text('qs-big', {styleClass: 'halo-center-big'});
        this._weatherNote = text('qs-caption', {styleClass: 'halo-center-dim', ellipsize: true});
        this._weatherCard = box('halo-center-card halo-center-weather', {vertical: true, x_expand: true,
            children: [this._weatherIcon, this._temperature, this._weatherNote]});
        pressable(this._weatherCard, () => openApp('org.gnome.Weather.desktop') && ctx.close(), {scale: 0.97});
        this._clockTime = text('qs-big', {styleClass: 'halo-center-big'});
        this._clockNote = text('qs-caption', {styleClass: 'halo-center-dim', ellipsize: true});
        this._clockCard = box('halo-center-card halo-center-clock', {vertical: true, x_expand: true,
            children: [icon('public', {size: 24, fill: true, styleClass: 'halo-center-accent'}), this._clockTime, this._clockNote]});
        pressable(this._clockCard, () => openApp('org.gnome.clocks.desktop') && ctx.close(), {scale: 0.97});
        const cards = box('halo-center-pair', {children: [this._weatherCard, this._clockCard]});
        cards.layout_manager.homogeneous = true;
        this.actor.add_child(cards);

        ctx.agenda.connectObject('changed', () => this._fillMonth({force: true}), this);
        ctx.weather.connectObject('changed', () => this._fillWeather(), this);
    }

    // The center opened: back to today.
    opened() {
        const now = new Date();
        this._shown = {year: now.getFullYear(), month: now.getMonth()};
        this._chosen = now;
        this._ctx.agenda.showMonth(this._shown.year, this._shown.month);
        this._ctx.weather.refresh();
        this.refresh();
    }

    // Once a minute while open: times move on.
    refresh() {
        this._fillMonth();
        this._fillWeather();
        this._fillClock();
    }

    destroy() {
        this._ctx.agenda.disconnectObject(this);
        this._ctx.weather.disconnectObject(this);
        this.actor.destroy();
    }

    _step(direction) {
        this._shown = shiftMonth(this._shown.year, this._shown.month, direction);
        this._ctx.agenda.showMonth(this._shown.year, this._shown.month);
        this._fillMonth();
        // The new month slides in from its side.
        this._grid.translation_x = direction * 24;
        this._grid.opacity = 0;
        spring(this._grid, {translation_x: 0}, {spring: SPRINGS.glide});
        this._grid.ease({opacity: 255, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
    }

    // The grid is built anew only when what it shows changed: opening the
    // center on the same day costs no rebuild of some forty cells.
    _fillMonth({force = false} = {}) {
        const {year, month} = this._shown;
        const today = new Date();
        const chosen = this._chosen;
        const key = [year, month, chosen.toDateString(), today.toDateString(), this._weekStart].join('|');
        if (!force && key === this._filled)
            return;
        this._filled = key;
        this._weekday.text = format(chosen, '%A');
        this._date.text = sameDay(chosen, today) || chosen.getMonth() === month
            ? format(chosen, '%-d %B %Y')
            : format(new Date(year, month, 1), '%B %Y');

        const layout = this._grid.layout_manager;
        this._grid.destroy_all_children();
        weekdays(this._weekStart).forEach((day, column) => {
            // 4 October 2026 was a Sunday: day 0.
            const name = format(new Date(2026, 9, 4 + day), '%a').slice(0, 2);
            layout.attach(text('qs-caption', {styleClass: 'halo-center-weekday', text: name}), column, 0, 1, 1);
        });
        monthGrid(year, month, this._weekStart).forEach((week, row) => week.forEach((day, column) => {
            if (day === null)
                return;
            const date = new Date(year, month, day);
            const cell = new St.BoxLayout({style_class: 'halo-center-day', vertical: true, x_align: Clutter.ActorAlign.CENTER, accessible_name: format(date, '%-d %B')});
            if (sameDay(date, today))
                cell.add_style_class_name('halo-today');
            else if (sameDay(date, chosen))
                cell.add_style_class_name('halo-chosen');
            const number = text('qs-row', {styleClass: 'halo-center-day-number', text: String(day)});
            number.x_align = Clutter.ActorAlign.CENTER;
            cell.add_child(number);
            const dot = new St.Widget({style_class: 'halo-center-dot', x_align: Clutter.ActorAlign.CENTER});
            dot.opacity = this._ctx.agenda.hasEvents(date) ? 255 : 0;
            cell.add_child(dot);
            pressable(cell, () => {
                this._chosen = date;
                this._fillMonth();
            }, {scale: 0.9, focus: true});
            layout.attach(cell, column, row + 1, 1, 1);
        }));
        this._fillEvents();
    }

    _fillEvents() {
        const now = new Date();
        const day = this._chosen;
        this._dayCaption.text = sameDay(day, now) ? 'Today' : format(day, '%A %-d %B');
        this._events.destroy_all_children();
        if (!this._ctx.agenda.available) {
            this._events.add_child(text('qs-row-note', {styleClass: 'halo-center-dim halo-center-quiet', text: 'No calendars set up'}));
            return;
        }
        const events = this._ctx.agenda.eventsOn(day);
        if (events.length === 0) {
            this._events.add_child(text('qs-row-note', {styleClass: 'halo-center-dim halo-center-quiet', text: 'Nothing planned'}));
            return;
        }
        let marked = false;
        for (const event of events.slice(0, 4)) {
            const soon = sameDay(day, now) ? eventSoonText(event.start, event.end, now) : '';
            const over = event.end < now;
            const row = box(`halo-center-event${soon && !marked ? ' halo-soon' : ''}${over ? ' halo-over' : ''}`, {children: [
                new St.Widget({style_class: 'halo-center-event-bar', y_expand: true}),
                box('halo-center-words', {vertical: true, x_expand: true, children: [
                    text('qs-row', {styleClass: 'halo-center-event-title', ellipsize: true, text: event.summary || 'Event'}),
                    text('qs-row-note', {styleClass: 'halo-center-dim', text: eventTimeText(event.start, event.end, this._ctx.twelveHour())}),
                ]}),
                soon ? text('qs-caption', {styleClass: 'halo-center-soon', text: soon}) : null,
            ]});
            marked ||= Boolean(soon);
            pressable(row, () => openApp('org.gnome.Calendar.desktop') && this._ctx.close(), {scale: 0.98});
            this._events.add_child(row);
        }
    }

    _fillWeather() {
        const {place, today} = this._ctx.weather;
        this._weatherCard.visible = Boolean(place);
        if (!place)
            return;
        if (!today) {
            this._temperature.text = '–';
            this._weatherNote.text = place.name;
            return;
        }
        this._weatherIcon.gicon = iconGicon(weatherIcon(today.code, today.isDay), true);
        this._temperature.text = temperatureText(today.temperature);
        this._weatherNote.text = today.max !== null ? `${place.name} · up to ${temperatureText(today.max)}` : place.name;
    }

    _fillClock() {
        const [clock] = worldClocks();
        if (!clock) {
            this._clockTime.text = '+';
            this._clockNote.text = 'Add a world clock';
            return;
        }
        const {time, offset} = timeAt(clock);
        this._clockTime.text = this._ctx.twelveHour() ? time.format('%-l:%M') : time.format('%H:%M');
        this._clockNote.text = `${clock.name} · ${offsetText(offset)}`;
    }
}

