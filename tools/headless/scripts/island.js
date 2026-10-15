// The island in every look of the design (PDF page 5), each brought about
// the way the system would: GNOME's OSD calls, a notification through the
// message tray and a call through the notification daemon over D-Bus, a
// player, the shared timer, the battery, a device, Claude, a screenshot, a
// copied text and an app's progress. Clicks open, collapse and swap.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

export default async function ({extension, shot, sleep, note, click, move, moveTo, hold, set, Main}) {
    const MessageTray = await import('resource:///org/gnome/shell/ui/messageTray.js');
    const {EventEmitter} = await import('resource:///org/gnome/shell/misc/signals.js');
    const island = extension._island;
    const [osd, , media, system, , claude] = extension._islandSources;
    const shape = island._shape;
    const size = () => `${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)}`;
    await sleep(3500);
    await shot('island-rest');
    note(`rest ${size()} at ${Math.round(shape.x)},${Math.round(shape.y)} visible=${shape.visible}`);

    // Volume through GNOME's own OSD, as the volume keys do.
    Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), null, 0.72, 1);
    await sleep(80);
    await shot('island-volume-growing');
    await sleep(600);
    await shot('island-volume');
    note(`volume ${size()} gnome osd visible=${Main.osdWindowManager._osdWindows[0].visible}`);
    Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-medium-symbolic'}), null, 0.4, 1);
    await sleep(300);
    await shot('island-volume-down');
    Main.osdWindowManager.showOne(0, new Gio.ThemedIcon({name: 'display-brightness-symbolic'}), null, 0.38, 1);
    await sleep(600);
    await shot('island-brightness');
    Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-muted-symbolic'}), null, 0, 1);
    await sleep(600);
    await shot('island-mute');
    await sleep(2200);
    await shot('island-back-to-rest');
    note(`after osd ${size()}`);

    // A notification through the tray, with two actions.
    const source = MessageTray.getSystemSource();
    const notification = new MessageTray.Notification({source, title: 'Meeting moved', body: 'Now at <b>16:00</b> in the library.'});
    notification.addAction('Later', () => note('action Later'));
    notification.addAction('Reply', () => note('action Reply'));
    source.addNotification(notification);
    await sleep(800);
    await shot('island-notification');
    note(`notification ${size()} gnome banner=${Main.messageTray._banner !== null}`);
    // The pointer holds it past its time.
    move(shape);
    await sleep(5600);
    note(`held: shown=${island._shown}`);
    moveTo(640, 500);
    await sleep(1400);
    note(`let go: shown=${island._shown}`);

    // A call through the notification daemon, with its category.
    const hints = {category: new GLib.Variant('s', 'call.incoming'), urgency: new GLib.Variant('y', 2)};
    const reply = await new Promise(resolve => Gio.DBus.session.call('org.freedesktop.Notifications', '/org/freedesktop/Notifications',
        'org.freedesktop.Notifications', 'Notify',
        new GLib.Variant('(susssasa{sv}i)', ['Calls', 0, '', 'Study group', 'Video call', ['decline', 'Decline', 'answer', 'Answer'], hints, 0]),
        null, Gio.DBusCallFlags.NONE, -1, null, (bus, result) => resolve(bus.call_finish(result).deepUnpack()[0])));
    await sleep(900);
    await shot('island-call');
    note(`call ${size()} shown=${island._shown}`);
    Gio.DBus.session.call('org.freedesktop.Notifications', '/org/freedesktop/Notifications', 'org.freedesktop.Notifications',
        'CloseNotification', new GLib.Variant('(u)', [reply]), null, Gio.DBusCallFlags.NONE, -1, null, null);
    await sleep(900);
    note(`call closed: shown=${island._shown}`);

    // Music, from a player as GNOME's media list hands it over.
    const player = Object.assign(new EventEmitter(), {
        trackTitle: 'Lo-fi to study to', trackArtists: ['Track 4 of 32'], status: 'Playing', trackCoverUrl: '',
        canGoNext: true, canGoPrevious: true, app: null, _busName: null,
        _playerProxy: {Metadata: {'mpris:length': new GLib.Variant('x', 189e6)}},
        playPause() {
            this.status = this.status === 'Playing' ? 'Paused' : 'Playing';
            this.emit('changed');
        },
        next() {}, previous() {},
    });
    media._source?.disconnectObject(media);
    media._source = Object.assign(new EventEmitter(), {players: [player]});
    media._position = {at: GLib.get_monotonic_time() - 72e6, value: 0};
    media._choose();
    await sleep(900);
    await shot('island-media');
    note(`media ${size()}`);
    await click(shape);
    await sleep(900);
    await shot('island-media-large');
    note(`media large ${size()} expanded=${island.expanded}`);
    // A press elsewhere closes it to its small look.
    moveTo(200, 600);
    await sleep(100);
    hold(true);
    await sleep(60);
    hold(false);
    await sleep(900);
    note(`press outside: expanded=${island.expanded} ${size()}`);
    await click(shape);
    await sleep(900);
    await click(shape, 3);
    await sleep(800);
    note(`right click: expanded=${island.expanded} ${size()}`);

    // The bar steps back to its pills while the island shows something.
    set('islandFocusBar', true);
    await sleep(1200);
    await shot('island-focus-bar');
    const bar = extension._bars.primary;
    note(`focus bar: layout=${bar._layout} frame=${bar._frame.visible}`);
    set('islandFocusBar', false);
    await sleep(800);
    note(`focus bar off: layout=${bar._layout} frame=${bar._frame.visible}`);

    // A recording beside the music: the island splits.
    island.set({id: 'recording', kind: 'recording', view: 'recording', data: {seconds: 42, text: '00:42'}, onStop: () => note('stop')});
    await sleep(1000);
    await shot('island-split');
    note(`split ${size()} bubble=${island._bubble.visible} ${Math.round(island._bubble.x)}`);
    await click(island._bubble);
    await sleep(900);
    await shot('island-split-swapped');
    note(`swapped: shown=${island._shown}`);
    island.remove('recording');
    island._focus = null;
    player.playPause();
    await sleep(1500);
    await shot('island-media-paused');
    note(`paused music stays: shown=${island._shown}`);

    // The shared timer, as the quick settings start it.
    extension._timers.toggle('pomodoro');
    await sleep(1600);
    await shot('island-timer');
    note(`timer ${size()} file=${GLib.file_test(`${GLib.get_user_state_dir()}/ledge/timers.json`, GLib.FileTest.EXISTS)}`);
    // A click opens the timer page in the quick settings.
    await click(shape);
    await sleep(1200);
    await shot('island-timer-page');
    const tile = extension._tiles.all.find(t => t.id === 'timer');
    note(`timer page open=${extension._qs.isOpen} page=${extension._qs._stack.at(-1)?.constructor.name} tile=${tile.active}/${tile.note}`);
    extension._qs.close();
    await sleep(600);
    extension._timers.reset('pomodoro');
    await sleep(600);

    // Charging: the battery as UPower would report it.
    let battery = {percent: 64, charging: false, full: false, secondsLeft: 9000};
    Object.defineProperty(extension._system, 'battery', {get: () => battery, configurable: true});
    extension._system.emit('changed');
    battery = {percent: 64, charging: true, full: false, secondsLeft: 4200};
    extension._system.emit('changed');
    await sleep(800);
    await shot('island-charging');
    await sleep(2400);
    battery = {percent: 21, charging: false, full: false, secondsLeft: 3000};
    extension._system.emit('changed');
    battery = {percent: 20, charging: false, full: false, secondsLeft: 2900};
    extension._system.emit('changed');
    await sleep(800);
    await shot('island-battery-low');
    island._activities.clear();
    island._render();
    await sleep(500);

    // Do not disturb through its setting.
    const notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    notifications.set_boolean('show-banners', false);
    await sleep(800);
    await shot('island-dnd');
    notifications.set_boolean('show-banners', true);
    await sleep(2800);

    // Headphones connect.
    const device = {address: 'aa', alias: 'Headphones', icon: 'audio-headphones', connected: false, battery_percentage: 72};
    const client = {*getDevices() {
        yield device;
    }};
    system._devicesChanged(client);
    device.connected = true;
    system._devicesChanged(client);
    await sleep(800);
    await shot('island-device');
    await sleep(4000);

    // Claude at work, from Ember's state.
    claude._sessionsChanged([{project: 'halo', state: 'working', since: Date.now() - 180000}]);
    await sleep(900);
    await shot('island-claude');
    claude._sessionsChanged([]);
    await sleep(600);

    // A screenshot, and then a copied text.
    const file = Gio.File.new_for_path(`${GLib.getenv('HALO_OUT')}/shots/island-rest.png`);
    Main.screenshotUI.emit('screenshot-taken', file);
    await sleep(800);
    await shot('island-screenshot');
    await sleep(4200);
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, 'npm run build\nsecond line');
    await sleep(800);
    await shot('island-clipboard');
    await sleep(2200);

    // An app's progress, as Files sends it.
    Gio.DBus.session.emit_signal(null, '/halo/test', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', ['application://org.gnome.Nautilus.desktop',
            {'progress': new GLib.Variant('d', 0.42), 'progress-visible': new GLib.Variant('b', true)}]));
    await sleep(900);
    await shot('island-progress');
    note(`progress shown=${island._shown}`);

    // Off and on again, with the OSD given back to GNOME in between.
    extension._settings.set('parts', {...extension._settings.current.parts, island: false});
    await sleep(500);
    note(`island off: osd own=${Object.hasOwn(Main.osdWindowManager, '_showOsdWindow')} tray own=${Object.hasOwn(Main.messageTray, '_showNotification')} clock opacity=${extension._bars.primary.clockPill.opacity}`);
    await shot('island-off');
    extension._settings.set('parts', {...extension._settings.current.parts, island: true});
    await sleep(800);
    note(`island on again: ${Boolean(extension._island)} ${osd !== extension._islandSources[0]}`);
}
