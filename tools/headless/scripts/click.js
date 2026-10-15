// A click on a small island: with "opens the app" its window comes (here a
// stand-in that counts), with "opens it larger" the large look comes first
// and the next click opens the app; the middle button always opens it
// larger. Also shows the setting in Halo's settings page.
import Clutter from 'gi://Clutter';

export default async function ({extension, shot, sleep, note, click, moveTo}) {
    const island = extension._island;
    const shape = island._shape;
    const settings = extension._settings;
    let opened = 0;
    const media = {
        id: 'test-media', kind: 'media', view: 'mediaCompact', large: 'mediaLarge',
        data: {title: 'Lo-fi to study to', note: 'Lofi Girl', cover: null, playing: false, position: 0, length: 0,
            canPrevious: true, canNext: true},
        onOpen: () => opened++, onPlay: () => {}, onPrevious: () => {}, onNext: () => {},
    };
    const state = () => `opened=${opened} expanded=${island.expanded} ${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)}`;
    // On the title, away from the play button.
    const onTitle = async button => {
        const [x, y] = shape.get_transformed_position();
        moveTo(x + 130, y + 30);
        await sleep(100);
        await click(shape, button);
        moveTo(100, 600);
        await sleep(900);
    };

    await sleep(2500);
    note(`setting: ${settings.current.islandClick}`);
    island.set(media);
    await sleep(1000);
    await onTitle(Clutter.BUTTON_PRIMARY);
    note(`app, click: ${state()}`);
    await onTitle(Clutter.BUTTON_MIDDLE);
    note(`app, middle click: ${state()}`);
    await onTitle(Clutter.BUTTON_MIDDLE);
    note(`app, middle click again: ${state()}`);

    settings.set('islandClick', 'large');
    await sleep(500);
    await onTitle(Clutter.BUTTON_PRIMARY);
    note(`large, click: ${state()}`);
    await onTitle(Clutter.BUTTON_PRIMARY);
    note(`large, click again: ${state()}`);
    island.remove('test-media');

    // Claude, which has no large look: a click opens it either way.
    let claude = 0;
    island.set({id: 'test-claude', kind: 'claude', view: 'info',
        data: {icon: 'progress-activity', tone: 'soft', title: 'Claude is working', note: 'halo · working for 3 min'},
        onOpen: () => claude++});
    await sleep(900);
    await onTitle(Clutter.BUTTON_PRIMARY);
    note(`claude with large: opened=${claude}`);
    island.remove('test-claude');
    settings.set('islandClick', 'app');
    await sleep(600);

    extension._openQuickSettings('settings', 'island');
    await sleep(2200);
    await shot('click-setting');
    extension._qs.close();
}
