import {morphAt} from '../extension/lib/center/morph.js';
import {test, equal, done} from './harness.js';

const pill = {x: 500, y: 8, width: 200, height: 36, radius: 18};
const card = {x: 180, y: 60, width: 840, height: 600, radius: 32};
const round = at => Object.fromEntries(Object.entries(at).map(([k, v]) => [k, Math.round(v * 100) / 100]));

test('starts on the clock', () => equal(round(morphAt(pill, card, 0)), {x: 500, y: 8, width: 200, height: 36, radius: 18, share: 0, colour: 0}));
test('ends on the card', () => equal(round(morphAt(pill, card, 1)), {x: 180, y: 60, width: 840, height: 600, radius: 32, share: 1, colour: 1}));
test('half way keeps the centre between both', () => {
    const at = morphAt(pill, card, 0.5);
    equal(at.x + at.width / 2, 600);
});
test('an overshoot grows past the card on both sides, corners stay', () => {
    const at = round(morphAt(pill, card, 1.1));
    equal([at.width > 840, at.x < 180, at.x + at.width > 1020, at.radius, at.share], [true, true, true, 32, 1]);
});
test('never smaller than a pixel', () => equal(morphAt(pill, {...pill, width: 0, height: 0}, 1.5).width, 1));
test('the colour has turned a third of the way in', () => equal([morphAt(pill, card, 0.15).colour, morphAt(pill, card, 0.3).colour, morphAt(pill, card, 0.6).colour], [0.5, 1, 1]));
done('morph');
