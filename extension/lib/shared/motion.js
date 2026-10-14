// One way to animate. Colour and opacity ease out without overshoot; size,
// position and shape may overshoot a little. Nothing moves when the
// desktop has animations switched off.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export const STATE_MS = 200;
export const FADE = Clutter.AnimationMode.EASE_OUT_CUBIC;
export const SPATIAL = Clutter.AnimationMode.EASE_OUT_BACK;

export function animationsOn() {
    return St.Settings.get().enable_animations;
}

// Calls onProgress with the eased 0–1 (beyond 1 while overshooting) and
// returns the running timeline, or null when the value was set at once.
export function animate(actor, duration, onProgress, {mode = FADE, loop = false} = {}) {
    if (!animationsOn()) {
        onProgress(loop ? 0 : 1);
        return null;
    }
    const timeline = new Clutter.Timeline({actor, duration, repeat_count: loop ? -1 : 0});
    if (!loop)
        timeline.set_progress_mode(mode);
    timeline.connect('new-frame', () => onProgress(timeline.get_progress()));
    if (!loop)
        timeline.connect('completed', () => onProgress(1));
    timeline.start();
    return timeline;
}

// actor.ease() that jumps when animations are off.
export function ease(actor, props, {duration = STATE_MS, mode = FADE, onComplete} = {}) {
    actor.remove_all_transitions();
    if (!animationsOn() || duration <= 0) {
        Object.assign(actor, props);
        onComplete?.();
        return;
    }
    actor.ease({...props, duration, mode, onComplete});
}
