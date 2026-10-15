// The shared timers as plain values: what the file holds and which one is
// running. See timerstore.js for the file.
//
// {timer, stopwatch, pomodoro: {state, config}}, each null when unused;
// states are those of timer.js and pomodoro.js, times in ms since 1970.

import * as Pomodoro from './pomodoro.js';
import * as Timer from './timer.js';

export const MINUTE = 60 * 1000;
// Ledge's pomodoro: four rounds, then a long break of 15 minutes.
export const POMODORO = {work: 25 * MINUTE, rest: 5 * MINUTE, long: 15 * MINUTE, rounds: 4};

function isTimer(value) {
    return value !== null && typeof value === 'object' && ['timer', 'stopwatch'].includes(value.mode) &&
        typeof value.duration === 'number' && typeof value.elapsed === 'number' &&
        (value.startedAt === null || typeof value.startedAt === 'number');
}

function isConfig(value) {
    return value !== null && typeof value === 'object' &&
        ['work', 'rest', 'long', 'rounds'].every(key => typeof value[key] === 'number' && value[key] > 0);
}

// Whatever was read, as states that can be trusted.
export function parseTimers(text) {
    let raw = null;
    try {
        raw = JSON.parse(text);
    } catch {
        // An empty or broken file is no timers.
    }
    const source = raw !== null && typeof raw === 'object' ? raw : {};
    const pomodoro = source.pomodoro;
    const pomodoroOk = pomodoro && isConfig(pomodoro.config) && isTimer(pomodoro.state?.timer) &&
        ['work', 'rest', 'long'].includes(pomodoro.state.phase) && typeof pomodoro.state.round === 'number';
    return {
        timer: isTimer(source.timer) && source.timer.mode === 'timer' ? source.timer : null,
        stopwatch: isTimer(source.stopwatch) && source.stopwatch.mode === 'stopwatch' ? source.stopwatch : null,
        pomodoro: pomodoroOk ? {state: pomodoro.state, config: pomodoro.config} : null,
    };
}

// The one the island shows: a running pomodoro before a running timer
// before a running stopwatch. {kind, title, shown, progress, countdown,
// endsAt} or null.
export function runningTimer(timers, now) {
    const pomodoro = timers.pomodoro;
    if (pomodoro && Timer.isRunning(pomodoro.state.timer)) {
        const {state} = Pomodoro.settle(pomodoro.state, now, pomodoro.config);
        return {
            kind: 'pomodoro', phase: state.phase, round: state.round,
            shown: Timer.shown(state.timer, now), progress: Timer.progress(state.timer, now),
            countdown: true, endsAt: Pomodoro.endsAt(state),
        };
    }
    const timer = timers.timer;
    if (timer && Timer.isRunning(timer)) {
        return {
            kind: 'timer', shown: Timer.shown(timer, now), progress: Timer.progress(timer, now),
            countdown: true, endsAt: timer.startedAt + timer.duration - timer.elapsed,
        };
    }
    const stopwatch = timers.stopwatch;
    if (stopwatch && Timer.isRunning(stopwatch))
        return {kind: 'stopwatch', shown: Timer.shown(stopwatch, now), progress: 0, countdown: false, endsAt: null};
    return null;
}

// Begun and stopped part way: a pomodoro or timer with time run, a
// stopwatch that has counted.
export function isPaused(timers, kind) {
    const state = kind === 'pomodoro' ? timers.pomodoro?.state.timer : timers[kind];
    if (!state || Timer.isRunning(state) || state.elapsed <= 0)
        return false;
    return state.mode === 'stopwatch' || state.elapsed < state.duration;
}

// The tile's note while nothing runs.
export function pausedNote(timers) {
    if (isPaused(timers, 'pomodoro') || isPaused(timers, 'timer') || isPaused(timers, 'stopwatch'))
        return 'Paused';
    return 'Off';
}
