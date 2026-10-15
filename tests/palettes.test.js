import {COLOURS, islandScheme, palette, palettes, mix, rgba} from '../extension/lib/shared/palettes.js';
import {test, equal, done} from './harness.js';

test('eight colours in the order of the swatch row', () => equal(COLOURS,
    ['blue', 'violet', 'green', 'teal', 'orange', 'salmon', 'pink', 'white']));
test('every colour in two schemes with the same roles', () => {
    const roles = Object.keys(palettes.blue.light).sort().join();
    equal(COLOURS.every(c => ['light', 'dark'].every(s => Object.keys(palettes[c][s]).sort().join() === roles)), true);
});
test('blue is the design system palette', () => equal(
    [palettes.blue.light.primary, palettes.blue.dark.primary, palettes.blue.light.surf], ['#0045fc', '#b9c3ff', '#edecfb']));
test('white is monochrome', () => equal([palettes.white.light.primary, palettes.white.dark.primary], ['#000000', '#ffffff']));
test('mix ends', () => equal([mix('#000000', '#ffffff', 0), mix('#000000', '#ffffff', 1), mix('#000000', '#ffffff', 0.5)],
    ['#000000', '#ffffff', '#808080']));
test('rgba', () => equal(rgba('#0045fc', 0.5), 'rgba(0,69,252,0.5)'));
test('the island is the opposite of the desktop', () => equal(
    [islandScheme('dark'), islandScheme('light')], ['light', 'dark']));
test('the island is white on a dark desktop and near black on a light one', () => equal(
    [palette('blue', islandScheme('dark')).islandFill, palette('blue', islandScheme('light')).islandFill], ['#ffffff', '#0e0f14']));
done('palettes');
