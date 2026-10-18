// What the island writes, worked out from plain values, so it can be tested
// without a shell. Units are written with a space (design system, Voice).

import {durationText, elapsedText} from '../bar/words.js';

// What one of GNOME's on-screen displays is about, from its icon name.
export function osdKind(iconName) {
    const name = (iconName ?? '').replace(/-symbolic$/, '');
    if (name.startsWith('audio-volume') || name.startsWith('audio-speakers') || name.startsWith('audio-headphones'))
        return 'volume';
    if (name.startsWith('microphone-sensitivity') || name.startsWith('audio-input-microphone'))
        return 'microphone';
    if (name.startsWith('display-brightness'))
        return 'brightness';
    if (name.startsWith('keyboard-brightness'))
        return 'keyboardLight';
    return 'other';
}

export function isMuted(iconName) {
    return /muted/.test(iconName ?? '');
}

// The icon the island shows for an on-screen display: level 0–1.
export function osdIcon(kind, level, muted) {
    if (kind === 'volume') {
        if (muted)
            return 'no-sound';
        return level <= 0 ? 'volume-mute' : level < 0.5 ? 'volume-down' : 'volume-up';
    }
    if (kind === 'microphone')
        return muted ? 'mic-off' : 'mic';
    if (kind === 'brightness')
        return 'brightness-6';
    if (kind === 'keyboardLight')
        return 'keyboard';
    return 'tune';
}

// The share of a level the island's bar fills: GNOME passes the level and
// a maximum above 1 when the volume may go past 100 %.
export function levelShare(level, maxLevel) {
    const max = maxLevel > 0 ? maxLevel : 1;
    return Math.max(0, Math.min(1, level / max));
}

// A timer's display: "16:24", "1:02:03". A countdown rounds up, so it
// never reads 0:00 while a second is left.
export function clockText(ms, {countdown = false} = {}) {
    const seconds = Math.max(0, Math.floor((ms + (countdown ? 999 : 0)) / 1000));
    const two = n => String(n).padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${two(minutes)}:${two(seconds % 60)}`;
}

export const POMODORO_PHASES = {work: 'Focus', rest: 'Break', long: 'Long break'};

// The battery crossed one of these on its way down: the island says so once.
export const LOW_MARKS = [20, 10];

// The mark a falling battery has just passed, or null.
export function lowMark(before, after) {
    if (!before || !after || after.charging)
        return null;
    return LOW_MARKS.filter(mark => before.percent > mark && after.percent <= mark).at(-1) ?? null;
}

// "web-shop · working for 3 min"; since in ms, now in ms.
export function claudeNote(session, now) {
    if (session.state === 'waiting')
        return `${session.project} · waiting for you`;
    if (typeof session.since !== 'number')
        return `${session.project} · working`;
    return `${session.project} · working for ${durationText((now - session.since) / 1000)}`;
}

// "Claude session at 80 %" and when it resets.
export function limitTitle({window, mark}) {
    return `Claude ${window === 'week' ? 'week' : 'session'} at ${mark} %`;
}

export function limitNote({resetsAt}, now) {
    if (!resetsAt)
        return 'Tally keeps track';
    return `Resets in ${durationText(Math.max(0, resetsAt - now) / 1000)}`;
}

// "Starts in 10 min"; seconds until the start.
export function soonText(seconds) {
    return seconds < 60 ? 'Starts now' : `Starts in ${durationText(seconds)}`;
}

// The letters of a caller's round picture: "Lerngruppe" is "LE", "Lern
// Gruppe" is "LG".
export function initials(name) {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return '?';
    if (words.length === 1)
        return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words.at(-1)[0]).toUpperCase();
}

// Notification bodies may carry a little markup; the island shows text.
export function plainText(markup) {
    return (markup ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

// A copied text as a short line: the first line, cut at `max` characters.
export function copiedText(text, max = 40) {
    const line = (text ?? '').split('\n').map(part => part.trim()).find(Boolean) ?? '';
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// The actions of a call: which one hangs up. Apps name them, so this goes
// by the words.
export function isDecline(label) {
    return /decline|reject|hang|end|dismiss|ignore|ablehnen|auflegen|beenden/i.test(label ?? '');
}

// "1:12" for a media position; microseconds as MPRIS gives them.
export function trackTime(microseconds) {
    const seconds = Math.max(0, Math.floor(microseconds / 1e6));
    const two = n => String(n).padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${minutes}:${two(seconds % 60)}`;
}

// "Recording" with its time, as the bar has it.
export function recordingText(seconds) {
    return elapsedText(seconds);
}

// The lock screen's line for an app's notifications: the title only where
// the user lets the details show there, else how many came.
export function lockedNote(count, title = '') {
    if (title)
        return title;
    return count === 1 ? 'New notification' : `${count} new notifications`;
}

// The hover preview's line: a little more than the small island says, and
// what a scroll does there.
export function mediaPeek({app, position, length}) {
    const time = length > 0 ? `${trackTime(position)} of ${trackTime(length)}` : '';
    return [app, time, 'scroll for volume'].filter(Boolean).join(' · ');
}

// endsAt: ms since 1970; twelveHour as GNOME's clock format says.
export function timerPeek(endsAt, twelveHour = false) {
    const end = new Date(endsAt);
    const minutes = String(end.getMinutes()).padStart(2, '0');
    const hours = twelveHour ? `${end.getHours() % 12 || 12}:${minutes} ${end.getHours() < 12 ? 'AM' : 'PM'}` : `${end.getHours()}:${minutes}`;
    return `Ends at ${hours} · scroll for a minute more or less`;
}

export function claudePeek(sessions) {
    const projects = [...new Set(sessions.map(session => session.project).filter(Boolean))];
    return projects.length > 0 ? projects.join(', ') : '';
}

// The app a Claude Code session runs in, from the systemd unit Ember
// reports ("app-gnome-org.gnome.Ptyxis-4242.scope", "app-com.anthropic.Claude-33622.scope"),
// as a desktop file id, or null.
export function unitAppId(unit) {
    const match = /^app-(?:gnome-|flatpak-)?(.+?)(?:-\d+)?(?:@[^.]*)?\.(?:scope|service)$/.exec(unit ?? '');
    if (!match)
        return null;
    return `${match[1].replace(/\\x2d/g, '-')}.desktop`;
}

// A workspace by its name in GNOME's settings, else by its number.
export function workspaceTitle(index, names = []) {
    return names[index]?.trim() || `Workspace ${index + 1}`;
}

// Below a workspace's name: how many windows it holds.
export function workspaceNote(windows) {
    if (windows === 0)
        return 'Empty';
    return windows === 1 ? '1 window' : `${windows} windows`;
}

export function lockTitle(kind, on) {
    return `${kind === 'caps' ? 'Caps Lock' : 'Num Lock'} ${on ? 'on' : 'off'}`;
}

// A drive that came or went: {title, note}.
export function driveText(name, added) {
    return {title: name || 'Drive', note: added ? 'Connected · click to open' : 'Removed'};
}

// The resting clock's glance: what the weather and the day hold, as
// [{icon, text}], the weather first. weather: {temperature, code, isDay}
// or null; event: {summary, text} or null.
export function glanceItems(weather, event, weatherIconFor, temperatureFor) {
    const items = [];
    if (weather && Number.isFinite(weather.temperature))
        items.push({icon: weatherIconFor(weather.code, weather.isDay), text: temperatureFor(weather.temperature)});
    if (event?.summary)
        items.push({icon: 'event', text: `${event.summary} ${event.text}`.trim()});
    return items;
}

// The glance's third line, from Tally's plan limits (limits.js): the
// five-hour window, the week, and when the five hours start again, as
// [{icon, text}]; empty without limits.
export function claudeItems(limits, now) {
    if (!limits?.session && !limits?.week)
        return [];
    const parts = [];
    if (limits.session)
        parts.push(`Claude ${Math.round(limits.session.percent)} %`);
    if (limits.week)
        parts.push(`week ${Math.round(limits.week.percent)} %`);
    const resetsAt = limits.session?.resetsAt;
    if (resetsAt && resetsAt > now)
        parts.push(`new in ${uptimeText((resetsAt - now) / 1000)}`);
    return [{icon: 'smart-toy', text: parts.join(' · ')}];
}

// The glance's second line: how the computer is doing, as [{icon, text}].
// readings: {battery: {percent, charging} | null, memoryUsed (share),
// temperature (°C), diskFree (bytes), uptime (s)}, each null when unknown.
export function statsItems({battery = null, memoryUsed = null, temperature = null, diskFree = null, uptime = null}, batteryIconFor) {
    const items = [];
    if (battery && Number.isFinite(battery.percent))
        items.push({icon: batteryIconFor(battery.percent, battery.charging), text: `${Math.round(battery.percent)} %`});
    if (Number.isFinite(memoryUsed))
        items.push({icon: 'speed', text: `RAM ${Math.round(100 * memoryUsed)} %`});
    if (Number.isFinite(temperature))
        items.push({icon: 'computer', text: `${Math.round(temperature)} °C`});
    if (Number.isFinite(diskFree))
        items.push({icon: 'folder', text: `${sizeText(diskFree)} free`});
    if (Number.isFinite(uptime) && uptime >= 0)
        items.push({icon: 'schedule', text: `up ${uptimeText(uptime)}`});
    return items;
}

// Bytes as GB, or TB from a thousand GB on.
export function sizeText(bytes) {
    const gb = bytes / 1e9;
    if (gb >= 1000)
        return `${(gb / 1000).toFixed(1)} TB`;
    return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

// Seconds as "12 min", "3 h 5 min" or "2 d 4 h".
export function uptimeText(seconds) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `${days} d ${hours % 24} h`;
    if (hours > 0)
        return `${hours} h ${minutes % 60} min`;
    return `${minutes} min`;
}

export function updatesText(count) {
    return {title: count === 1 ? '1 update' : `${count} updates`, note: 'Ready to install · click to see them'};
}

export function healthText(problem, readings) {
    if (problem === 'hot')
        return {title: 'Running hot', note: `${Math.round(readings.temperature)} °C`};
    const left = Math.round(100 * (problem === 'memory' ? readings.memory : readings.disk));
    return problem === 'memory'
        ? {title: 'Memory nearly full', note: `${left} % left`}
        : {title: 'Disk nearly full', note: `${left} % left`};
}

export function rainText({rainIn, warning}) {
    if (warning)
        return {title: warning, note: rainIn === null ? 'In the next hour' : rainNote(rainIn)};
    return {title: rainIn === 0 ? 'Rain now' : `Rain in ${rainIn} min`, note: 'Take an umbrella'};
}

function rainNote(minutes) {
    return minutes === 0 ? 'Rain now' : `Rain in ${minutes} min`;
}

export function phoneBatteryText(name, level) {
    return {title: `${name || 'Phone'} battery low`, note: `${Math.round(level)} %`};
}
