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
