// Switching on and off, and each part on its own: GNOME's bar must come
// back exactly as it was, with its strut.
export default async function ({extension, shot, sleep, note, set, Main}) {
    const box = Main.layoutManager.panelBox;
    const tracked = () => Main.layoutManager._trackedActors.some(a => a.actor === box);
    const area = () => {
        const r = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        return `${r.x},${r.y} ${r.width}x${r.height}`;
    };
    note(`on: panel visible=${box.visible} tracked=${tracked()} work area=${area()} bars=${extension._bars?.all.map(b => b.monitorIndex).join(',')}`);
    for (const i of Main.layoutManager.monitors.keys()) {
        const r = Main.layoutManager.getWorkAreaForMonitor(i);
        note(`monitor ${i}: work area ${r.x},${r.y} ${r.width}x${r.height}`);
    }
    await shot('on');
    set('parts', {...extension._settings.current.parts, bar: false});
    await sleep(500);
    note(`bar off: panel visible=${box.visible} tracked=${tracked()} work area=${area()}`);
    set('parts', {...extension._settings.current.parts, bar: true});
    await sleep(300);
    const before = global.stage.get_n_children();
    for (let i = 0; i < 10; i++) {
        extension.disable();
        await sleep(100);
        extension.enable();
        await sleep(150);
    }
    extension.disable();
    await sleep(500);
    note(`disabled: panel visible=${box.visible} tracked=${tracked()} work area=${area()}`);
    await shot('off');
    extension.enable();
    await sleep(500);
    note(`stage children before=${before} after=${global.stage.get_n_children()}`);
}
