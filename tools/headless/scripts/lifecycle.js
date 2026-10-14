// Switching on and off, and each part on its own: GNOME's bar must come
// back exactly as it was, with its strut, and GNOME's quick settings with
// the menus Halo lent from other extensions.
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
    set('parts', {...extension._settings.current.parts, quickSettings: false});
    await sleep(300);
    note(`qs off: halo qs=${Boolean(extension._qs)} gnome toggle own=${Object.hasOwn(Main.panel, 'toggleQuickSettings')}`);
    set('parts', {...extension._settings.current.parts, quickSettings: true});
    await sleep(300);
    const before = global.stage.get_n_children();
    const lent = () => extension._tiles.shown.find(tile => tile.page === 'hosted' && tile.id.startsWith('panel:'));
    for (let i = 0; i < 10; i++) {
        // Every other time with the panel open on a lent menu.
        if (i % 2 === 0 && extension._tiles.all.length > 0) {
            extension._qs.open();
            const tile = lent();
            if (tile)
                extension._qs.navigate('hosted', tile);
            await sleep(80);
        }
        extension.disable();
        await sleep(100);
        extension.enable();
        await sleep(400);
    }
    extension.disable();
    await sleep(500);
    note(`disabled: panel visible=${box.visible} tracked=${tracked()} work area=${area()}`);
    const qsMenu = Main.panel.statusArea.quickSettings.menu;
    note(`gnome qs restored: own open=${Object.hasOwn(qsMenu, 'open')} own toggle=${Object.hasOwn(Main.panel, 'toggleQuickSettings')} modal=${Main.modalCount}`);
    for (const [key, button] of Object.entries(Main.panel.statusArea)) {
        if (button?.menu?.box)
            note(`menu back: ${key} parent=${button.menu.box.get_parent()?.constructor.name} managed=${Main.panel.menuManager._menus.includes(button.menu)}`);
    }
    Main.panel.statusArea.quickSettings.menu.open();
    await sleep(600);
    await shot('off-gnome-qs');
    note(`gnome qs opens: ${qsMenu.isOpen}`);
    qsMenu.close();
    await sleep(300);
    await shot('off');
    extension.enable();
    await sleep(500);
    note(`stage children before=${before} after=${global.stage.get_n_children()}`);
}
