// What the island shows when more than one thing wants it, worked out from
// plain values so it can be tested without a shell.
//
// An activity is {id, kind, hint, at}: kind names what it is, hint marks a
// short message that leaves by itself (a volume change, a notification),
// at is when it came, in milliseconds. Everything else lasts as long as it
// is going on (a call, a recording, music).

// Lasting things in their fixed order: the higher one takes the island,
// the next one sits beside it as a small bubble.
export const RANKS = {call: 6, recording: 5, privacy: 5, timer: 4, claude: 3, media: 2, progress: 1};

const rankOf = activity => RANKS[activity.kind] ?? 0;

// Higher rank first; of two with the same rank, the newer.
export function byRank(a, b) {
    return rankOf(b) - rankOf(a) || b.at - a.at;
}

// {main, bubble, hidden}: what the island shows and what waits beside it;
// any may be null. A call always wins. A hint comes next and shows over
// what lasts, which moves into the bubble meanwhile. A focused id (the
// bubble that was clicked) goes before the rest of what lasts.
//
// Dismissed ids step aside, but a lasting thing is still going: the
// highest of them is `hidden` and waits in the bubble where nothing else
// takes it, also beside the resting clock, so a click brings it back.
export function pick(activities, dismissed = new Set(), focus = null) {
    const live = activities.filter(activity => !dismissed.has(activity.id));
    const lasting = live.filter(activity => !activity.hint).sort(byRank);
    const focused = lasting.findIndex(activity => activity.id === focus);
    if (focused > 0)
        lasting.unshift(...lasting.splice(focused, 1));
    const hidden = activities.filter(activity => !activity.hint && dismissed.has(activity.id)).sort(byRank)[0] ?? null;
    const hints = live.filter(activity => activity.hint).sort((a, b) => b.at - a.at);
    const call = lasting.find(activity => activity.kind === 'call');
    if (call)
        return {main: call, bubble: lasting.find(activity => activity !== call) ?? hidden, hidden};
    if (hints.length > 0)
        return {main: hints[0], bubble: lasting[0] ?? hidden, hidden};
    return {main: lasting[0] ?? null, bubble: lasting[1] ?? hidden, hidden};
}

// Kinds that tell what someone says, plans or works on. On the lock screen
// they stay out, unless a source made a version without the content for it
// (lockSafe), as GNOME's lock screen shows only how many came from an app.
export const PRIVATE_KINDS = new Set(['notification', 'call', 'claude', 'clipboard', 'events']);

export function shownWhileLocked(activities, locked) {
    if (!locked)
        return activities;
    return activities.filter(activity => activity.lockSafe || !PRIVATE_KINDS.has(activity.kind));
}

// What a scroll on the island means: sideways (a touchpad swipe, a tilted
// wheel, or the wheel with Shift) swaps what shows with the bubble; up and
// down change what shows (louder, a minute more). dx, dy as Clutter gives
// them: a wheel click is 1, a touchpad moves in fractions; down is +y.
// Returns {axis: 'x' | 'y', amount}, amount positive for right and up.
export function scrollIntent(dx, dy, shift = false) {
    if (shift)
        return {axis: 'x', amount: dx || dy};
    if (Math.abs(dx) > Math.abs(dy))
        return {axis: 'x', amount: dx};
    return {axis: 'y', amount: -dy};
}

// A touchpad's fractions added up to whole steps: {sum, steps} after
// adding `amount` to what was left over.
export function accumulate(sum, amount) {
    const total = sum + amount;
    const steps = Math.trunc(total);
    return {sum: total - steps, steps};
}

// Running things that may rise into the bar's clock and stay there. A call
// wants to be answered and stays below.
export const DOCKS = new Set(['media', 'timer', 'recording', 'claude', 'progress', 'privacy']);

// Where the island is: {drop, docked}. drop: it hangs below the bar rather
// than in it; docked: a running thing sits in the clock's pill. Something
// new drops below the bar for `introMs`, a running thing then rises into
// the clock when docking is on. An opened look always drops.
export function placement({main, expanded = null, dock = true, now = 0, introMs = 0}) {
    if (!main)
        return {drop: false, docked: false};
    if (main.hint || (expanded === main.id && main.large))
        return {drop: true, docked: false};
    const docked = dock && DOCKS.has(main.kind) && now >= main.at + introMs;
    return {drop: !docked, docked};
}
