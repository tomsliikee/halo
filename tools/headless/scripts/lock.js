// The lock screen: GNOME's shield locks; the bar keeps only its status
// pill, the clock opens nothing, the quick settings lead to no settings,
// a notification shows in the island without its content, and Claude's
// work stays out. Unlocking brings everything back.
export default async function ({extension, shot, sleep, note, click, Main}) {
    const MessageTray = await import('resource:///org/gnome/shell/ui/messageTray.js');
    const island = extension._island;
    const bar = extension._bars.primary;
    await sleep(3000);
    const [, , , , , claude] = extension._islandSources;
    claude._sessionsChanged([{project: 'secret-project', state: 'working', since: Date.now() - 60000}]);
    await sleep(900);
    note(`unlocked: shown=${island._shown}`);

    Main.screenShield.lock(false);
    await sleep(2500);
    note(`locked=${Main.sessionMode.isLocked} left=${bar._left.visible} centre=${bar._centre.visible} status=${bar.statusPill.is_mapped()} frame=${bar._frame.visible} gnome panel=${Main.layoutManager.panelBox.visible}`);
    note(`island shown=${island._shown} visible=${island._shape.visible}`);
    await shot('lock-screen');

    // The clock would open the center: nothing opens.
    extension._toggleCenter(bar.clockPill);
    await sleep(400);
    note(`center open=${extension._center.isOpen}`);

    // A notification while locked: only that it came.
    const source = MessageTray.getSystemSource();
    const notification = new MessageTray.Notification({source, title: 'Secret meeting', body: 'Room 4, bring the plans.'});
    source.addNotification(notification);
    await sleep(900);
    await shot('lock-notification');
    const words = [];
    const collect = actor => {
        if (actor.text !== undefined && actor.text)
            words.push(actor.text);
        actor.get_children().forEach(collect);
    };
    collect(island._shape);
    note(`island while locked: shown=${island._shown} text=${JSON.stringify(words)}`);

    // The quick settings: no gear, no settings links.
    await click(bar.statusPill);
    await sleep(900);
    const main = extension._qs._main;
    note(`qs open=${extension._qs.isOpen} gear=${main._gear.visible} lock=${main._lock.visible}`);
    await sleep(1500);
    await shot('lock-quick-settings');
    extension._qs.close();
    await sleep(500);

    // Unlock: the bar comes back, the island shows the notification it kept.
    Main.screenShield.deactivate(false);
    await sleep(2500);
    const after = [];
    const collectAfter = actor => {
        if (actor.text)
            after.push(actor.text);
        actor.get_children().forEach(collectAfter);
    };
    collectAfter(island._shape);
    note(`unlocked=${!Main.sessionMode.isLocked} left=${bar._left.visible} centre=${bar._centre.visible} frame=${bar._frame.visible} island=${island._shown} text=${JSON.stringify(after)}`);
    await shot('unlocked');
}
