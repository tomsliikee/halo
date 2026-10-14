import {test, equal, done} from './harness.js';
import {SPRINGS, countBetween, numberIn, settleMs, springAt} from '../extension/lib/shared/spring.js';

const samples = spring => Array.from({length: 200}, (_, i) => springAt(i * 0.005, spring));

test('a spring starts at 0 and comes to rest at 1', () => {
    for (const spring of Object.values(SPRINGS)) {
        equal(springAt(0, spring), 0);
        equal(Math.abs(springAt(settleMs(spring) / 1000, spring) - 1) < 0.005, true);
    }
});

test('spatial springs pass their target, effect springs never do', () => {
    equal(Math.max(...samples(SPRINGS.spatial)) > 1.005, true);
    equal(Math.max(...samples(SPRINGS.fast)) > 1.05, true);
    equal(Math.max(...samples(SPRINGS.effect)) <= 1, true);
    equal(Math.max(...samples(SPRINGS.effectSlow)) <= 1, true);
});

test('a spring swings past by less than a fifth', () => {
    equal(Math.max(...samples(SPRINGS.fast)) < 1.2, true);
    equal(Math.max(...samples(SPRINGS.spatial)) < 1.05, true);
    const bouncy = Math.max(...samples(SPRINGS.bouncy));
    equal(bouncy > 1.1 && bouncy < 1.15, true);
});

test('every spring is at rest within a second', () => {
    for (const spring of Object.values(SPRINGS))
        equal(settleMs(spring) > 100 && settleMs(spring) < 1000, true);
});

test('the number in a text is found with what surrounds it', () => {
    equal(numberIn('42 %'), {before: '', value: 42, decimals: 0, mark: '.', after: ' %'});
    equal(numberIn('−3°').value, 3);
    equal(numberIn('-3°').value, -3);
    equal(numberIn('12.5 GB').decimals, 1);
    equal(numberIn('12,5 GB').mark, ',');
    equal(numberIn('Muted'), null);
});

test('a number counts between two readings of the same kind', () => {
    equal(countBetween('10 %', '50 %', 0.5), '30 %');
    equal(countBetween('1.0 GB', '2.0 GB', 0.25), '1.3 GB');
    equal(countBetween('10 %', '50 %', 1), '50 %');
});

test('a reading of another kind is counted up from nothing', () => {
    equal(countBetween('', '80 %', 0.5), '40 %');
    equal(countBetween('40 °C', '80 %', 0.5), '40 %');
    equal(countBetween('40 %', 'Muted', 0.5), 'Muted');
});

test('a rate counts within its unit and from nothing into another', () => {
    equal(countBetween('1.0 MB/s', '3.0 MB/s', 0.5), '2.0 MB/s');
    equal(countBetween('980 KB/s', '1.2 MB/s', 0.5), '0.6 MB/s');
});

test('a time is not taken for a number to count', () => {
    equal(countBetween('12:30', '12:31', 0.5), '12:31');
});

done('spring');
