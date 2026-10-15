// The plan limits Tally keeps in its cache (~/.cache/tally), read the way
// Ledge reads them (ledge/extension/lib/claude.js), and the moments a limit
// crosses one of the marks the island tells about.

const SECOND = 1000;

// The marks, in percent of a window.
export const MARKS = [80, 95];

function fromProbe(record) {
    const limits = record?.limits;
    if (!limits?.session && !limits?.week)
        return null;
    return {at: record.at ?? 0, session: limits.session ?? null, week: limits.week ?? null};
}

function fromStatusline(record) {
    const window = entry => entry && typeof entry.used_percentage === 'number'
        ? {percent: entry.used_percentage, resetsAt: entry.resets_at ? entry.resets_at * SECOND : null}
        : null;
    const session = window(record?.rate_limits?.five_hour);
    const week = window(record?.rate_limits?.seven_day);
    if (!session && !week)
        return null;
    return {at: record.at ?? 0, session, week};
}

// A window whose reset has passed starts again at nothing.
function rollOver(window, now) {
    if (window?.resetsAt && window.resetsAt <= now)
        return {percent: 0, resetsAt: null};
    return window;
}

function parse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// The newer of the two records, or null when Tally has written neither.
export function readLimits(probeText, statuslineText, now) {
    const records = [fromProbe(parse(probeText)), fromStatusline(parse(statuslineText))]
        .filter(Boolean)
        .sort((a, b) => b.at - a.at);
    if (records.length === 0)
        return null;
    const [newest, older] = records;
    return {
        at: newest.at,
        session: rollOver(newest.session ?? older?.session ?? null, now),
        week: rollOver(newest.week ?? older?.week ?? null, now),
    };
}

function markOf(window) {
    const percent = window?.percent ?? 0;
    return MARKS.filter(mark => percent >= mark).at(-1) ?? 0;
}

// What crossed a mark upwards between two readings: [{window, mark, percent,
// resetsAt}], 'session' before 'week'. The first reading tells nothing, so
// a limit that is already high does not speak up after a restart.
export function crossed(before, after) {
    if (!before || !after)
        return [];
    return ['session', 'week']
        .filter(name => markOf(after[name]) > markOf(before[name]))
        .map(name => ({window: name, mark: markOf(after[name]), percent: after[name].percent, resetsAt: after[name].resetsAt}));
}
