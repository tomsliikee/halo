import {anyOverlaps, barAway, grownWidth, growsFree, handleRect, isSwipeUp, restShown, takesRoom} from '../extension/lib/bar/modes.js';
import {test, equal, done} from './harness.js';

test('the bar is away in the hidden modes', () => equal(
    ['bar', 'island', 'handle'].map(mode => barAway({mode})), [false, true, true]));
test('the bar hides over fullscreen only when it should', () => equal(
    [barAway({mode: 'bar', fullscreen: true}), barAway({mode: 'bar', fullscreen: true, hideInFullscreen: false})], [true, false]));
test('only the bar takes room from the windows', () => equal(
    ['bar', 'island', 'handle'].map(takesRoom), [true, false, false]));
test('the grip stands centred at the top', () => equal(
    handleRect({x: 0, y: 0, width: 1280}), {x: 592, y: 8, width: 96, height: 6}));
test('the grip follows a second monitor', () => equal(
    handleRect({x: 1280, y: 0, width: 1024}).x, 1744));

test('the clock shows in bar mode, swiped or not', () => equal(
    restShown({mode: 'bar', swipedUntil: 100, now: 50}), true));
test('a swipe sends the clock island away for its time', () => equal(
    [restShown({mode: 'island', swipedUntil: 100, now: 50}), restShown({mode: 'island', swipedUntil: 100, now: 100})], [false, true]));
test('the handle shows the clock only while the pointer is on it', () => equal(
    [restShown({mode: 'handle'}), restShown({mode: 'handle', handleOpen: true})], [false, true]));
test('the bar pushed down brings the clock in every mode', () => equal(
    [restShown({mode: 'handle', barShown: true}), restShown({mode: 'island', barShown: true, swipedUntil: 100, now: 0})], [true, true]));

test('a swipe up is mostly up and far enough', () => equal(
    [isSwipeUp(0, -20), isSwipeUp(0, -10), isSwipeUp(30, -20), isSwipeUp(0, 20)], [true, false, false, false]));

const island = {x: 500, y: 8, width: 300, height: 36};
const window = rect => ({rect, minimized: false, skipTaskbar: false, onMonitor: true});
test('a window below the island takes its freedom', () => equal(
    anyOverlaps(island, [window({x: 0, y: 0, width: 1280, height: 800})]), true));
test('a window elsewhere, minimised or skipped leaves it free', () => equal(anyOverlaps(island, [
    window({x: 0, y: 100, width: 1280, height: 700}),
    {...window(island), minimized: true},
    {...window(island), skipTaskbar: true},
    {...window(island), onMonitor: false},
]), false));
test('the island grows by a quarter or a half', () => equal(
    [grownWidth(200, 0), grownWidth(200, 25), grownWidth(200, 50)], [200, 250, 300]));
test('only the free island in island mode grows', () => equal([
    growsFree({mode: 'island', percent: 25, free: true}),
    growsFree({mode: 'island', percent: 25, free: false}),
    growsFree({mode: 'island', percent: 0, free: true}),
    growsFree({mode: 'island', percent: 50, free: true, barDown: true}),
    growsFree({mode: 'handle', percent: 50, free: true}),
    growsFree({mode: 'bar', percent: 50, free: true}),
], [true, false, false, false, false, false]));

done('modes');
