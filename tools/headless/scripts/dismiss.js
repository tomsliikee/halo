// A right click hides a lasting thing, which then waits as a small circle:
// beside the island while something else shows, beside the clock when
// nothing does. A click on the circle brings it back. On the lock screen
// GNOME's own list of notifications stays hidden.
import Clutter from 'gi://Clutter';

import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export default async function ({extension, shot, sleep, note, click, moveTo, Main}) {
    const island = extension._island;
    const shape = island._shape;
    const bubble = island._bubble;
    const state = () => `main=${island._shown} bubble=${island._bubbleShown}${bubble.visible ? ` ${Math.round(bubble.width)}px` : ''} dismissed=[${[...island._dismissed]}]`;
    const media = {
        id: 'test-media', kind: 'media', view: 'mediaCompact', large: 'mediaLarge',
        data: {title: 'Lo-fi to study to', note: 'Lofi Girl', cover: null, playing: true, position: 73e6, length: 189e6,
            canPrevious: true, canNext: true},
        onPlay: () => {}, onPrevious: () => {}, onNext: () => {},
    };

    moveTo(100, 600);
    await sleep(2500);
    extension._timers.startTimer(10);
    island.set(media);
    await sleep(1200);
    note(`start: ${state()}`);

    // The timer is shown; a right click puts it in the bubble.
    await click(shape, Clutter.BUTTON_SECONDARY);
    moveTo(100, 600);
    await sleep(1200);
    note(`right click on the timer: ${state()}`);
    await shot('dismiss-bubble');

    // The bubble brings it back.
    await click(bubble);
    moveTo(100, 600);
    await sleep(1200);
    note(`click on the bubble: ${state()}`);

    // Alone: hidden, it waits beside the clock.
    extension._timers.reset('timer');
    await sleep(800);
    await click(shape, Clutter.BUTTON_SECONDARY);
    moveTo(100, 600);
    await sleep(1200);
    note(`right click on the music alone: ${state()} view=${island._viewKey}`);
    await shot('dismiss-rest');
    await click(bubble);
    moveTo(100, 600);
    await sleep(1200);
    note(`click on the circle: ${state()}`);

    // A right click on the clock brings back everything hidden.
    await click(shape, Clutter.BUTTON_SECONDARY);
    await sleep(800);
    await click(shape, Clutter.BUTTON_SECONDARY);
    moveTo(100, 600);
    await sleep(1200);
    note(`right click on the clock: ${state()}`);

    // While the center is open the circle stays away.
    await click(shape, Clutter.BUTTON_SECONDARY);
    await sleep(800);
    extension._center.open();
    await sleep(900);
    note(`center open: ${state()} view=${island._viewKey} bubble visible=${bubble.visible}`);
    extension._center.close({animated: false});
    await sleep(800);
    island.remove('test-media');
    await sleep(600);

    // Locked with a notification: GNOME's list stays hidden.
    const source = new MessageTray.Source({title: 'Chat', iconName: 'mail-unread-symbolic'});
    Main.messageTray.add(source);
    Main.screenShield.lock(false);
    await sleep(2500);
    const notification = new MessageTray.Notification({source, title: 'Lunch?', body: 'At noon', urgency: MessageTray.Urgency.HIGH});
    source.addNotification(notification);
    await sleep(1500);
    const box = Main.screenShield._dialog?._notificationsBox;
    note(`locked: gnome list visible=${box?.visible} sources in it=${box?._notificationBox?.get_n_children()} island=${island._shown}`);
    await shot('dismiss-locked');
    Main.screenShield.deactivate(false);
    await sleep(2000);
    note(`unlocked: locked=${Main.sessionMode.isLocked}`);
    source.destroy();
}
