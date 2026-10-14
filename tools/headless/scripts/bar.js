// The bar in every layout, light and dark, with an app, the overview and
// the quick settings open, and a workspace switch half way.
export default async function ({extension, shot, sleep, note, set, launch, desktop, click, Main}) {
    await sleep(1200);
    await shot('intro-done');
    await launch('org.gnome.Nautilus.desktop', 3000);
    for (const layout of ['full', 'left', 'centre', 'right', 'islands']) {
        set('barLayout', layout);
        await sleep(900);
        await shot(`layout-${layout}`);
    }
    set('barLayout', 'full');
    await sleep(600);
    const bar = extension._bars.primary;
    note(`groups left=${bar._left.x},${bar._left.width} centre=${bar._centre.x},${bar._centre.width} right=${bar._right.x},${bar._right.width} frame=${bar._frame.x},${bar._frame.width}`);
    const area = Main.layoutManager.getWorkAreaForMonitor(0);
    note(`work area y=${area.y} height=${area.height}`);
    global.workspace_manager.get_workspace_by_index(2).activate(global.get_current_time());
    await sleep(90);
    await shot('workspace-gliding');
    await sleep(800);
    await shot('workspace-2');
    global.workspace_manager.get_workspace_by_index(0).activate(global.get_current_time());
    await sleep(600);
    await click(bar.statusPill);
    await sleep(800);
    await shot('status-open');
    note(`quick settings open=${Main.panel.statusArea.quickSettings.menu.isOpen}`);
    Main.panel.statusArea.quickSettings.menu.close();
    await sleep(400);
    await click(bar.clockPill);
    await sleep(800);
    await shot('clock-open');
    note(`date menu open=${Main.panel.statusArea.dateMenu.menu.isOpen}`);
    Main.panel.statusArea.dateMenu.menu.close();
    await sleep(400);
    Main.overview.show();
    await sleep(1200);
    await shot('overview');
    Main.overview.hide();
    await sleep(900);
    set('seeThrough', true);
    set('floating', false);
    await sleep(900);
    await shot('flat-see-through');
    set('seeThrough', false);
    set('floating', true);
    desktop.set_string('color-scheme', 'prefer-dark');
    for (const colour of ['blue', 'teal', 'white']) {
        set('colour', colour);
        await sleep(500);
        await shot(`dark-${colour}`);
    }
    set('barLayout', 'islands');
    await sleep(900);
    await shot('dark-islands');
}
