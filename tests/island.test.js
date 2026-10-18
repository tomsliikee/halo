import {crossed, readLimits} from '../extension/lib/island/limits.js';
import {accumulate, pick, placement, scrollIntent, shownWhileLocked} from '../extension/lib/island/rank.js';
import {
    claudeNote, claudePeek, clockText, copiedText, initials, isDecline, levelShare, limitNote, limitTitle, lockedNote, lowMark, osdIcon,
    mediaPeek, osdKind, plainText, soonText, timerPeek, trackTime, unitAppId,
    driveText, glanceItems, sizeText, statsItems, uptimeText, lockTitle, workspaceNote, workspaceTitle,
    healthText, phoneBatteryText, rainText, updatesText,
} from '../extension/lib/island/words.js';
import {hottest, memoryLeft, newProblems, problems} from '../extension/lib/island/health.js';
import {newlyLow} from '../extension/lib/island/sources/phone.js';
import * as Pomodoro from '../extension/lib/shared/pomodoro.js';
import * as Timer from '../extension/lib/shared/timer.js';
import {MINUTE, isPaused, parseTimers, pausedNote, runningTimer, stretchTimer} from '../extension/lib/shared/timers.js';
import {test, equal, done} from './harness.js';

const ids = ({main, bubble}) => [main?.id ?? null, bubble?.id ?? null];
const media = {id: 'media', kind: 'media', at: 1};
const timer = {id: 'timer', kind: 'timer', at: 2};
const recording = {id: 'rec', kind: 'recording', at: 3};
const call = {id: 'call', kind: 'call', at: 0};
const volume = {id: 'volume', kind: 'volume', hint: true, at: 10};
const note = {id: 'note', kind: 'notification', hint: true, at: 11};

const locked = list => shownWhileLocked(list, true).map(activity => activity.id);
test('unlocked, everything shows', () => equal(shownWhileLocked([note, call, media], false).length, 3));
test('locked, what someone says stays out', () => equal(locked([note, call, media, volume]), ['media', 'volume']));
test('locked, a version made for the lock screen shows', () => equal(
    locked([{...note, id: 'safe', lockSafe: true}, {id: 'claude', kind: 'claude', at: 4}]), ['safe']));
test('lock screen note counts', () => equal([lockedNote(1), lockedNote(3)], ['New notification', '3 new notifications']));
test('lock screen note with details allowed', () => equal(lockedNote(2, 'Meeting moved'), 'Meeting moved'));
test('nothing going on', () => equal(ids(pick([])), [null, null]));
test('one lasting thing', () => equal(ids(pick([media])), ['media', null]));
test('the higher rank wins, the next waits beside it', () => equal(ids(pick([media, timer, recording])), ['rec', 'timer']));
test('a hint shows over what lasts', () => equal(ids(pick([media, volume])), ['volume', 'media']));
test('the newest hint wins', () => equal(ids(pick([volume, note])), ['note', null]));
test('a call wins over hints', () => equal(ids(pick([media, call, note])), ['call', 'media']));
test('a dismissed thing steps aside into the bubble', () => equal(ids(pick([media, timer], new Set(['timer']))), ['media', 'timer']));
test('what is not dismissed goes before what is', () => equal(
    ids(pick([media, timer, recording], new Set(['rec']))), ['timer', 'media']));
test('a dismissed thing waits beside the clock', () => equal(
    [...ids(pick([media], new Set(['media']))), pick([media], new Set(['media'])).hidden?.id], [null, 'media', 'media']));
test('a dismissed hint is never kept', () => equal(pick([volume], new Set(['volume'])).hidden, null));
test('a clicked bubble comes first', () => equal(ids(pick([media, timer], new Set(), 'media')), ['media', 'timer']));
test('the newer of the same rank', () => equal(
    ids(pick([{id: 'a', kind: 'privacy', at: 1}, {id: 'b', kind: 'recording', at: 5}])), ['b', 'a']));

test('the app a Claude session runs in', () => equal(
    ['app-gnome-org.gnome.Ptyxis-4242.scope', 'app-com.anthropic.Claude-33622.scope', 'app-flatpak-com.mitchellh.ghostty-77.scope',
        'app-org.gnome.Terminal@abc.service', 'session-2.scope', null].map(unitAppId),
    ['org.gnome.Ptyxis.desktop', 'com.anthropic.Claude.desktop', 'com.mitchellh.ghostty.desktop', 'org.gnome.Terminal.desktop', null, null]));
test('osd kinds', () => equal(
    ['audio-volume-high-symbolic', 'display-brightness-symbolic', 'keyboard-brightness-symbolic',
        'microphone-sensitivity-muted-symbolic', 'input-touchpad-symbolic'].map(osdKind),
    ['volume', 'brightness', 'keyboardLight', 'microphone', 'other']));
test('osd icons', () => equal(
    [osdIcon('volume', 0.8, false), osdIcon('volume', 0.2, false), osdIcon('volume', 0, false), osdIcon('volume', 0.5, true)],
    ['volume-up', 'volume-down', 'volume-mute', 'no-sound']));
test('level share past 100 %', () => equal([levelShare(0.72, 1), levelShare(1.5, 1.5), levelShare(2, 1)], [0.72, 1, 1]));

test('countdown rounds up', () => equal([clockText(983000, {countdown: true}), clockText(500, {countdown: true})], ['16:23', '00:01']));
test('clock text past an hour', () => equal(clockText(3723000), '1:02:03'));

test('battery passes 20 % on the way down', () => equal(
    lowMark({percent: 21, charging: false}, {percent: 20, charging: false}), 20));
test('battery passes 10 %', () => equal(lowMark({percent: 12, charging: false}, {percent: 9, charging: false}), 10));
test('a charging battery says nothing', () => equal(lowMark({percent: 21, charging: false}, {percent: 19, charging: true}), null));
test('no mark passed', () => equal(lowMark({percent: 50, charging: false}, {percent: 49, charging: false}), null));

test('claude notes', () => equal(
    [claudeNote({project: 'halo', state: 'working', since: 0}, 180000), claudeNote({project: 'halo', state: 'waiting'}, 0)],
    ['halo · working for 3 min', 'halo · waiting for you']));

const limitsAt = (session, week) => JSON.stringify({at: 5, limits: {session: {percent: session, resetsAt: 7200000}, week: {percent: week}}});
test('a limit crossing 80 %', () => equal(
    crossed(readLimits(limitsAt(70, 10), null, 0), readLimits(limitsAt(81, 10), null, 0)).map(c => [c.window, c.mark]),
    [['session', 80]]));
test('a limit crossing 95 % in the week', () => equal(
    crossed(readLimits(limitsAt(10, 90), null, 0), readLimits(limitsAt(10, 96), null, 0)).map(c => [c.window, c.mark]),
    [['week', 95]]));
test('the first reading says nothing', () => equal(crossed(null, readLimits(limitsAt(99, 99), null, 0)), []));
test('limit words', () => equal(
    [limitTitle({window: 'session', mark: 80}), limitNote({resetsAt: 7200000}, 0)],
    ['Claude session at 80 %', 'Resets in 2 h']));
test('statusline record', () => equal(
    readLimits(null, JSON.stringify({at: 9, rate_limits: {five_hour: {used_percentage: 42, resets_at: 10}}}), 0).session,
    {percent: 42, resetsAt: 10000}));

test('soon', () => equal([soonText(600), soonText(30)], ['Starts in 10 min', 'Starts now']));
test('initials', () => equal([initials('Lern Gruppe'), initials('Anna'), initials('')], ['LG', 'AN', '?']));
test('plain text from markup', () => equal(plainText('<b>Erst</b> um 16:00 &amp; dann'), 'Erst um 16:00 & dann'));
test('copied text', () => equal([copiedText('\n  hello world\nmore'), copiedText('x'.repeat(50), 10)], ['hello world', `${'x'.repeat(9)}…`]));
test('decline actions', () => equal(['Decline', 'Answer', 'Ablehnen', 'Hang up'].map(isDecline), [true, false, true, true]));
test('track time', () => equal([trackTime(72e6), trackTime(189e6)], ['1:12', '3:09']));

test('timer counts down', () => {
    const state = Timer.start(Timer.create('timer', 60000), 0);
    equal([Timer.shown(state, 20000), Timer.isFinished(state, 60000)], [40000, true]);
});
test('pomodoro moves on', () => {
    const config = {work: 1000, rest: 500, long: 800, rounds: 2};
    const state = Pomodoro.start(Pomodoro.create(config), 0);
    const settled = Pomodoro.settle(state, 1600, config);
    equal([settled.state.phase, settled.state.round, settled.ended], ['work', 2, 2]);
});

test('timers file: broken parts are dropped', () => equal(
    parseTimers(JSON.stringify({timer: {mode: 'timer', duration: 60000, elapsed: 0, startedAt: 5}, stopwatch: {mode: 'x'}})),
    {timer: {mode: 'timer', duration: 60000, elapsed: 0, startedAt: 5}, stopwatch: null, pomodoro: null}));
test('timers file: nothing readable', () => equal(parseTimers('{'), {timer: null, stopwatch: null, pomodoro: null}));
test('the running pomodoro comes first', () => {
    const config = {work: 60000, rest: 1000, long: 2000, rounds: 4};
    const timers = {
        timer: Timer.start(Timer.create('timer', 60000), 0),
        stopwatch: null,
        pomodoro: {state: Pomodoro.start(Pomodoro.create(config), 0), config},
    };
    const running = runningTimer(timers, 30000);
    equal([running.kind, running.phase, running.shown, running.endsAt], ['pomodoro', 'work', 30000, 60000]);
});
test('a paused timer is not running', () => equal(
    runningTimer({timer: Timer.create('timer', 1000), stopwatch: null, pomodoro: null}, 0), null));

test('a paused timer is paused', () => {
    const paused = Timer.pause(Timer.start(Timer.create('timer', 60000), 0), 10000);
    const timers = {timer: paused, stopwatch: null, pomodoro: null};
    equal([isPaused(timers, 'timer'), pausedNote(timers), pausedNote({timer: null, stopwatch: null, pomodoro: null})], [true, 'Paused', 'Off']);
});

test('a wheel up is a step up, down a step down', () => equal(
    [scrollIntent(0, -1), scrollIntent(0, 1)], [{axis: 'y', amount: 1}, {axis: 'y', amount: -1}]));
test('sideways, or the wheel with Shift, swaps', () => equal(
    [scrollIntent(-0.4, 0.1).axis, scrollIntent(0, 1, true)], ['x', {axis: 'x', amount: 1}]));
test('touchpad fractions add up to whole steps', () => {
    let state = {sum: 0, steps: 0};
    const steps = [];
    for (const amount of [0.4, 0.4, 0.4, -0.3, 1.5]) {
        state = accumulate(state.sum, amount);
        steps.push(state.steps);
    }
    equal(steps, [0, 0, 1, 0, 1]);
});
test('a scroll gives a countdown a minute more or less, never under a minute left', () => {
    const running = Timer.start(Timer.create('timer', 10 * MINUTE), 0);
    const now = 9.5 * MINUTE;
    equal([
        stretchTimer(running, 1, now).duration,
        stretchTimer(running, -1, now).duration,
        stretchTimer(Timer.create('timer', 5 * MINUTE), -2, 0).duration,
        stretchTimer(Timer.create('stopwatch'), 1, 0).duration,
    ], [11 * MINUTE, 10 * MINUTE, 3 * MINUTE, 0]);
});
test('the hover preview says a little more', () => equal([
    mediaPeek({app: 'Spotify', position: 73e6, length: 189e6}),
    mediaPeek({app: '', position: 0, length: 0}),
    timerPeek(new Date(2026, 9, 15, 13, 5).getTime()),
    timerPeek(new Date(2026, 9, 15, 13, 5).getTime(), true),
    claudePeek([{project: 'halo'}, {project: 'ledge'}, {project: 'halo'}]),
], ['Spotify · 1:13 of 3:09 · scroll for volume', 'scroll for volume',
    'Ends at 13:05 · scroll for a minute more or less', 'Ends at 1:05 PM · scroll for a minute more or less', 'halo, ledge']));
const playing = {id: 'media', kind: 'media', at: 1000};
test('the resting island stays in the bar', () => equal(placement({main: null}), {drop: false, docked: false}));
test('a hint drops below the bar', () => equal(
    placement({main: {id: 'osd', kind: 'volume', hint: true, at: 0}, now: 9000, introMs: 2500}), {drop: true, docked: false}));
test('music drops first, then rises into the clock', () => equal(
    [placement({main: playing, now: 2000, introMs: 2500}), placement({main: playing, now: 3500, introMs: 2500})],
    [{drop: true, docked: false}, {drop: false, docked: true}]));
test('without docking music stays below', () => equal(
    placement({main: playing, dock: false, now: 9000, introMs: 2500}), {drop: true, docked: false}));
test('an opened look drops even when docked', () => equal(
    placement({main: {...playing, large: 'mediaLarge'}, expanded: 'media', now: 9000, introMs: 2500}), {drop: true, docked: false}));
test('a call never docks', () => equal(
    placement({main: {id: 'c', kind: 'call', at: 0}, now: 9000, introMs: 2500}), {drop: true, docked: false}));

test('a workspace by its name, else its number', () => equal(
    [workspaceTitle(0, ['Mail']), workspaceTitle(1, ['Mail']), workspaceTitle(2, ['', '', '  '])], ['Mail', 'Workspace 2', 'Workspace 3']));
test('how full a workspace is', () => equal([0, 1, 4].map(workspaceNote), ['Empty', '1 window', '4 windows']));
test('locks', () => equal([lockTitle('caps', true), lockTitle('num', false)], ['Caps Lock on', 'Num Lock off']));
test('drives', () => equal([driveText('USB', true), driveText('', false)],
    [{title: 'USB', note: 'Connected · click to open'}, {title: 'Drive', note: 'Removed'}]));
test('the glance: weather, then the next event', () => equal(
    glanceItems({temperature: 12.4, code: 0, isDay: true}, {summary: 'Standup', text: 'in 20 min'}, () => 'sunny', t => `${Math.round(t)} °C`),
    [{icon: 'sunny', text: '12 °C'}, {icon: 'event', text: 'Standup in 20 min'}]));
test('the glance without weather or events is empty', () => equal(glanceItems(null, null, () => '', () => ''), []));
test('the stats: battery, memory, heat, disk, uptime', () => equal(
    statsItems({battery: {percent: 82.4, charging: false}, memoryUsed: 0.412, temperature: 52.6, diskFree: 120.4e9, uptime: 3 * 3600 + 5 * 60},
        (p, c) => `bat-${p}-${c}`).map(item => `${item.icon}:${item.text}`),
    ['bat-82.4-false:82 %', 'speed:RAM 41 %', 'computer:53 °C', 'folder:120 GB free', 'schedule:up 3 h 5 min']));
test('the stats leave out what is unknown', () => equal(statsItems({uptime: 59}, () => '').map(item => item.text), ['up 0 min']));
test('sizes and uptimes in words', () => equal(
    [sizeText(4.25e9), sizeText(1.5e12), uptimeText(2 * 86400 + 4 * 3600 + 30), uptimeText(12 * 60)],
    ['4.3 GB', '1.5 TB', '2 d 4 h', '12 min']));

test('the hottest sensor, odd readings left out', () => equal(hottest(['45000\n', '91500', 'x', '-1', '999000']), 91.5));
test('no sensors', () => equal(hottest([]), null));
test('memory left', () => equal(memoryLeft('MemTotal:       1000 kB\nMemFree: 10 kB\nMemAvailable:    40 kB\n'), 0.04));
test('a problem starts at its line and ends well below it', () => {
    const hot = problems({temperature: 90, memory: 0.5, disk: 0.5});
    const still = problems({temperature: 85, memory: 0.5, disk: 0.5}, hot);
    const over = problems({temperature: 79, memory: 0.5, disk: 0.5}, still);
    equal([hot.hot, still.hot, over.hot], [true, true, false]);
});
test('memory and disk nearly full', () => equal(problems({temperature: null, memory: 0.04, disk: 0.08}, {disk: true}),
    {hot: false, memory: true, disk: true}));
test('only new problems are told', () => equal(newProblems({hot: true, memory: true, disk: false}, {hot: true}), ['memory']));
test('health words', () => equal([healthText('hot', {temperature: 92.4}), healthText('disk', {disk: 0.031})],
    [{title: 'Running hot', note: '92 °C'}, {title: 'Disk nearly full', note: '3 % left'}]));
test('updates', () => equal([updatesText(1).title, updatesText(7).title], ['1 update', '7 updates']));
test('rain words', () => equal([rainText({rainIn: 20, warning: null}).title, rainText({rainIn: 0, warning: null}).title,
    rainText({rainIn: 15, warning: 'Thunderstorm'})], ['Rain in 20 min', 'Rain now', {title: 'Thunderstorm', note: 'Rain in 15 min'}]));
test('phone battery: low once, not while charging', () => equal(
    [newlyLow(18, false, false), newlyLow(15, false, true), newlyLow(10, true, false), newlyLow(0, false, false)],
    [{low: true, tell: true}, {low: true, tell: false}, {low: false, tell: false}, {low: false, tell: false}]));
test('phone battery words', () => equal(phoneBatteryText('', 14.6), {title: 'Phone battery low', note: '15 %'}));
test('a ringing alarm comes before a hint', () => equal(
    ids(pick([{id: 'alarm', kind: 'alarm', at: 0}, volume, media])), ['alarm', 'media']));

done('island');
