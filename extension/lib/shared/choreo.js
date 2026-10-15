// Expressive motion: springs on a timeline. Every length here is for the
// normal speed; "Quick" and "Slow" stretch time as a whole, so a spring
// keeps its character and only takes more or less of it. With expressive
// motion or the desktop's animations off, values are set at once.

import Clutter from 'gi://Clutter';

import {animationsOn} from './motion.js';
import {settleMs, springAt} from './spring.js';

// Halo's springs. Spatial ones pass their target and come back; the
// press is an effect spring and never does.
export const SPRINGS = {
    // A panel rising into place: quick, barely past.
    rise: {damping: 0.8, stiffness: 600},
    // The island growing out of the clock: visibly past, then back.
    grow: {damping: 0.58, stiffness: 340},
    // The island shrinking back to the clock: a small swing only.
    shrink: {damping: 0.75, stiffness: 420},
    // The bar spreading to both sides: visibly past, then back.
    spread: {damping: 0.62, stiffness: 380},
    // An icon popping in, a count popping up.
    pop: {damping: 0.6, stiffness: 500},
    // The focus moving from one app to the next.
    glide: {damping: 0.72, stiffness: 420},
    // The hover shape growing, the icon lifting.
    hover: {damping: 0.7, stiffness: 520},
    // Something on its way out: no swing, it must not turn inside out.
    leave: {damping: 1, stiffness: 500},
    press: {damping: 1, stiffness: 1600},
    release: {damping: 0.5, stiffness: 700},
};

const SPEEDS = {quick: 0.7, normal: 1, slow: 1.4};

let motion = {expressive: true, speed: 1};

// settings: Halo's settings; a plain `speed` factor is for tests that
// look at single frames in slow motion.
export function setMotion(settings) {
    motion = {expressive: settings.expressiveMotion, speed: SPEEDS[settings.motionSpeed] ?? settings.speed ?? 1};
}

// Whether things should move expressively right now.
export function expressive() {
    return motion.expressive && animationsOn();
}

// A length at normal speed, in the time it takes now.
export function stretch(ms) {
    return Math.round(ms * motion.speed);
}

// Real milliseconds as normal-speed ones.
export function normal(ms) {
    return ms / motion.speed;
}

// Where a spring let go at `start` (normal-speed ms) is after `ms` of real
// time: 0 before it starts, about 1 once it has settled.
export function springShare(ms, start, spring) {
    return springAt((ms / motion.speed - start) / 1000, spring);
}

// Runs onFrame(ms) every frame for `length` normal-speed milliseconds and
// once more at the very end. Returns the timeline; stop() ends it early
// without onDone.
export function run(actor, length, onFrame, onDone = null) {
    const timeline = new Clutter.Timeline({actor, duration: Math.max(1, stretch(length))});
    timeline.connect('new-frame', () => onFrame(timeline.get_elapsed_time()));
    timeline.connect('completed', () => {
        onFrame(timeline.get_duration());
        onDone?.();
    });
    timeline.start();
    return timeline;
}

function springsOf(actor) {
    if (!actor._haloSprings) {
        actor._haloSprings = new Map();
        actor.connect('destroy', () => {
            for (const timeline of actor._haloSprings.values())
                timeline.stop();
            actor._haloSprings.clear();
        });
    }
    return actor._haloSprings;
}

// Stops what springs an actor's properties (all of them without keys).
export function stopSprings(actor, keys = null) {
    const springs = actor._haloSprings;
    if (!springs)
        return;
    for (const [key, timeline] of springs) {
        if (!keys || key.split(',').some(name => keys.includes(name))) {
            timeline.stop();
            springs.delete(key);
        }
    }
}

// Springs numeric properties of an actor from where they are to `to`. A
// new spring for the same properties takes over from where the old one is.
export function spring(actor, to, {spring = SPRINGS.pop, delay = 0, onDone = null} = {}) {
    const names = Object.keys(to);
    stopSprings(actor, names);
    if (!expressive()) {
        Object.assign(actor, to);
        onDone?.();
        return;
    }
    const from = Object.fromEntries(names.map(name => [name, actor[name]]));
    // Already there: no timeline, so a bar or an island that is asked to
    // stay where it is draws no frames for it.
    if (!delay && names.every(name => Math.abs(from[name] - to[name]) < 0.01)) {
        Object.assign(actor, to);
        onDone?.();
        return;
    }
    const length = delay + settleMs(spring);
    const key = names.sort().join(',');
    const springs = springsOf(actor);
    const timeline = run(actor, length, ms => {
        const share = ms >= stretch(length) ? 1 : springShare(ms, delay, spring);
        for (const name of names)
            actor[name] = from[name] + (to[name] - from[name]) * share;
    }, () => {
        springs.delete(key);
        onDone?.();
    });
    springs.set(key, timeline);
}
