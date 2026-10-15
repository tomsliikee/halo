// Copied from Ledge (extension/lib/timer.js), which shares its timers with
// Halo through lib/shared/timers.js; keep the two the same.
// A countdown or a stopwatch as plain state, so it survives a rebuilt
// widget and can be tested without a clock.
//
// {mode: 'timer' | 'stopwatch', duration, elapsed, startedAt}
// elapsed counts the finished runs; startedAt is set while running.

export function create(mode, duration = 0) {
    return {mode, duration, elapsed: 0, startedAt: null};
}

export function isRunning(state) {
    return state.startedAt !== null;
}

export function elapsed(state, now) {
    return state.elapsed + (isRunning(state) ? now - state.startedAt : 0);
}

export function start(state, now) {
    return isRunning(state) ? state : {...state, startedAt: now};
}

export function pause(state, now) {
    return isRunning(state) ? {...state, elapsed: elapsed(state, now), startedAt: null} : state;
}

export function reset(state) {
    return {...state, elapsed: 0, startedAt: null};
}

// What the display shows: time left for a timer, time run for a stopwatch.
export function shown(state, now) {
    const run = elapsed(state, now);
    return state.mode === 'timer' ? Math.max(0, state.duration - run) : run;
}

export function isFinished(state, now) {
    return state.mode === 'timer' && elapsed(state, now) >= state.duration;
}

// 0–1 of a timer that is used up; a stopwatch has no end.
export function progress(state, now) {
    if (state.mode !== 'timer' || state.duration <= 0)
        return 0;
    return Math.min(1, elapsed(state, now) / state.duration);
}
