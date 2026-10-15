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

// {main, bubble}: what the island shows and what waits beside it; either
// may be null. A call always wins. A hint comes next and shows over what
// lasts, which moves into the bubble meanwhile. Dismissed ids are left out
// until they come again; a focused id (the bubble that was clicked) goes
// before the rest of what lasts.
export function pick(activities, dismissed = new Set(), focus = null) {
    const live = activities.filter(activity => !dismissed.has(activity.id));
    const lasting = live.filter(activity => !activity.hint).sort(byRank);
    const focused = lasting.findIndex(activity => activity.id === focus);
    if (focused > 0)
        lasting.unshift(...lasting.splice(focused, 1));
    const hints = live.filter(activity => activity.hint).sort((a, b) => b.at - a.at);
    const call = lasting.find(activity => activity.kind === 'call');
    if (call)
        return {main: call, bubble: lasting.find(activity => activity !== call) ?? null};
    if (hints.length > 0)
        return {main: hints[0], bubble: lasting[0] ?? null};
    return {main: lasting[0] ?? null, bubble: lasting[1] ?? null};
}
