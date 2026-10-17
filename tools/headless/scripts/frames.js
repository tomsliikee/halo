// How smooth Halo moves: per scenario the frames painted, the frames per
// second and how long the shell worked on a frame (median, 95th percentile,
// worst), from the stage's before-update to its after-paint. Runs before
// and after a change to see what it costs.
import Gio from 'gi://Gio';

export default async function ({extension, sleep, note, moveTo, Main}) {
    const island = extension._island;
    const center = extension._center;
    const stage = global.stage;
    let start = 0;
    let works = [];
    const ids = [
        stage.connect('before-update', () => (start = GLib.get_monotonic_time())),
        stage.connect('after-paint', () => {
            if (start)
                works.push((GLib.get_monotonic_time() - start) / 1000);
            start = 0;
        }),
    ];
    const at = (sorted, share) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0;
    const measure = async (name, ms, action = null) => {
        works = [];
        const begin = Date.now();
        await action?.();
        const rest = ms - (Date.now() - begin);
        if (rest > 0)
            await sleep(rest);
        const sorted = [...works].sort((a, b) => a - b);
        const seconds = ms / 1000;
        note(`${name.padEnd(22)} frames=${String(works.length).padStart(4)} fps=${(works.length / seconds).toFixed(1).padStart(5)} ` +
            `work median=${at(sorted, 0.5).toFixed(2)} p95=${at(sorted, 0.95).toFixed(2)} max=${(sorted.at(-1) ?? 0).toFixed(2)} ms`);
    };

    const media = playing => ({
        id: 'frames-media', kind: 'media', view: 'mediaCompact', large: 'mediaLarge',
        data: {title: 'A rather long track title', note: 'Some artist', cover: new Gio.ThemedIcon({name: 'audio-x-generic'}),
            playing, position: 30e6, length: 200e6, canPrevious: true, canNext: true, peek: 'Player'},
        onPlay: () => {}, onPrevious: () => {}, onNext: () => {},
    });

    await sleep(3000);
    moveTo(640, 600);
    await sleep(500);
    await measure('idle', 2000);

    island.set(media(true));
    await measure('music: intro (compact)', 2000);
    await measure('music: docked', 3000);
    island._expanded = 'frames-media';
    island._render();
    await measure('music: opened', 2000);
    island._expanded = null;
    island._render();
    await sleep(800);
    island.remove('frames-media');
    await sleep(800);

    island.set({id: 'frames-claude', kind: 'claude', view: 'info', data: {icon: 'progress-activity', title: 'Claude', note: 'Working'}});
    await measure('claude: working', 3000);
    island.remove('frames-claude');
    await sleep(800);

    await measure('volume hint grow+shrink', 3500, () =>
        Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), null, 0.6, 1));

    await measure('hover on hint', 1500, async () => {
        Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-medium-symbolic'}), null, 0.4, 1);
        await sleep(500);
        const [x, y] = island._shape.get_transformed_position();
        moveTo(x + island._shape.width / 2, y + 20);
    });
    moveTo(640, 600);
    await sleep(3500);

    if (center) {
        await measure('center unfold', 1500, () => center.open());
        await measure('center fold', 1500, () => center.close());
    }

    for (const id of ids)
        stage.disconnect(id);
}

import GLib from 'gi://GLib';
