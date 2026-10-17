// The bar's modes: "island" (no bar, the clock island alone) and "handle"
// (only a grip). Where things hang, the push against the top edge, the
// swipe up that sends the island away for a while, and a hint meanwhile.
import Gio from 'gi://Gio';

export default async function ({extension, shot, sleep, note, set, moveTo, nudge, swipe, hold, launch, Main}) {
    const island = extension._island;
    const shape = island._shape;
    const bars = extension._bars;
    const work = () => {
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        return `${area.y}+${area.height}`;
    };
    const where = () => `top=${Math.round(shape.boxTop)} ${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)} reactive=${shape.reactive} view=${island._viewKey}`;
    const push = async () => {
        moveTo(900, 2);
        await sleep(100);
        for (let i = 0; i < 12; i++) {
            nudge(0, -10);
            await sleep(30);
        }
        await sleep(900);
    };
    const volume = () => Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), null, 0.5, 1);

    await sleep(3000);
    moveTo(640, 600);
    note(`bar: work area=${work()} ${where()}`);
    await shot('modes-bar');

    set('barMode', 'island');
    await sleep(1500);
    note(`island: work area=${work()} bar hidden=${bars.primary.hidden} ${where()}`);
    await shot('modes-island');

    volume();
    await sleep(700);
    note(`island, volume: ${where()}`);
    await shot('modes-island-volume');
    await sleep(3200);

    await push();
    note(`island, pushed: bar peeking=${bars.peeking} hidden=${bars.primary.hidden} ${where()}`);
    await shot('modes-island-pushed');
    moveTo(640, 600);
    await sleep(1500);
    note(`island, left: bar peeking=${bars.peeking} hidden=${bars.primary.hidden} ${where()}`);

    // A drag up on the clock sends it away for the set time.
    set('islandHideSeconds', 5);
    await sleep(300);
    const [x, y] = shape.get_transformed_position();
    moveTo(x + shape.width / 2, y + shape.height / 2);
    await sleep(200);
    hold(true);
    for (let i = 1; i <= 6; i++) {
        moveTo(x + shape.width / 2, y + shape.height / 2 - i * 5);
        await sleep(20);
    }
    hold(false);
    await sleep(900);
    note(`island, dragged up: ${where()}`);
    await shot('modes-island-away');
    volume();
    await sleep(700);
    note(`island away, volume: ${where()}`);
    await sleep(3200);
    note(`island away, after volume: ${where()}`);
    await sleep(2500);
    note(`island, back after 5 s: ${where()}`);

    // Two fingers up on the clock do the same.
    const [x2, y2] = shape.get_transformed_position();
    moveTo(x2 + shape.width / 2, y2 + shape.height / 2);
    await sleep(200);
    const natural = new Gio.Settings({schema_id: 'org.gnome.desktop.peripherals.touchpad'}).get_boolean('natural-scroll');
    for (let i = 0; i < 6; i++) {
        swipe(0, natural ? 0.5 : -0.5);
        await sleep(20);
    }
    await sleep(900);
    // The headless pointer sends no touchpad scrolls; the rule is fed by hand.
    const fake = dy => ({get_scroll_direction: () => 4, is_pointer_emulated: () => false, is_scroll_stop: () => false, get_scroll_delta: () => [0, dy]});
    for (let i = 0; i < 4; i++)
        island._swipedUp(fake(natural ? 0.5 : -0.5));
    await sleep(900);
    note(`island, two fingers fed by hand: ${where()}`);
    note(`island, two fingers up (natural=${natural}): ${where()}`);
    await sleep(5500);

    set('barMode', 'handle');
    moveTo(640, 600);
    await sleep(1500);
    const grip = island._handle;
    note(`handle: work area=${work()} grip=${grip?.actor.visible} at ${grip?.actor.x},${grip?.actor.y} ${grip?.actor.width}x${grip?.actor.height} ${where()}`);
    await shot('modes-handle');
    moveTo(640, 6);
    await sleep(900);
    note(`handle, rest on it: ${where()}`);
    await shot('modes-handle-open');
    moveTo(640, 600);
    await sleep(1200);
    note(`handle, left: ${where()}`);

    volume();
    await sleep(700);
    note(`handle, volume: ${where()}`);
    await shot('modes-handle-volume');
    await sleep(3200);

    // Music: its intro, then back into the grip with a dot.
    island.set({
        id: 'modes-media', kind: 'media', view: 'mediaCompact', large: 'mediaLarge',
        data: {title: 'Track', note: 'Artist', cover: null, playing: true, position: 0, length: 0, canPrevious: true, canNext: true},
        onPlay: () => {}, onPrevious: () => {}, onNext: () => {},
    });
    await sleep(800);
    note(`handle, music intro: ${where()}`);
    await sleep(2800);
    note(`handle, music after intro: ${where()} dot=${grip?._dot.visible}`);
    await shot('modes-handle-music');
    moveTo(640, 6);
    await sleep(900);
    note(`handle, music, rest on it: ${where()}`);
    await shot('modes-handle-music-open');
    moveTo(640, 600);
    island.remove('modes-media');
    await sleep(1200);

    await push();
    note(`handle, pushed: bar peeking=${bars.peeking} grip=${grip?.actor.visible} ${where()}`);
    await shot('modes-handle-pushed');
    moveTo(640, 600);
    await sleep(1500);
    note(`handle, left: bar peeking=${bars.peeking} grip=${grip?.actor.visible} ${where()}`);

    // Hover on the resting clock: the glance, with stood-in weather and
    // event (the headless shell has neither).
    island._glance = () => [{icon: 'partly-cloudy-day', text: '14 °C'}, {icon: 'event', text: 'Standup in 20 min'}];
    set('barMode', 'bar');
    await sleep(1500);
    note(`bar again: work area=${work()} grip=${Boolean(island._handle)} ${where()}`);
    const [x3, y3] = shape.get_transformed_position();
    moveTo(x3 + shape.width / 2, y3 + shape.height / 2);
    // The headless shell may not tell the shape it was entered after all
    // the moving above; it is told by hand.
    island._peekChanged();
    await sleep(900);
    note(`glance: ${where()}`);
    await shot('modes-glance');
    moveTo(640, 600);
    await sleep(900);
    note(`glance gone: ${where()}`);

    // New reasons to show: an app starting, a move to another workspace.
    const seen = new Set();
    const watch = island.set.bind(island);
    island.set = activity => {
        seen.add(`${activity.kind}:${activity.data?.title ?? ''}`);
        return watch(activity);
    };
    await launch('org.gnome.TextEditor.desktop', 2500);
    global.workspace_manager.get_workspace_by_index(1).activate(global.get_current_time());
    await sleep(500);
    await shot('modes-workspace');
    await sleep(1500);
    note(`told: ${[...seen].filter(k => /^(launch|workspace)/.test(k)).join(', ')} now=${island._viewKey}`);
}
