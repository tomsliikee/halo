import {monthGrid, monthRange, shiftMonth, weekdays} from '../extension/lib/center/calendar.js';
import {
    agoText, eventSoonText, eventTimeText, groupNotifications, offsetText, swipeDismisses, temperatureText, weatherIcon,
} from '../extension/lib/center/words.js';
import {parsePlace, parseToday} from '../extension/lib/center/forecast.js';
import {test, equal, done} from './harness.js';

test('October 2026 starts on a Thursday', () => equal(monthGrid(2026, 9, 1)[0], [null, null, null, 1, 2, 3, 4]));
test('October 2026 has five weeks', () => equal([monthGrid(2026, 9, 1).length, monthGrid(2026, 9, 1).at(-1)], [5, [26, 27, 28, 29, 30, 31, null]]));
test('weeks starting on Sunday', () => equal(monthGrid(2026, 9, 0)[0], [null, null, null, null, 1, 2, 3]));
test('weekdays from Monday', () => equal(weekdays(1), [1, 2, 3, 4, 5, 6, 0]));
test('months across the year', () => equal([shiftMonth(2026, 11, 1), shiftMonth(2026, 0, -1)], [{year: 2027, month: 0}, {year: 2025, month: 11}]));
test('a month range', () => equal(monthRange(2026, 9).end.getMonth(), 10));

test('ago', () => equal([agoText(10), agoText(120), agoText(7200), agoText(90000), agoText(3 * 86400)],
    ['now', '2 min ago', '2 h ago', 'yesterday', '3 days ago']));
const at = (h, m = 0, day = 14) => new Date(2026, 9, day, h, m);
test('event time', () => equal([eventTimeText(at(14, 45), at(16, 15)), eventTimeText(at(0), at(0, 0, 15))], ['14:45–16:15', 'All day']));
test('event soon', () => equal(
    [eventSoonText(at(14, 45), at(16), at(14, 32)), eventSoonText(at(14), at(16), at(14, 32)), eventSoonText(at(20), at(21), at(14, 32))],
    ['in 13 min', 'now', '']));
test('world clock offsets', () => equal([offsetText(-6 * 3600), offsetText(5.5 * 3600), offsetText(0)], ['−6 h', '+5 h 30 min', 'same time']));
test('temperature', () => equal(temperatureText(11.6), '12°'));
test('weather icons', () => equal([weatherIcon(0), weatherIcon(0, false), weatherIcon(63), weatherIcon(95)], ['sunny', 'moon-stars', 'rainy', 'thunderstorm']));

test('notifications by app and conversation', () => {
    const groups = groupNotifications([
        {id: 1, app: 'Chat', title: 'Study group', time: 10},
        {id: 2, app: 'Files', title: 'Copy done', time: 30},
        {id: 3, app: 'Chat', title: 'Study group', time: 40},
        {id: 4, app: 'Chat', title: 'Anna', time: 20},
    ]);
    equal(groups.map(group => group.items.map(item => item.id)), [[3, 1], [2], [4]]);
});
test('the same second: the later one first', () => equal(
    groupNotifications([{id: 1, app: 'A', title: 't', time: 5}, {id: 2, app: 'A', title: 't', time: 5}])[0].items.map(item => item.id), [2, 1]));
test('swipe', () => equal([swipeDismisses(150, 400, 0), swipeDismisses(60, 400, 0), swipeDismisses(60, 400, 1.2), swipeDismisses(60, 400, -1.2)],
    [true, false, true, false]));

test('today from Open-Meteo', () => equal(
    parseToday({current: {temperature_2m: 12.3, weather_code: 2, is_day: 1}, daily: {temperature_2m_max: [15.1], temperature_2m_min: [7]}}),
    {temperature: 12.3, code: 2, isDay: true, max: 15.1, min: 7}));
test('a broken answer is none', () => equal(parseToday({current: {}}), null));
test('Ledge places', () => equal([parsePlace('{"name":"Vienna","latitude":48.2,"longitude":16.4}')?.name, parsePlace('')], ['Vienna', null]));

done('center');
