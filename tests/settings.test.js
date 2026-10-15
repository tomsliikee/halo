import {DEFAULTS, ISLAND_EVENTS, isTime, isValid, normalize, parse} from '../extension/lib/shared/settings.js';
import {test, equal, done} from './harness.js';

test('nothing gives the defaults', () => equal(normalize(null), DEFAULTS));
test('broken JSON gives the defaults', () => equal(parse('{"colour": '), DEFAULTS));
test('an array is no settings object', () => equal(normalize([1, 2]), DEFAULTS));
test('each key falls back on its own', () => {
    const settings = parse('{"colour": "teal", "barLayout": "top", "floating": "yes", "seeThrough": true}');
    equal([settings.colour, settings.barLayout, settings.floating, settings.seeThrough], ['teal', 'full', true, true]);
});
test('the island click falls back to opening the app', () => equal(
    [parse('{"islandClick": "large"}').islandClick, parse('{"islandClick": "zoom"}').islandClick], ['large', 'app']));
test('unknown keys are dropped', () => equal('extra' in parse('{"extra": 1}'), false));
test('all eight colours are valid', () => equal(
    ['blue', 'violet', 'green', 'teal', 'orange', 'salmon', 'pink', 'white', 'red'].map(c => isValid('colour', c)),
    [true, true, true, true, true, true, true, true, false]));
test('parts fall back one by one', () => equal(parse('{"parts": {"island": false, "bar": "no"}}').parts,
    {bar: true, island: false, center: true, quickSettings: true}));
test('island events default on and fall back one by one', () => {
    const events = parse('{"islandEvents": {"clipboard": false, "volume": 0}}').islandEvents;
    equal([events.clipboard, events.volume, Object.keys(events).length], [false, true, ISLAND_EVENTS.length]);
});
test('a switches value must name every switch', () => equal(
    [isValid('parts', {bar: false}), isValid('parts', DEFAULTS.parts), isValid('islandEvents', DEFAULTS.islandEvents)],
    [false, true, true]));
test('times of day', () => equal(['19:00', '07:30', '24:00', '7:00', '12:60', 1900].map(isTime),
    [true, true, false, false, false, false]));
test('a broken time falls back', () => equal([parse('{"darkFrom": "25:00"}').darkFrom, parse('{"darkTo": "06:15"}').darkTo],
    ['19:00', '06:15']));
test('tile lists keep each word once', () => equal(parse('{"tileOrder": ["wifi", 3, "", "bluetooth", "wifi"]}').tileOrder,
    ['wifi', 'bluetooth']));
test('tile lists must be clean to be set', () => equal(
    [isValid('hiddenTiles', ['vpn']), isValid('hiddenTiles', ['vpn', 'vpn']), isValid('hiddenTiles', 'vpn')], [true, false, false]));
done('settings');
