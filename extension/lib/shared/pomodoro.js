// Copied from Ledge (extension/lib/pomodoro.js); keep the two the same.
// Work and breaks in turn, as plain state on top of a timer.
//
// {phase: 'work' | 'rest' | 'long', round, timer}
// round counts the work phases from 1; after the last of a set comes the
// long break and the count starts again. config: {work, rest, long, rounds}
// with the lengths in milliseconds.

import * as Timer from './timer.js';

export function create(config) {
    return {phase: 'work', round: 1, timer: Timer.create('timer', config.work)};
}

// The phase that follows, not yet started.
export function following(state, config) {
    if (state.phase !== 'work')
        return {phase: 'work', round: state.phase === 'long' ? 1 : state.round + 1, timer: Timer.create('timer', config.work)};
    const phase = state.round >= config.rounds ? 'long' : 'rest';
    return {phase, round: state.round, timer: Timer.create('timer', config[phase])};
}

// When the running phase ends, or null while it is paused.
export function endsAt(state) {
    const {timer} = state;
    return Timer.isRunning(timer) ? timer.startedAt + timer.duration - timer.elapsed : null;
}

// Moves on through every phase that has ended by now. Each next phase
// starts the moment the one before it ended, so a widget that was not
// looked at for an hour stands where it should. Returns the state and how
// many phases ended.
export function settle(state, now, config) {
    let ended = 0;
    let current = state;
    for (let end = endsAt(current); end !== null && end <= now; end = endsAt(current)) {
        const next = following(current, config);
        current = {...next, timer: Timer.start(next.timer, end)};
        ended++;
    }
    return {state: current, ended};
}

export function start(state, now) {
    return {...state, timer: Timer.start(state.timer, now)};
}

export function pause(state, now) {
    return {...state, timer: Timer.pause(state.timer, now)};
}
