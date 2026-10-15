// What Halo costs while nothing changes on screen: stage frames painted
// while idle, and while the bar is told the same state again and again (as
// a held volume key or a busy network does). Also checks that the music's
// cover follows the track.
import Gio from 'gi://Gio';

export default async function ({extension, sleep, note}) {
    const island = extension._island;
    let frames = 0;
    const id = global.stage.connect('after-paint', () => frames++);
    const count = async (ms, during = null) => {
        frames = 0;
        const end = Date.now() + ms;
        while (Date.now() < end) {
            during?.();
            await sleep(100);
        }
        return frames;
    };

    await sleep(3000);
    note(`idle 2 s: ${await count(2000)} frames`);
    note(`same bar state 20 times in 2 s: ${await count(2000, () => extension._bars._update())} frames`);

    // A timer running: the island's ring ticks once a second.
    extension._timers.startTimer(25);
    await sleep(1500);
    note(`timer running, 3 s: ${await count(3000)} frames`);
    extension._timers.reset('timer');
    await sleep(1500);

    // The cover follows the track.
    const cover = name => new Gio.ThemedIcon({name});
    const media = c => ({
        id: 'test-media', kind: 'media', view: 'mediaCompact', large: 'mediaLarge',
        data: {title: 'Track', note: 'Artist', cover: c, playing: false, position: 0, length: 0, canPrevious: true, canNext: true},
        onPlay: () => {}, onPrevious: () => {}, onNext: () => {},
    });
    const shownCover = () => {
        const slot = island._view.actor.get_first_child();
        const image = slot.child?.child ?? slot.child;
        return image?.gicon?.to_string?.() ?? image?.constructor.name ?? 'none';
    };
    island.set(media(cover('audio-x-generic')));
    await sleep(1000);
    const first = shownCover();
    island.set(media(cover('media-optical')));
    await sleep(600);
    note(`cover: ${first} -> ${shownCover()}`);
    island.remove('test-media');
    global.stage.disconnect(id);
}
