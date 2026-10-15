// The center grows out of the island's clock and goes back into it; while
// it is open the island rests as a pencil circle that leads to the island's
// settings, and an event grows out of that circle.
import Gio from 'gi://Gio';

export default async function ({extension, shot, sleep, note, click, Main}) {
    const island = extension._island;
    const center = extension._center;
    const shape = island._shape;
    const size = () => `${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)}`;
    const morph = () => `${center._morph.visible ? `${center._morph.width}x${center._morph.height}` : 'hidden'}`;
    await sleep(3000);
    note(`rest ${size()} view=${island._viewKey}`);

    // Open by a click on the clock, as a person would.
    await click(shape);
    for (const ms of [40, 90, 160, 260, 600]) {
        await sleep(ms - (ms === 40 ? 0 : [40, 90, 160, 260, 600][[40, 90, 160, 260, 600].indexOf(ms) - 1]));
        await shot(`morph-open-${ms}`);
        note(`open ${ms} ms: morph=${morph()} card opacity=${center._card.opacity} island=${island._viewKey} ${size()}`);
    }

    // The shape on its way, held at points of the spring: the headless
    // shell's screenshots are too slow to catch it running.
    const clock = island.restShape() ?? {x: 533, y: 8, width: 214, height: 36, radius: 18, color: '#ffffff'};
    const card = center._cardShape();
    for (const t of [0.15, 0.4, 0.7, 1.06]) {
        center._card.opacity = 0;
        center._morph.between(clock, card);
        center._morph.progress = t;
        center._morph.show();
        await sleep(120);
        await shot(`morph-held-${Math.round(t * 100)}`);
    }
    center._morph.hide();
    center._card.opacity = 255;
    note(`held frames from ${clock.width}x${clock.height} ${clock.color}`);

    // An event while open grows out of the circle and goes back into it.
    Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), null, 0.6, 1);
    await sleep(600);
    await shot('morph-event-while-open');
    note(`event while open: island=${island._viewKey} ${size()}`);
    await sleep(3200);
    note(`after the event: island=${island._viewKey} ${size()}`);

    // The circle leads to the island's settings.
    await click(shape);
    await sleep(1800);
    const page = extension._qs._stack.at(-1);
    note(`circle: center open=${center.isOpen} qs open=${extension._qs.isOpen} page=${page?.constructor.name} scrolled=${Math.round(page?.actor.vadjustment.value ?? -1)} of ${Math.round((page?.actor.vadjustment.upper ?? 0) - (page?.actor.vadjustment.page_size ?? 0))}`);
    await shot('morph-settings');
    extension._qs.close();
    await sleep(600);
    note(`back: island=${island._viewKey} ${size()} catchers=${[extension._qs.actor, center.actor].filter(a => a.visible).length}`);

    // Closing: the card goes back into the clock.
    center.open();
    await sleep(700);
    center.close();
    for (const ms of [60, 140, 260, 600]) {
        await sleep(ms - ([0, 60, 140, 260][[60, 140, 260, 600].indexOf(ms)]));
        await shot(`morph-close-${ms}`);
        note(`close ${ms} ms: morph=${morph()} island=${island._viewKey} ${size()} center actor=${center.actor.visible}`);
    }
}
