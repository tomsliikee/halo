// Locking from Halo's quick settings and waking from sleep: nothing of Halo
// is left over the lock screen, and the wake check writes its lines (seen
// in the shell's output as "halo wake: ..."). Run it with Halo's siblings
// before it too (HALO_WITH), as on the laptop.
import Clutter from 'gi://Clutter';

import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

export default async function ({extension, sleep, note, click, moveTo, Main}) {
    const path = actor => {
        const names = [];
        for (let a = actor; a && names.length < 6; a = a.get_parent())
            names.push(a.name || a.constructor.name);
        return names.join(' < ');
    };
    const halo = () => Main.layoutManager.uiGroup.get_children()
        .filter(a => (a.name ?? '').startsWith('halo') && a.visible)
        .map(a => `${a.name}${a.reactive ? '*' : ''} ${Math.round(a.width)}x${Math.round(a.height)}`).join(', ');
    const under = () => path(global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, 640, 400));

    await sleep(2500);
    const qs = extension._qs;
    qs.open();
    await sleep(800);
    await click(qs._main._lock);
    await sleep(2500);
    note(`locked from quick settings: halo=[${halo()}] under pointer=[${under()}]`);

    const manager = LoginManager.getLoginManager();
    manager.emit('prepare-for-sleep', true);
    Main.layoutManager.emit('monitors-changed');
    await sleep(300);
    manager.emit('prepare-for-sleep', false);
    Main.layoutManager.emit('monitors-changed');
    await sleep(3500);
    moveTo(600, 380);
    await sleep(100);
    await click(Main.layoutManager.uiGroup);
    await sleep(1200);
    const prompt = Main.screenShield._dialog?._activePage === Main.screenShield._dialog?._promptBox;
    note(`woke: halo=[${halo()}] under pointer=[${under()}] prompt by click=${prompt}`);
    Main.screenShield.deactivate(false);
    await sleep(2500);
    note(`unlocked: halo=[${halo()}]`);
}
