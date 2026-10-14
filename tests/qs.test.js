import {
    backgroundAppsText, batteryNote, bluetoothNote, clockAt, darkNote, deviceBatteryNote, hoursText, isDarkAt,
    lastsText, minutesToSwitch, moveTile, nightLightNote, orderTiles, wifiDetails,
} from '../extension/lib/qs/words.js';
import {test, equal, done} from './harness.js';

test('battery note while running down', () => equal(batteryNote({charging: false, full: false, secondsLeft: 19200}), '5 h 20 min left'));
test('battery note while charging', () => equal(batteryNote({charging: true, full: false, secondsLeft: 3600}), 'Full in 1 h'));
test('battery note when full', () => equal(batteryNote({charging: true, full: true, secondsLeft: 0}), 'Fully charged'));
test('battery note without an estimate', () => equal(
    [batteryNote({charging: true, full: false, secondsLeft: 0}), batteryNote({charging: false, full: false, secondsLeft: 0})],
    ['Charging', '']));

const evening = new Date(2026, 9, 14, 14, 30);
test('clock time 24 h', () => equal(clockAt(evening, 5 * 3600 + 20 * 60), '19:50'));
test('clock time 12 h', () => equal(clockAt(evening, 5 * 3600 + 20 * 60, true), '7:50 PM'));
test('lasts until', () => equal(lastsText({charging: false, full: false, secondsLeft: 19200}, evening), 'Lasts until about 19:50'));
test('full at', () => equal(lastsText({charging: true, full: false, secondsLeft: 3600}, evening), 'Full at about 15:30'));

test('bluetooth notes', () => equal(
    [bluetoothNote(false, []), bluetoothNote(true, []), bluetoothNote(true, ['Headphones']), bluetoothNote(true, ['A', 'B'])],
    ['Off', 'On', 'Headphones', '2 devices']));

test('hours as a clock time', () => equal([hoursText(7), hoursText(6.5), hoursText(23.999)], ['07:00', '06:30', '00:00']));
test('night light notes', () => equal(
    [nightLightNote(false, false, 7), nightLightNote(true, false, 7), nightLightNote(true, true, 7)],
    ['Off', 'Until 07:00', 'Until sunrise']));
test('dark style notes', () => equal(
    [darkNote('light', false), darkNote('dark', true), darkNote('auto', true), darkNote('auto', false)],
    ['Off', 'On', 'Auto · on', 'Auto · off']));

test('wifi details', () => equal(
    [wifiDetails(5180, 480000), wifiDetails(2412, 72000), wifiDetails(5955, 0), wifiDetails(0, 0)],
    ['Connected · 5 GHz · 480 Mbit/s', 'Connected · 2.4 GHz · 72 Mbit/s', 'Connected · 6 GHz', 'Connected']));
test('device battery notes', () => equal([deviceBatteryNote(72), deviceBatteryNote(14)], ['battery', 'charge soon']));
test('background apps', () => equal([backgroundAppsText(1), backgroundAppsText(2)],
    ['1 app in the background', '2 apps in the background']));

test('auto dark across midnight', () => equal(
    [isDarkAt(18 * 60 + 59, '19:00', '07:00'), isDarkAt(19 * 60, '19:00', '07:00'), isDarkAt(3 * 60, '19:00', '07:00'),
        isDarkAt(7 * 60, '19:00', '07:00')],
    [false, true, true, false]));
test('auto dark within a day', () => equal(
    [isDarkAt(12 * 60, '10:00', '14:00'), isDarkAt(15 * 60, '10:00', '14:00')], [true, false]));
test('auto dark with equal times is never dark', () => equal(isDarkAt(600, '10:00', '10:00'), false));
test('minutes to the next switch', () => equal(
    [minutesToSwitch(18 * 60, '19:00', '07:00'), minutesToSwitch(19 * 60, '19:00', '07:00'),
        minutesToSwitch(23 * 60, '19:00', '07:00')],
    [60, 12 * 60, 8 * 60]));

const ids = ['wifi', 'bluetooth', 'power', 'ext:a'];
test('tile order: placed first, rest after', () => equal(orderTiles(ids, ['ext:a', 'gone']), ['ext:a', 'wifi', 'bluetooth', 'power']));
test('tile order leaves hidden out', () => equal(orderTiles(ids, [], ['power']), ['wifi', 'bluetooth', 'ext:a']));
test('moving a tile down', () => equal(moveTile(ids, [], 'wifi', 'power'), ['bluetooth', 'power', 'wifi', 'ext:a']));
test('moving a tile up', () => equal(moveTile(ids, [], 'ext:a', 'bluetooth'), ['wifi', 'ext:a', 'bluetooth', 'power']));
test('moving onto itself keeps the order', () => equal(moveTile(ids, [], 'wifi', 'wifi'), ids));

done('qs');
