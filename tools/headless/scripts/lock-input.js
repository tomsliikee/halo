// Input on the lock screen: whatever Halo had open when the screen locked,
// a click and a key press still reach GNOME's lock screen and bring up its
// password prompt. Logs which actor sits under the pointer while locked.
import Clutter from 'gi://Clutter';

export default async function ({extension, sleep, note, set, moveTo, hold, click, Main}) {
    const seat = Clutter.get_default_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = () => Date.now() * 1000;
    const shield = Main.screenShield;
    // Halo is disabled and enabled again on lock when an extension before it
    // has no lock screen mode; its parts are looked up anew each time.
    let qs = extension._qs;
    let center = extension._center;
    const fresh = () => {
        qs = extension._qs;
        center = extension._center;
    };

    const path = actor => {
        const names = [];
        for (let a = actor; a && names.length < 6; a = a.get_parent())
            names.push(a.name || a.constructor.name);
        return names.join(' < ');
    };
    const under = (x, y) => path(global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y));
    const prompt = () => shield._dialog?._activePage === shield._dialog?._promptBox;
    const haloLeft = () => [qs.actor, center.actor].filter(a => a.visible).map(a => a.name).join(',') || 'none';

    const check = async (name, before) => {
        fresh();
        moveTo(640, 400);
        await sleep(300);
        await before();
        await sleep(2000);
        const middle = under(640, 400);
        const grab = global.stage.get_grab_actor?.();
        moveTo(640, 400);
        await sleep(100);
        hold(true);
        await sleep(60);
        hold(false);
        await sleep(1200);
        const byClick = prompt();
        let byKey = byClick;
        if (!byClick) {
            keyboard.notify_keyval(time(), Clutter.KEY_space, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(time(), Clutter.KEY_space, Clutter.KeyState.RELEASED);
            await sleep(1200);
            byKey = prompt();
        }
        note(`${mode} ${name}: locked=${Main.sessionMode.isLocked} halo catchers visible=${haloLeft()} under pointer=[${middle}] prompt by click=${byClick} by key=${byKey} grab=${grab ? path(grab) : 'none'} modal=${Main.modalCount}`);
        shield.deactivate(false);
        await sleep(2000);
        note(`${mode} ${name}: after unlock locked=${Main.sessionMode.isLocked} catchers visible=${haloLeft()}`);
    };

    let mode = 'bar';
    for (mode of ['bar', 'island', 'handle']) {
        set('barMode', mode);
        await sleep(2000);
        await check('nothing open', async () => shield.lock(false));
        await check('quick settings open', async () => {
            qs.open();
            await sleep(800);
            shield.lock(false);
        });
        await check('center open', async () => {
            center.open();
            await sleep(800);
            shield.lock(false);
        });
        await check('lock button in quick settings', async () => {
            qs.open();
            await sleep(800);
            await click(qs._main._lock);
        });
        // Closing the lid locks and turns the panel off; waking turns it on:
        // both change the monitors while the screen locks.
        await check('monitors changed while locking', async () => {
            shield.lock(false);
            await sleep(300);
            Main.layoutManager.emit('monitors-changed');
            await sleep(300);
            Main.layoutManager.emit('monitors-changed');
        });
        await check('stopped close animation', async () => {
            qs.open();
            await sleep(800);
            qs.close();
            qs._card.remove_all_transitions();
            center.open();
            await sleep(800);
            center.close();
            center._card.remove_all_transitions();
            await sleep(300);
            note(`stopped close animation: before lock catchers visible=${haloLeft()} under pointer=[${under(640, 400)}]`);
            shield.lock(false);
        });
    }
}
