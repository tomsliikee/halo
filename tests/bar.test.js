import {cornerRadius, frameRect, groupPositions, strutHeight} from '../extension/lib/bar/layout.js';
import {batteryIcon, batteryLow, durationText, elapsedText, layoutText, networkIcon, percentText, untilText, volumeIcon}
    from '../extension/lib/bar/words.js';
import {test, equal, done} from './harness.js';

test('full floating frame keeps 8px', () => equal(frameRect(1280, 'full', true),
    {x: 8, y: 8, width: 1264, height: 44, corners: 'all'}));
test('full on the edge has no round corners', () => equal(frameRect(1280, 'full', false),
    {x: 0, y: 0, width: 1280, height: 44, corners: 'none'}));
test('compact frames take half the width', () => equal(
    ['left', 'centre', 'right'].map(layout => frameRect(1280, layout, true)).map(r => [r.x, r.width]),
    [[8, 632], [324, 632], [640, 632]]));
test('compact on the edge rounds the corners away from it', () => equal(
    ['left', 'centre', 'right'].map(layout => frameRect(1280, layout, false).corners), ['bottom-right', 'bottom', 'bottom-left']));
test('islands have no frame', () => equal(frameRect(1280, 'islands', true), null));
test('struts', () => equal([strutHeight(true), strutHeight(false)], [60, 44]));
test('groups at start, middle and end of the frame', () => equal(
    groupPositions(1280, frameRect(1280, 'full', true), {left: 100, centre: 200, right: 120}, true),
    {left: 12, centre: 540, right: 1148}));
test('islands stand at the screen edges', () => equal(
    groupPositions(1280, null, {left: 100, centre: 200, right: 120}, true), {left: 8, centre: 540, right: 1152}));
test('a wide left group pushes the centre aside', () => equal(
    groupPositions(640, frameRect(640, 'full', true), {left: 260, centre: 160, right: 100}, true).centre, 280));
test('corner radius', () => equal(['all', 'none', 'bottom', 'bottom-left'].map(c => cornerRadius(c, 22)),
    ['22px', '0', '0 0 22px 22px', '0 0 0 22px']));

test('wifi strength', () => equal(
    ['excellent', 'good', 'ok', 'weak', 'none'].map(l => networkIcon(`network-wireless-signal-${l}-symbolic`)),
    ['wifi', 'network-wifi-3-bar', 'network-wifi-2-bar', 'network-wifi-1-bar', 'signal-wifi-0-bar']));
test('other networks', () => equal(
    ['network-wired-symbolic', 'network-vpn-symbolic', 'network-wireless-disabled-symbolic', '', null].map(networkIcon),
    ['lan', 'vpn-key', 'wifi-off', null, null]));
test('volume', () => equal(['audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic',
    'audio-volume-high-symbolic', 'audio-volume-overamplified-symbolic'].map(volumeIcon),
['volume-off', 'volume-mute', 'volume-down', 'volume-up', 'volume-up']));
test('battery steps', () => equal([5, 12, 50, 86, 98].map(p => batteryIcon(p, false)),
    ['battery-android-alert', 'battery-android-0', 'battery-android-3', 'battery-android-6', 'battery-android-full']));
test('charging battery', () => equal(batteryIcon(40, true), 'battery-android-bolt'));
test('low battery only while discharging', () => equal([batteryLow(12, false), batteryLow(12, true), batteryLow(20, false)],
    [true, false, false]));
test('units with a space', () => equal([percentText(86), percentText(85.6)], ['86 %', '86 %']));
test('durations', () => equal([durationText(20), durationText(600), durationText(3600), durationText(19200)],
    ['under a minute', '10 min', '1 h', '5 h 20 min']));
test('until', () => equal([untilText(30), untilText(600)], ['now', 'in 10 min']));
test('layout', () => equal([layoutText('de'), layoutText(undefined)], ['DE', '']));
test('elapsed', () => equal([elapsedText(134), elapsedText(3734), elapsedText(-1)], ['02:14', '1:02:14', '00:00']));
done('bar');
