// The island under the pointer: resting on a small look shows its preview
// line, the wheel gives the timer a minute more, a sideways touchpad swipe
// swaps the timer with the music beside it, and the wheel on the music
// goes to its volume. Pointer and wheel come from a virtual device.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

export default async function ({extension, shot, sleep, note, moveTo, Main}) {
    const island = extension._island;
    const shape = island._shape;
    const seat = Clutter.get_default_backend().get_default_seat();
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const time = () => GLib.get_monotonic_time();
    const size = () => `${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)}`;
    const over = () => {
        const [x, y] = shape.get_transformed_position();
        const [w, h] = shape.get_transformed_size();
        return [x + w / 2, y + Math.min(h, 60) / 2];
    };
    const wheel = direction => pointer.notify_discrete_scroll(time(), direction, Clutter.ScrollSource.WHEEL);
    const scrolls = [];

    moveTo(100, 600);
    await sleep(2500);
    extension._timers.startTimer(10);
    island.set({
        id: 'test-media', kind: 'media', view: 'mediaCompact', large: 'mediaLarge',
        data: {title: 'Lo-fi to study to', note: 'Lofi Girl', cover: null, playing: true, position: 73e6, length: 189e6,
            canPrevious: true, canNext: true, peek: 'Spotify · 1:13 of 3:09 · scroll for volume'},
        onPlay: () => {}, onPrevious: () => {}, onNext: () => {},
        onScroll: steps => scrolls.push(steps),
    });
    await sleep(1200);
    note(`start: shown=${island._shown} bubble=${island._bubbleShown} ${size()}`);
    await shot('gestures-start');

    // Rest on it: the preview line comes.
    moveTo(...over());
    await sleep(900);
    note(`peek: view=${island._viewKey} ${size()}`);
    await shot('gestures-peek');

    // The wheel on the timer: two minutes more.
    const before = extension._timers.timers.timer.duration;
    moveTo(...over());
    wheel(Clutter.ScrollDirection.UP);
    await sleep(100);
    wheel(Clutter.ScrollDirection.UP);
    await sleep(600);
    note(`wheel up twice on the timer: +${(extension._timers.timers.timer.duration - before) / 60000} min`);

    // A touchpad swipe sideways: the music takes the island.
    moveTo(...over());
    for (let i = 0; i < 12; i++) {
        pointer.notify_scroll_continuous(time(), -6, 0.5, Clutter.ScrollSource.FINGER, Clutter.ScrollFinishFlags.NONE);
        await sleep(16);
    }
    pointer.notify_scroll_continuous(time(), 0, 0, Clutter.ScrollSource.FINGER,
        Clutter.ScrollFinishFlags.HORIZONTAL | Clutter.ScrollFinishFlags.VERTICAL);
    await sleep(900);
    note(`swipe: shown=${island._shown} bubble=${island._bubbleShown} ${size()}`);
    await shot('gestures-swiped');

    // The wheel on the music: its volume.
    moveTo(...over());
    wheel(Clutter.ScrollDirection.DOWN);
    await sleep(400);
    note(`wheel down on the music: steps=${JSON.stringify(scrolls)}`);

    // Away: the preview goes.
    moveTo(100, 600);
    await sleep(900);
    note(`away: view=${island._viewKey} ${size()}`);
    extension._timers.reset('timer');
    island.remove('test-media');
}
