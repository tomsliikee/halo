// What Halo costs the shell per frame while a window below it redraws all
// the time (a video, a browser, an app streaming text): a full-screen actor
// in the window group changes colour every frame, and the work per frame is
// measured with Halo on and off, in each bar mode.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

export default async function ({extension, sleep, note, set, moveTo, Main}) {
    const stage = global.stage;
    let start = 0;
    let works = [];
    stage.connect('before-update', () => (start = GLib.get_monotonic_time()));
    stage.connect('after-paint', () => {
        if (start)
            works.push((GLib.get_monotonic_time() - start) / 1000);
        start = 0;
    });
    const at = (sorted, share) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0;
    const measure = async (name, ms = 3000) => {
        works = [];
        await sleep(ms);
        const sorted = [...works].sort((a, b) => a - b);
        const sum = works.reduce((a, b) => a + b, 0);
        note(`${name.padEnd(26)} fps=${(works.length / (ms / 1000)).toFixed(1).padStart(5)} work median=${at(sorted, 0.5).toFixed(2)} ` +
            `p95=${at(sorted, 0.95).toFixed(2)} ms, busy ${(sum / ms * 100).toFixed(1)} %`);
    };

    const monitor = Main.layoutManager.primaryMonitor;
    const client = new St.Widget({x: 0, y: 0, width: monitor.width, height: monitor.height, style: 'background-color: rgb(40, 40, 60);'});
    global.window_group.add_child(client);
    let shade = 0;
    const ticker = new Clutter.Timeline({actor: client, duration: 1000, repeat_count: -1});
    ticker.connect('new-frame', () => {
        shade = (shade + 1) % 10;
        client.opacity = 245 + shade;
    });

    await sleep(3000);
    moveTo(640, 600);
    await measure('still, halo on');
    ticker.start();
    for (const mode of ['bar', 'island', 'handle']) {
        set('barMode', mode);
        await sleep(1500);
        await measure(`redrawing, ${mode}`);
    }
    set('barMode', 'island');
    await sleep(1500);
    const tops = Main.layoutManager.uiGroup.get_children().filter(a => (a.name ?? '').startsWith('halo') && a.visible);
    note(`visible: ${tops.map(a => `${a.name} ${Math.round(a.width)}x${Math.round(a.height)} redirect=${a.offscreen_redirect}`).join(', ')}`);
    // Each part off and on in turn, three times, against noise.
    for (let round = 0; round < 3; round++) {
        await measure(`island, all shown #${round}`, 4000);
        for (const actor of tops) {
            actor.hide();
            await sleep(300);
            await measure(`island, ${actor.name} hidden #${round}`, 4000);
            actor.show();
            await sleep(300);
        }
    }
    const uuid = 'halo@thomashaiden';
    Main.extensionManager.disableExtension(uuid);
    await sleep(1500);
    await measure('redrawing, halo off');
    Main.extensionManager.enableExtension(uuid);
    await sleep(2500);
    await measure('redrawing, halo on again');
    ticker.stop();
}
