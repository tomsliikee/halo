// The notification center: notifications from three apps, one of them a
// conversation, events of today with the bar's chip, the weather and a
// world clock; opened from the island, a group opened, a card swiped
// away, Do not disturb, Super+V, dark, and "Clear all".
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather';
import Gio from 'gi://Gio';

export default async function ({extension, shot, sleep, note, click, moveTo, hold, Main}) {
    const MessageTray = await import('resource:///org/gnome/shell/ui/messageTray.js');
    await sleep(1500);

    // Events of today, as the calendar server would hand them over.
    const now = new Date();
    const at = (minutes, length) => {
        const start = new Date(now.getTime() + minutes * 60000);
        return {start, end: new Date(start.getTime() + length * 60000)};
    };
    const events = [
        {id: 'a', summary: 'Databases · lecture', ...at(13, 90)},
        {id: 'b', summary: 'Study group', ...at(90, 120)},
        {id: 'c', summary: 'Breakfast', ...at(-300, 30)},
    ];
    const day = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    extension._agenda._source = {
        hasCalendars: true, isLoading: false,
        requestRange() {},
        getEvents: (begin, end) => events.filter(e => e.start >= begin && e.start < end)
            .map(e => ({id: e.id, summary: e.summary, date: e.start, end: e.end})),
        hasEvents: date => events.some(e => day(e.start) === day(date)) || [3, 9].includes(date.getDate()),
        disconnectObject() {},
    };
    extension._agenda.emit('changed');
    await sleep(400);
    note(`chip visible=${extension._bars.primary._event.visible} text=${extension._bars.primary._eventText.text}`);
    await shot('center-chip');

    // The weather of a place, and a world clock as GNOME Clocks keeps it.
    extension._weather.refresh = function () {
        this.place = {name: 'Vienna'};
        this.today = {temperature: 12.3, code: 2, isDay: true, max: 15, min: 7};
        this.emit('changed');
    };
    const newYork = GWeather.Location.get_world().find_nearest_city(40.71, -74.0);
    new Gio.Settings({schema_id: 'org.gnome.shell.world-clocks'})
        .set_value('locations', new GLib.Variant('av', newYork ? [newYork.serialize()] : []));

    // Notifications from three apps; the chat sends twice in one conversation.
    const notify = (app, iconName, title, body, actions = []) => {
        let source = Main.messageTray.getSources().find(s => s.title === app);
        if (!source) {
            source = new MessageTray.Source({title: app, iconName});
            Main.messageTray.add(source);
        }
        const notification = new MessageTray.Notification({source, title, body});
        for (const label of actions)
            notification.addAction(label, () => note(`action ${label}`));
        source.addNotification(notification);
        return notification;
    };
    notify('System', 'system-software-update-symbolic', 'Updates ready', '12 packages · restart needed', ['Restart']);
    await sleep(300);
    notify('Files', 'folder-symbolic', 'Copy finished', '3 files to the USB stick', ['Open']);
    await sleep(300);
    notify('Chat', 'chat-symbolic', 'Study group', 'Please bring the answers to sheet 4.');
    await sleep(300);
    notify('Chat', 'chat-symbolic', 'Study group', 'We meet at 16:00 in the library, room 2.', ['Reply', 'Mute for 1 h']);
    await sleep(6000);
    note(`unread before=${extension._system.unread}`);

    // The resting island is the clock; a click opens the center.
    await click(extension._island._shape);
    await sleep(140);
    await shot('center-opening');
    await sleep(900);
    await shot('center');
    const center = extension._center;
    note(`open=${center.isOpen} cards=${center._list.cards.length} unread after=${extension._system.unread}`);

    // The conversation opens to show both messages.
    const find = (actor, test) => {
        if (test(actor))
            return actor;
        for (const child of actor.get_children?.() ?? []) {
            const found = find(child, test);
            if (found)
                return found;
        }
        return null;
    };
    const more = find(center._list.cards[0], actor => actor.has_style_class_name?.('halo-center-more'));
    await click(more);
    await sleep(700);
    await shot('center-expanded');

    // The Files card follows the pointer and is swiped away.
    const files = center._list.cards.find(card => card.accessible_name.startsWith('Files'));
    const [x, y] = files.get_transformed_position();
    moveTo(x + 60, y + 30);
    await sleep(80);
    hold(true);
    for (let dx = 0; dx <= 300; dx += 30) {
        moveTo(x + 60 + dx, y + 30);
        await sleep(16);
    }
    await shot('center-swiping');
    hold(false);
    await sleep(900);
    note(`after swipe cards=${center._list.cards.length} files left=${Main.messageTray.getSources().some(s => s.title === 'Files' && s.notifications.length > 0)}`);
    await shot('center-swiped');

    // A short drag springs back.
    const system = center._list.cards.at(-1);
    const [sx, sy] = system.get_transformed_position();
    moveTo(sx + 60, sy + 30);
    await sleep(80);
    hold(true);
    // Slowly, so it is no flick.
    for (let dx = 0; dx <= 60; dx += 10) {
        moveTo(sx + 60 + dx, sy + 30);
        await sleep(60);
    }
    await sleep(200);
    hold(false);
    await sleep(900);
    note(`short drag kept: cards=${center._list.cards.length} translation=${Math.round(system.translation_x)}`);

    // Do not disturb from the row at the bottom.
    await click(center._dnd);
    await sleep(500);
    note(`dnd=${!new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'}).get_boolean('show-banners')}`);
    await shot('center-dnd');
    await click(center._dnd);
    await sleep(300);

    // Escape closes; Super+V (GNOME's own call) opens it again.
    center.close();
    await sleep(500);
    Main.panel.toggleCalendar();
    await sleep(900);
    note(`super+v opens: ${center.isOpen} gnome date menu open=${Main.panel.statusArea.dateMenu.menu.isOpen}`);

    // Dark.
    center.close({animated: false});
    new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_string('color-scheme', 'prefer-dark');
    await sleep(600);
    center.open();
    await sleep(900);
    await shot('center-dark');

    // A day with events chosen in the month.
    const grid = center._side._grid;
    const cell = grid.get_children().find(child => child.accessible_name?.startsWith?.('9 '));
    if (cell) {
        await click(cell);
        await sleep(500);
        await shot('center-other-day');
    }

    // Clear all leaves the empty list.
    await click(center._clear);
    await sleep(800);
    note(`after clear: cards=${center._list.cards.length} count=${extension._notificationModel.count}`);
    await shot('center-empty');
    center.close();
    await sleep(500);

    // Off and on: GNOME's date menu comes back in between.
    extension._settings.set('parts', {...extension._settings.current.parts, center: false});
    await sleep(500);
    note(`center off: toggleCalendar own=${Object.hasOwn(Main.panel, 'toggleCalendar')} menu.open own=${Object.hasOwn(Main.panel.statusArea.dateMenu.menu, 'open')}`);
    extension._settings.set('parts', {...extension._settings.current.parts, center: true});
    await sleep(500);
    note(`center on again: ${Boolean(extension._center)}`);
}
