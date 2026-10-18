// "Only the island": with no window below it, the resting clock (and what
// is docked in it) grows wider; a window below it shrinks it back. Both
// sizes, a window moved in and out, the bar pushed down, music docked,
// and the row on the settings page.
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

export default async function ({extension, shot, sleep, note, set, launch, moveTo, Main}) {
    const {EventEmitter} = await import('resource:///org/gnome/shell/misc/signals.js');
    const island = extension._island;
    const shape = island._shape;
    const where = () => `${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)} free=${island._free} pad=${JSON.stringify(island._freePad())} view=${island._viewKey}`;
    await sleep(3000);
    set('barMode', 'island');
    set('islandFreeGrow', 0);
    await sleep(1200);
    note(`off: ${where()}`);
    await shot('free-off');

    for (const percent of [25, 50]) {
        set('islandFreeGrow', percent);
        await sleep(1200);
        note(`${percent} % free: ${where()}`);
        await shot(`free-${percent}`);
    }

    // Hover while free: it stays grown, the glance shows the stats line
    // (real readings; no weather or events in the headless shell).
    const [hx, hy] = shape.get_transformed_position();
    moveTo(hx + shape.width / 2, hy + shape.height / 2);
    island._peekChanged();
    await sleep(1200);
    note(`hover free: ${where()} glance=${JSON.stringify(island._glance())}`);
    await shot('free-hover-stats');
    moveTo(640, 600);
    await sleep(1200);
    note(`hover gone: ${where()}`);

    // A window below the island, then moved away again.
    await launch('org.gnome.Calculator.desktop', 3000);
    let window = null;
    for (let i = 0; i < 30 && !(window?.get_frame_rect().width > 0); i++) {
        window = global.get_window_actors().map(a => a.meta_window).find(w => w.get_window_type() === Meta.WindowType.NORMAL) ?? null;
        await sleep(200);
    }
    const monitor = Main.layoutManager.primaryMonitor;
    const frame = window.get_frame_rect();
    note(`window: ${window.get_title()} ${frame.x},${frame.y} ${frame.width}x${frame.height}`);
    window.move_frame(true, Math.round(monitor.x + (monitor.width - frame.width) / 2), monitor.y);
    await sleep(1200);
    note(`window below: ${where()}`);
    await shot('free-window-below');
    window.move_frame(true, monitor.x + 20, monitor.y + 300);
    await sleep(1200);
    note(`window away: ${where()}`);
    await shot('free-window-away');

    // Halfway through the shrink, for the motion.
    window.move_frame(true, Math.round(monitor.x + (monitor.width - frame.width) / 2), monitor.y);
    await sleep(120);
    note(`shrinking: ${where()}`);
    await shot('free-shrinking');
    await sleep(1200);
    window.move_frame(true, monitor.x + 20, monitor.y + 300);
    await sleep(120);
    note(`growing: ${where()}`);
    await shot('free-growing');
    await sleep(1200);

    // Minimised windows leave it free.
    window.move_frame(true, Math.round(monitor.x + (monitor.width - frame.width) / 2), monitor.y);
    await sleep(800);
    window.minimize();
    await sleep(1200);
    note(`minimised: ${where()}`);

    // Music docked in the clock, free and not.
    const media = extension._islandSources.find(s => s.constructor.name === 'MediaSource');
    const player = Object.assign(new EventEmitter(), {
        trackTitle: 'Lo-fi to study to', trackArtists: ['Track 4 of 32'], status: 'Playing', trackCoverUrl: '',
        canGoNext: true, canGoPrevious: true, app: null, _busName: null,
        _playerProxy: {Metadata: {'mpris:length': new GLib.Variant('x', 189e6)}},
        playPause() {}, next() {}, previous() {},
    });
    media._source?.disconnectObject(media);
    media._source = Object.assign(new EventEmitter(), {players: [player]});
    media._position = {at: GLib.get_monotonic_time() - 72e6, value: 0};
    media._choose();
    await sleep(4200);
    note(`music docked free: docked=${island._docked} dockWidth=${island._dockWidth} ${where()}`);
    await shot('free-docked');
    window.unminimize();
    await sleep(1200);
    note(`music docked, window below: ${where()}`);
    await shot('free-docked-window');
    window.minimize();
    await sleep(1200);

    // The bar pushed down: the island sits in it at its own width.
    const bar = extension._bars.primary;
    bar.peek(true);
    await sleep(1200);
    note(`bar down: barDown=${island._placedDown} ${where()}`);
    await shot('free-bar-down');
    bar.peek(false);
    await sleep(1500);

    // The settings page with the row.
    set('islandFreeGrow', 25);
    extension._qs.open(bar.statusPill);
    extension._qs.navigate('settings');
    await sleep(900);
    const page = extension._qs._stack.at(-1);
    const find = actor => actor.style_class?.includes?.('halo-qs-grow') ? actor : actor.get_children().map(find).find(Boolean);
    const row = find(page.actor);
    note(`row visible=${row?.visible}`);
    if (row) {
        const [, y] = row.get_transformed_position();
        page.actor.vadjustment.value = Math.max(0, y - 260);
    }
    await sleep(500);
    await shot('free-settings');
    extension._qs.close({animated: false});
    set('barMode', 'bar');
    await sleep(1200);
    note(`bar mode: watch=${island._freeWatch !== null} ${where()}`);
}
