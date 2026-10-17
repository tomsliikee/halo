// What the island shows inside its shape, one builder per look of the
// design (PDF page 5). Each returns {actor, update(activity)?, destroy()?};
// the shape measures the actor and springs to it.
//
// Every builder gets the activity, whose `data` holds what to show and
// whose callbacks (onAction, onPlay, ...) say what a click does.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {spring, SPRINGS} from '../shared/choreo.js';
import {icon, iconGicon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {clockText, initials, isDecline, trackTime} from './words.js';

const LEVEL_TRACK = 200;
// The large player's progress line, between its two times.
const MEDIA_TRACK = 310;
const WIDE = 500;
// The bubble beside the island, for a second lasting thing.
export const BUBBLE = 64;
// The bars of a playing waveform, and how fast they move.
const WAVE_BARS = 5;
const WAVE_MS = 1100;
const WAVE_STEP_MS = 50;
const SPIN_MS = 1200;
const SPIN_STEP_MS = 33;

function box(styleClass, {vertical = false, expand = false, children = [], ...params} = {}) {
    const actor = new St.BoxLayout({style_class: styleClass, vertical, x_expand: expand, ...params});
    for (const child of children.filter(Boolean))
        actor.add_child(child);
    return actor;
}

// A round (or rounded square) badge with an icon or an image in it.
// tone: primary, soft, tertiary, good, alarm, dim.
function badge(name, {tone = 'primary', square = false, size = 46, iconSize = 26, gicon = null, fill = true} = {}) {
    const child = gicon
        ? new St.Icon({gicon, icon_size: iconSize})
        : icon(name, {size: iconSize, fill});
    return new St.Bin({
        style_class: `halo-island-badge halo-island-${tone}${square ? ' halo-island-square' : ''}`,
        width: size, height: size, child,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

function round(name, onClick, {tone = 'primary', size = 50, iconSize = 26, square = false, accessibleName = ''} = {}) {
    const button = badge(name, {tone, size, iconSize, square});
    button.accessible_name = accessibleName;
    pressable(button, () => onClick(), {focus: true});
    return button;
}

function titleAndNote(title, note, {titleRole = 'island-title', expand = true} = {}) {
    const titleLabel = text(titleRole, {styleClass: 'halo-island-text', ellipsize: true, text: title ?? ''});
    const noteLabel = text('island-note', {styleClass: 'halo-island-dim', ellipsize: true, text: note ?? ''});
    noteLabel.visible = Boolean(note);
    const column = box('halo-island-column', {vertical: true, expand, children: [titleLabel, noteLabel], y_align: Clutter.ActorAlign.CENTER});
    return {column, titleLabel, noteLabel};
}

// A round picture of a cover, an app's icon or a screenshot, or a badge
// with a fallback icon when there is none.
function picture(gicon, fallback, {size = 44, radius = 12} = {}) {
    if (!gicon)
        return badge(fallback, {tone: 'soft', square: true, size, iconSize: Math.round(size * 0.5)});
    const image = new St.Icon({gicon, icon_size: size, style_class: 'halo-island-picture'});
    return new St.Bin({style: `border-radius: ${radius}px;`, style_class: 'halo-island-picture-bin', child: image, width: size, height: size});
}

// Bars that move while something plays and rest when it pauses.
function waveform({width = 28, height = 24} = {}) {
    const area = new St.DrawingArea({width, height, style_class: 'halo-island-wave', y_align: Clutter.ActorAlign.CENTER});
    let playing = false;
    let phase = 0;
    // A step every WAVE_STEP_MS, not every frame: the bars still bounce, and
    // the shell is not made to paint 60 times a second while music plays.
    const loop = ambient(area, WAVE_STEP_MS, elapsed => {
        phase = (elapsed % WAVE_MS) / WAVE_MS * Math.PI * 2;
        area.queue_repaint();
    });
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const color = area.get_theme_node().get_foreground_color();
        cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
        const gap = w / (WAVE_BARS * 2 - 1);
        for (let i = 0; i < WAVE_BARS; i++) {
            // The middle bar is the tallest, as in the design's icon.
            const rest = [0.35, 0.65, 1, 0.65, 0.35][i];
            const swing = playing ? 0.55 + 0.45 * Math.sin(phase * (1 + i * 0.37) + i * 1.3) : 0.6;
            const barHeight = Math.max(gap, h * rest * swing);
            const x = i * gap * 2;
            const y = (h - barHeight) / 2;
            cr.newSubPath();
            cr.arc(x + gap / 2, y + gap / 2, gap / 2, Math.PI, 2 * Math.PI);
            cr.arc(x + gap / 2, y + barHeight - gap / 2, gap / 2, 0, Math.PI);
            cr.closePath();
            cr.fill();
        }
        cr.$dispose();
    });
    return {
        actor: area,
        setPlaying(on) {
            playing = on;
            loop.setRunning(on);
            area.queue_repaint();
        },
    };
}

// A cover that follows the track: picture() again only when it changed.
function coverSlot(gicon, options) {
    const slot = new St.Bin({child: picture(gicon, 'album', options), y_align: Clutter.ActorAlign.CENTER});
    let shown = gicon;
    return {
        actor: slot,
        set(next) {
            if (next === shown || (next && shown && next.equal(shown)))
                return;
            shown = next;
            slot.child = picture(next, 'album', options);
        },
    };
}

// A ring that fills as a timer runs, with an icon inside.
function ring(name, {size = 40} = {}) {
    const holder = new St.Widget({width: size, height: size, y_align: Clutter.ActorAlign.CENTER, layout_manager: new Clutter.BinLayout()});
    const area = new St.DrawingArea({width: size, height: size, style_class: 'halo-island-ring'});
    let share = -1;
    area.connect('repaint', () => {
        const cr = area.get_context();
        const color = area.get_theme_node().get_foreground_color();
        const track = area.get_theme_node().get_background_color();
        const r = size / 2 - 3;
        cr.setLineWidth(4);
        cr.setLineCap(1);
        cr.setSourceRGBA(track.red / 255, track.green / 255, track.blue / 255, track.alpha / 255);
        cr.arc(size / 2, size / 2, r, 0, 2 * Math.PI);
        cr.stroke();
        if (share > 0) {
            cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, 1);
            cr.arc(size / 2, size / 2, r, -Math.PI / 2, -Math.PI / 2 + share * 2 * Math.PI);
            cr.stroke();
        }
        cr.$dispose();
    });
    holder.add_child(area);
    const glyph = icon(name, {size: Math.round(size / 2), fill: true, styleClass: 'halo-island-ring-icon'});
    glyph.x_align = Clutter.ActorAlign.CENTER;
    glyph.y_align = Clutter.ActorAlign.CENTER;
    holder.add_child(glyph);
    return {
        actor: holder,
        set(value) {
            const next = Math.max(0, Math.min(1, value));
            // A second's tick that does not move the arc a pixel draws nothing.
            if (Math.abs(next - share) * Math.PI * size < 0.25)
                return;
            share = next;
            area.queue_repaint();
        },
    };
}

function spinning(actor) {
    actor.set_pivot_point(0.5, 0.5);
    ambient(actor, SPIN_STEP_MS, elapsed => {
        actor.rotation_angle_z = (elapsed % SPIN_MS) / SPIN_MS * 360;
    }).setRunning(true);
}

// Something that moves on its own for as long as it shows: onStep(elapsed
// ms) every `step` ms while the actor is on the stage and running.
function ambient(actor, step, onStep) {
    let running = false;
    let source = 0;
    const start = GLib.get_monotonic_time();
    const sync = () => {
        const on = running && actor.mapped;
        if (on && !source) {
            source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, step, () => {
                onStep((GLib.get_monotonic_time() - start) / 1000);
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!on && source) {
            GLib.source_remove(source);
            source = 0;
        }
    };
    actor.connect('notify::mapped', sync);
    actor.connect('destroy', () => {
        running = false;
        sync();
    });
    return {
        setRunning(on) {
            running = on;
            sync();
        },
    };
}

// Rest: the date and the clock, where the bar's clock is.
export function restView({date, time, unread}) {
    const dateLabel = text('bar-date', {styleClass: 'halo-island-dim', text: date});
    const timeLabel = text('bar-time', {styleClass: 'halo-island-text', text: time});
    const dot = new St.Widget({style_class: 'halo-island-unread', y_align: Clutter.ActorAlign.CENTER, visible: unread});
    const actor = box('halo-island-rest', {children: [dateLabel, timeLabel, dot]});
    return {
        actor,
        update(state) {
            dateLabel.text = state.date;
            timeLabel.text = state.time;
            dot.visible = state.unread;
        },
    };
}

// The resting clock under the pointer: the clock, and below it what the
// weather and the day hold. items: [{icon, text}] (glanceItems).
export function glanceView(rest, items) {
    const clock = restView(rest);
    clock.actor.x_align = Clutter.ActorAlign.CENTER;
    const line = box('halo-island-glance', {x_align: Clutter.ActorAlign.CENTER});
    for (const item of items) {
        line.add_child(icon(item.icon, {size: 18, fill: true, styleClass: 'halo-island-accent-text'}));
        line.add_child(text('island-small', {styleClass: 'halo-island-text halo-island-glance-text', text: item.text}));
    }
    const actor = box('halo-island-glancing', {vertical: true, children: [clock.actor, line]});
    return {actor, update: next => clock.update(next)};
}

// Docked: the clock's pill with a running thing beside the time, as small
// as the bar. Clicks, scrolls and the right click are the island's own.
export function dockView(rest, activity) {
    const dateLabel = text('bar-date', {styleClass: 'halo-island-dim', text: rest.date});
    const timeLabel = text('bar-time', {styleClass: 'halo-island-text', text: rest.time});
    const dot = new St.Widget({style_class: 'halo-island-unread', y_align: Clutter.ActorAlign.CENTER, visible: rest.unread});
    const line = new St.Widget({style_class: 'halo-island-dock-line', y_align: Clutter.ActorAlign.CENTER});
    const {actor: mini, update: updateMini} = dockMini(activity);
    const actor = box('halo-island-dock', {children: [dateLabel, timeLabel, dot, line, mini]});
    return {
        actor,
        update(next, state) {
            dateLabel.text = state.date;
            timeLabel.text = state.time;
            dot.visible = state.unread;
            updateMini(next);
        },
    };
}

// What a running thing shows of itself in the docked pill.
function dockMini(activity) {
    const {data, kind} = activity;
    if (kind === 'media') {
        const cover = coverSlot(data.cover, {size: 24, radius: 7});
        const wave = waveform({width: 20, height: 16});
        wave.setPlaying(data.playing);
        let current = activity;
        const play = round(data.playing ? 'pause' : 'play-arrow', () => current.onPlay(),
            {square: true, size: 28, iconSize: 16, accessibleName: 'Play or pause'});
        return {
            actor: box('halo-island-dock-mini', {children: [cover.actor, wave.actor, play]}),
            update(next) {
                current = next;
                cover.set(next.data.cover);
                wave.setPlaying(next.data.playing);
                play.child.gicon = iconGicon(next.data.playing ? 'pause' : 'play-arrow', true);
            },
        };
    }
    if (kind === 'timer') {
        const dial = ring('timer', {size: 24});
        dial.set(data.progress);
        const time = text('bar-time', {styleClass: 'halo-island-text', text: clockText(data.shown, {countdown: data.countdown})});
        return {
            actor: box('halo-island-dock-mini', {children: [dial.actor, time]}),
            update(next) {
                dial.set(next.data.progress);
                time.text = clockText(next.data.shown, {countdown: next.data.countdown});
            },
        };
    }
    if (kind === 'recording') {
        const dot = new St.Widget({style_class: 'halo-island-rec-dot', y_align: Clutter.ActorAlign.CENTER});
        const time = text('bar-time', {styleClass: 'halo-island-text', text: data.text});
        return {
            actor: box('halo-island-dock-mini', {children: [dot, time]}),
            update(next) {
                time.text = next.data.text;
            },
        };
    }
    // Claude, a download, the microphone or camera: its icon, maybe a number.
    const name = data.icon ?? {claude: 'progress-activity', progress: 'download'}[kind] ?? 'more-horiz';
    const glyph = icon(name, {size: 18, fill: true, styleClass: `halo-island-${kind === 'privacy' ? 'alarm' : 'accent'}-text`});
    if (data.spin)
        spinning(glyph);
    const trailing = text('bar-time', {styleClass: 'halo-island-text', text: data.trailing ?? ''});
    trailing.visible = Boolean(data.trailing);
    return {
        actor: box('halo-island-dock-mini', {children: [glyph, trailing]}),
        update(next) {
            trailing.text = next.data.trailing ?? '';
            trailing.visible = Boolean(next.data.trailing);
        },
    };
}

// The hover preview: a small look with one more line below it, for what
// the small island leaves out. view: a built view; the line is data.peek.
export function withPeek(view, activity) {
    const line = text('island-small', {styleClass: 'halo-island-dim', text: activity.data.peek ?? ''});
    // Music and timers also show how far they are, as a thin bar.
    const track = new St.Widget({style_class: 'halo-island-track halo-island-thin', x_expand: true});
    const fill = new St.Widget({style_class: 'halo-island-fill', height: 6});
    track.add_child(fill);
    let share = null;
    const showShare = () => {
        track.visible = share !== null;
        if (share !== null)
            fill.width = Math.round(share * track.width);
    };
    track.connect('notify::width', showShare);
    const shareOf = data => data.length > 0 ? Math.max(0, Math.min(1, data.position / data.length))
        : typeof data.progress === 'number' ? Math.max(0, Math.min(1, data.progress)) : null;
    const peek = box('halo-island-peek', {vertical: true, children: [line, track]});
    const actor = box('halo-island-peeking', {vertical: true, children: [view.actor, peek]});
    const update = next => {
        line.text = next.data.peek ?? '';
        share = shareOf(next.data);
        showShare();
    };
    update(activity);
    return {
        actor,
        update(next) {
            view.update?.(next);
            update(next);
        },
    };
}

// While the center is open the clock has become it: a small circle with a
// pencil stays in its place and leads to the island's settings.
export function editView() {
    const glyph = icon('edit', {size: 18, styleClass: 'halo-island-text'});
    glyph.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true});
    return {actor: new St.Bin({style_class: 'halo-island-edit', child: glyph, accessible_name: 'Island settings'})};
}

// Volume, brightness: an icon, the level as a bar and in percent.
export function levelView(activity) {
    const {data} = activity;
    const glyph = badge(data.icon, {tone: data.muted ? 'alarm' : 'primary', iconSize: 26});
    const track = new St.Widget({style_class: 'halo-island-track', width: LEVEL_TRACK, y_align: Clutter.ActorAlign.CENTER});
    const fill = new St.Widget({style_class: 'halo-island-fill'});
    track.add_child(fill);
    const percent = text('island-metric', {styleClass: 'halo-island-text halo-island-percent', text: data.text});
    const actor = box('halo-island-level', {children: [glyph, track, percent]});
    const show = (share, animated) => {
        const width = Math.round(LEVEL_TRACK * share);
        if (animated)
            spring(fill, {width}, {spring: SPRINGS.glide});
        else
            fill.width = width;
    };
    fill.height = 10;
    show(data.share, false);
    return {
        actor,
        update(next) {
            glyph.child.gicon = iconGicon(next.data.icon, true);
            glyph.style_class = `halo-island-badge halo-island-${next.data.muted ? 'alarm' : 'primary'}`;
            percent.text = next.data.text;
            show(next.data.share, true);
        },
    };
}

// Muted: one red symbol on its own, as the design draws it.
export function symbolView(activity) {
    const actor = box('halo-island-symbol', {children: [icon(activity.data.icon, {size: 28, fill: true, styleClass: 'halo-island-alarm-text'})]});
    return {
        actor,
        update(next) {
            actor.get_first_child().gicon = iconGicon(next.data.icon, true);
        },
    };
}

// Charging, a setting, a device, a network, the keyboard layout and every
// other short message: an icon, a title and a note, maybe a number.
// data: {icon, gicon, tone, title, note, trailing, trailingTone, picture, spin}
export function infoView(activity) {
    const {data} = activity;
    const leadFor = d => {
        const lead = d.picture
            ? picture(d.picture, d.icon ?? 'screenshot-region', {size: 46, radius: 12})
            : badge(d.icon, {tone: d.tone ?? 'primary', square: d.square, gicon: d.gicon ?? null, iconSize: d.gicon ? 28 : 26});
        if (d.spin)
            spinning(lead.child);
        return lead;
    };
    // What decides the look of the lead; a change builds it anew.
    const leadKey = d => [d.icon, d.tone, d.square, d.spin, d.gicon?.to_string?.(), d.picture?.to_string?.()].join('|');
    let lead = leadFor(data);
    let shownKey = leadKey(data);
    const {column, titleLabel, noteLabel} = titleAndNote(data.title, data.note);
    const trailing = text('island-metric', {text: data.trailing ?? ''});
    const showTrailing = d => {
        trailing.style_class = `halo-island-trailing halo-island-${d.trailingTone ?? 'plain'}-text`;
        trailing.text = d.trailing ?? '';
        trailing.visible = Boolean(d.trailing);
    };
    showTrailing(data);
    const actor = box('halo-island-info', {children: [lead, column, trailing]});
    return {
        actor,
        update(next) {
            const d = next.data;
            if (leadKey(d) !== shownKey) {
                const fresh = leadFor(d);
                actor.replace_child(lead, fresh);
                lead.destroy();
                lead = fresh;
                shownKey = leadKey(d);
            }
            titleLabel.text = d.title ?? '';
            noteLabel.text = d.note ?? '';
            noteLabel.visible = Boolean(d.note);
            showTrailing(d);
        },
    };
}

// A running timer: a ring that fills, its name, and the time left.
// data: {label, shown, progress, countdown}
export function timerView(activity) {
    const {data} = activity;
    const dial = ring('timer');
    dial.set(data.progress);
    const label = text('island-label', {styleClass: 'halo-island-dim', text: data.label, expand: true});
    const time = text('island-big', {styleClass: 'halo-island-text halo-island-timer-time', text: clockText(data.shown, {countdown: data.countdown})});
    const actor = box('halo-island-timer', {children: [dial.actor, label, time]});
    return {
        actor,
        update(next) {
            dial.set(next.data.progress);
            label.text = next.data.label;
            time.text = clockText(next.data.shown, {countdown: next.data.countdown});
        },
    };
}

// A screen recording: a red dot, its time, and a button that stops it.
// data: {seconds, text}; activity.onStop()
export function recordingView(activity) {
    const dot = new St.Widget({style_class: 'halo-island-rec-dot', y_align: Clutter.ActorAlign.CENTER});
    const label = text('island-title', {styleClass: 'halo-island-text', text: 'Recording', expand: true});
    const time = text('island-metric', {styleClass: 'halo-island-text', text: activity.data.text});
    const stop = round('stop', () => activity.onStop(), {tone: 'alarm', size: 42, iconSize: 24, square: true, accessibleName: 'Stop recording'});
    const actor = box('halo-island-recording', {children: [dot, label, time, stop]});
    return {
        actor,
        update(next) {
            time.text = next.data.text;
        },
    };
}

// Music, small: the cover, the title, a moving waveform and play/pause.
// data: {title, note, cover, playing}; activity.onPlay()
export function mediaCompactView(activity) {
    const {data} = activity;
    const cover = coverSlot(data.cover, {size: 50, radius: 14});
    const {column, titleLabel, noteLabel} = titleAndNote(data.title, data.note);
    column.width = 180;
    const wave = waveform();
    wave.setPlaying(data.playing);
    const play = round(data.playing ? 'pause' : 'play-arrow', () => activity.onPlay(), {square: true, size: 50, accessibleName: 'Play or pause'});
    const actor = box('halo-island-media', {children: [cover.actor, column, wave.actor, play]});
    return {
        actor,
        update(next) {
            cover.set(next.data.cover);
            titleLabel.text = next.data.title;
            noteLabel.text = next.data.note;
            wave.setPlaying(next.data.playing);
            play.child.gicon = iconGicon(next.data.playing ? 'pause' : 'play-arrow', true);
        },
    };
}

// Music, large: cover, title, where the track stands, and the controls.
// data: {title, note, cover, playing, position, length, canPrevious, canNext}
export function mediaLargeView(activity) {
    const {data} = activity;
    const cover = coverSlot(data.cover, {size: 112, radius: 26});
    const {column, titleLabel, noteLabel} = titleAndNote(data.title, data.note, {titleRole: 'island-headline'});
    const head = box('halo-island-media-head', {children: [cover.actor, column]});

    const at = text('island-small', {styleClass: 'halo-island-dim', text: ''});
    const length = text('island-small', {styleClass: 'halo-island-dim', text: ''});
    const track = new St.Widget({style_class: 'halo-island-track halo-island-thin', width: MEDIA_TRACK, y_align: Clutter.ActorAlign.CENTER});
    const fill = new St.Widget({style_class: 'halo-island-fill'});
    track.add_child(fill);
    const progress = box('halo-island-progress', {children: [at, track, length]});

    const previous = round('skip-previous', () => activity.onPrevious(), {tone: 'plain', size: 58, accessibleName: 'Previous'});
    const play = round(data.playing ? 'pause' : 'play-arrow', () => activity.onPlay(), {square: true, size: 72, iconSize: 34, accessibleName: 'Play or pause'});
    play.width = 84;
    const next = round('skip-next', () => activity.onNext(), {tone: 'plain', size: 58, accessibleName: 'Next'});
    const controls = box('halo-island-controls', {children: [previous, play, next], x_align: Clutter.ActorAlign.CENTER});

    const actor = box('halo-island-large', {vertical: true, children: [head, progress, controls], width: WIDE});
    const showProgress = d => {
        progress.visible = d.length > 0;
        if (!progress.visible)
            return;
        at.text = trackTime(d.position);
        length.text = trackTime(d.length);
        fill.height = 6;
        fill.width = Math.round(Math.max(0, Math.min(1, d.position / d.length)) * MEDIA_TRACK);
    };
    const update = upcoming => {
        activity = upcoming;
        cover.set(upcoming.data.cover);
        titleLabel.text = upcoming.data.title;
        noteLabel.text = upcoming.data.note;
        play.child.gicon = iconGicon(upcoming.data.playing ? 'pause' : 'play-arrow', true);
        previous.opacity = upcoming.data.canPrevious ? 255 : 90;
        next.opacity = upcoming.data.canNext ? 255 : 90;
        showProgress(upcoming.data);
    };
    update(activity);
    return {actor, update};
}

// A new notification: the app, the title, the text and its actions.
// data: {app, gicon, appIcon, title, body, when, actions: [{label, activate}]}
export function notificationView(activity) {
    const {data} = activity;
    const lead = data.gicon
        ? picture(data.gicon, 'notifications', {size: 50, radius: 16})
        : badge('notifications', {tone: 'tertiary', square: true, size: 50, iconSize: 26, gicon: data.appIcon});
    lead.y_align = Clutter.ActorAlign.START;
    const header = text('island-small', {styleClass: 'halo-island-dim', ellipsize: true, text: [data.app, data.when].filter(Boolean).join(' · ')});
    const title = text('island-title', {styleClass: 'halo-island-text', ellipsize: true, text: data.title});
    const body = text('island-body', {styleClass: 'halo-island-text halo-island-body', text: data.body});
    body.clutter_text.line_wrap = true;
    body.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    body.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    body.visible = Boolean(data.body);
    const column = box('halo-island-column', {vertical: true, expand: true, children: [header, title, body]});
    const top = box('halo-island-note-top', {children: [lead, column]});

    const actions = box('halo-island-actions', {x_align: Clutter.ActorAlign.END});
    data.actions.slice(0, 3).forEach((action, i, all) => {
        const last = i === all.length - 1;
        const pill = new St.Bin({
            style_class: `halo-island-action${last ? ' halo-island-action-main' : ''}`,
            child: text('island-action', {text: action.label}),
        });
        pill.accessible_name = action.label;
        pressable(pill, () => activity.onAction(action), {focus: true});
        actions.add_child(pill);
    });
    actions.visible = data.actions.length > 0;
    const actor = box('halo-island-large halo-island-notification', {vertical: true, children: [top, actions], width: WIDE});
    return {actor};
}

// A call: who calls, and the buttons to answer or decline.
// data: {name, note, gicon, video, actions: [{label, activate}]}
export function callView(activity) {
    const {data} = activity;
    const avatar = data.gicon
        ? picture(data.gicon, 'person', {size: 64, radius: 32})
        : new St.Bin({style_class: 'halo-island-avatar', width: 64, height: 64, child: text('island-avatar', {text: initials(data.name)})});
    const {column} = titleAndNote(data.note, null, {titleRole: 'island-small'});
    const name = text('island-headline', {styleClass: 'halo-island-text', ellipsize: true, text: data.name});
    column.add_child(name);
    column.get_first_child().style_class = 'halo-island-dim';
    const buttons = [];
    for (const action of data.actions.slice(0, 2)) {
        const decline = isDecline(action.label);
        buttons.push(round(decline ? 'call-end' : data.video ? 'videocam' : 'call', () => activity.onAction(action),
            {tone: decline ? 'alarm' : 'go', size: 58, iconSize: 28, accessibleName: action.label}));
    }
    // Decline on the left of answer, as in the design.
    buttons.sort((a, b) => Number(!isDecline(a.accessible_name)) - Number(!isDecline(b.accessible_name)));
    const actor = box('halo-island-large halo-island-call', {children: [avatar, column, ...buttons], width: WIDE});
    return {actor};
}

// The small bubble beside the island for the second thing going on, or
// for a dismissed one; `size` is smaller beside the resting clock.
export function bubbleView(activity, size = BUBBLE) {
    // What it holds keeps readable in the circle beside the clock.
    const k = Math.max(0.7, size / BUBBLE);
    const kind = activity.kind;
    let child;
    let update = null;
    if (kind === 'media') {
        const wave = waveform({width: Math.round(22 * k), height: Math.round(20 * k)});
        wave.setPlaying(activity.data.playing);
        child = wave.actor;
        update = next => wave.setPlaying(next.data.playing);
    } else if (kind === 'timer') {
        const dial = ring('timer', {size: Math.round(40 * k)});
        dial.set(activity.data.progress);
        child = dial.actor;
        update = next => dial.set(next.data.progress);
    } else if (kind === 'recording') {
        child = new St.Widget({style_class: 'halo-island-rec-dot', y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER});
    } else {
        const name = {call: 'call', claude: 'progress-activity', progress: 'download', privacy: activity.data?.icon ?? 'mic'}[kind] ?? 'more-horiz';
        child = icon(name, {size: Math.round(26 * k), fill: true, styleClass: `halo-island-${kind === 'call' ? 'good' : 'accent'}-text`});
        if (kind === 'claude')
            spinning(child);
    }
    child.x_align = Clutter.ActorAlign.CENTER;
    child.y_align = Clutter.ActorAlign.CENTER;
    const actor = new St.Bin({style_class: 'halo-island-bubble', child, width: size, height: size});
    return {actor, update};
}

// The time of a notification as a short word.
export function whenText(datetime) {
    if (!datetime)
        return 'now';
    const seconds = GLib.DateTime.new_now_local().difference(datetime) / 1e6;
    if (seconds < 60)
        return 'now';
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} min ago`;
    return datetime.format('%H:%M');
}
