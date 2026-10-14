// The quick settings: the first page and every page behind it, light and
// dark, a tile switched, a tile dragged into another place, and Escape.
export default async function ({extension, shot, sleep, note, set, click, desktop, Main}) {
    await sleep(1500);
    const bar = extension._bars.primary;
    const qs = () => extension._qs;
    await click(bar.statusPill);
    await sleep(160);
    await shot('qs-opening');
    await sleep(900);
    await shot('qs-main');
    note(`open=${qs().isOpen} tiles=${extension._tiles.shown.map(tile => `${tile.id}:${tile.visible}`).join(',')}`);

    const main = qs()._main;
    // A player, as GNOME's media source would hand it over.
    const {EventEmitter} = await import('resource:///org/gnome/shell/misc/signals.js');
    const player = Object.assign(new EventEmitter(), {
        trackTitle: 'Lo-fi to study to', trackArtists: ['Playlist'], status: 'Playing', trackCoverUrl: '',
        canGoNext: true, canGoPrevious: true, app: null,
        playPause() {
            this.status = this.status === 'Playing' ? 'Paused' : 'Playing';
            this.emit('changed');
        },
        next() {}, previous() {}, raise() {},
    });
    const source = Object.assign(new EventEmitter(), {players: [player]});
    main._mediaSource = source;
    main._updateMedia();
    await sleep(600);
    await shot('qs-media');
    await click(main._play);
    await sleep(500);
    await shot('qs-media-paused');
    const tileView = id => main._tileViews.find(view => view.tile.id === id);
    const dnd = tileView('dnd');
    if (dnd) {
        await click(dnd.actor);
        await sleep(500);
        await shot('qs-dnd-on');
        await click(dnd.actor);
        await sleep(300);
    }

    for (const [page, tileId] of [['wifi', 'wifi'], ['bluetooth', 'bluetooth'], ['energy', 'power'], ['appearance', 'colourStyle'],
        ['sound', null], ['power', null], ['settings', null]]) {
        const tile = tileId ? extension._tiles.all.find(t => t.id === tileId) : null;
        qs().navigate(page, tile);
        await sleep(120);
        await shot(`qs-${page}-sliding`);
        await sleep(800);
        await shot(`qs-${page}`);
        qs().back();
        await sleep(600);
    }

    // The settings page, scrolled to the tiles, and one dragged.
    qs().navigate('settings');
    await sleep(900);
    const page = qs()._stack.at(-1);
    const list = page._tileList;
    const adjustment = page.actor.vadjustment;
    const [, y] = list.get_transformed_position();
    adjustment.value = Math.max(0, y - 200);
    await sleep(400);
    await shot('qs-settings-tiles');
    const first = list.get_first_child();
    note(`before=${list.get_children().map(row => row._haloTile).join(',')}`);
    page._makeWay(first);
    first.translation_y = first.height * 2 + 10;
    page._makeWay(first);
    await sleep(300);
    await shot('qs-settings-dragging');
    page._drop(first);
    await sleep(400);
    note(`after=${page._tileList.get_children().map(row => row._haloTile).join(',')} order=${extension._settings.current.tileOrder.join(',')}`);
    qs().back();
    await sleep(600);
    await shot('qs-main-reordered');

    // Escape closes.
    qs().close();
    await sleep(500);
    note(`closed open=${qs().isOpen}`);

    desktop.set_string('color-scheme', 'prefer-dark');
    for (const colour of ['blue', 'teal', 'salmon']) {
        set('colour', colour);
        await click(bar.statusPill);
        await sleep(1000);
        await shot(`qs-dark-${colour}`);
        qs().close();
        await sleep(400);
    }
    set('colour', 'blue');
    await click(bar.statusPill);
    await sleep(900);
    for (const [name, tileId] of [['wifi', 'wifi'], ['bluetooth', 'bluetooth'], ['energy', 'power'], ['appearance', null]]) {
        qs().navigate(name, tileId ? extension._tiles.all.find(t => t.id === tileId) : null);
        await sleep(900);
        await shot(`qs-dark-${name}`);
        qs().back();
        await sleep(500);
    }
    qs().close();
    await sleep(500);
    // Dark style from the tile: the scheme follows, the setting too.
    desktop.set_string('color-scheme', 'default');
    await sleep(300);
    note(`darkStyle=${extension._settings.current.darkStyle}`);
    extension._appearance.setStyle('dark');
    await sleep(300);
    note(`after dark: scheme=${desktop.get_string('color-scheme')} darkStyle=${extension._settings.current.darkStyle}`);
    extension._appearance.setStyle('light');
    await sleep(300);
    Main.panel.toggleQuickSettings();
    await sleep(800);
    note(`shortcut opens halo: ${qs().isOpen}`);
    Main.panel.closeQuickSettings();
    await sleep(400);
    note(`gnome close closes halo: ${!qs().isOpen}`);

    // Auto: dark from an hour ago until an hour from now.
    const now = new Date();
    const at = hours => `${String((now.getHours() + hours + 24) % 24).padStart(2, '0')}:00`;
    set('darkFrom', at(-1));
    set('darkTo', at(1));
    extension._appearance.setStyle('auto');
    await sleep(400);
    note(`auto ${at(-1)}–${at(1)}: scheme=${desktop.get_string('color-scheme')}`);
    set('darkFrom', at(2));
    set('darkTo', at(3));
    await sleep(400);
    note(`auto ${at(2)}–${at(3)}: scheme=${desktop.get_string('color-scheme')}`);
    extension._appearance.setStyle('light');
    await sleep(300);

    // Other extensions' buttons became tiles; one opens its menu as a page.
    await click(bar.statusPill);
    await sleep(900);
    await shot('qs-foreign');
    const foreign = extension._tiles.shown.filter(tile => tile.id.startsWith('panel:') || tile.id.startsWith('ext:'));
    note(`foreign=${foreign.map(tile => `${tile.id}|${tile.title}|${tile.note}|${tile.page}`).join(' ; ')}`);
    for (const tile of foreign.filter(t => t.page === 'hosted').slice(0, 3)) {
        qs().navigate('hosted', tile);
        await sleep(900);
        await shot(`qs-hosted-${tile.id.replace(/[^a-z0-9]/gi, '-')}`);
        qs().back();
        await sleep(600);
    }
    qs().close();
    await sleep(400);
}
