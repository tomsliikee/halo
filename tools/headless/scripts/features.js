// How far the island hangs in, the wide island, another extension's icon
// kept in the bar, the new island events, and what ticks while nobody
// looks (the music's time, the tray tiles' polling).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

export default async function ({extension, shot, sleep, note, click, moveTo, set, Main}) {
    const MessageTray = await import('resource:///org/gnome/shell/ui/messageTray.js');
    const PanelMenu = await import('resource:///org/gnome/shell/ui/panelMenu.js');
    const {EventEmitter} = await import('resource:///org/gnome/shell/misc/signals.js');
    const island = extension._island;
    const shape = island._shape;
    const source = name => extension._islandSources.find(s => s.constructor.name === name);
    const where = () => `top=${Math.round(shape.boxTop)} ${Math.round(shape.boxWidth)}x${Math.round(shape.boxHeight)} view=${island._viewKey}`;
    const volume = () => Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), null, 0.5, 1);
    await sleep(3000);
    moveTo(640, 600);

    // How far it hangs in.
    for (const mode of ['bar', 'island']) {
        set('barMode', mode);
        for (const drop of [0, 12, 24]) {
            set('islandDrop', drop);
            await sleep(900);
            const rest = where();
            volume();
            await sleep(700);
            note(`${mode} drop ${drop}: rest ${rest} | volume ${where()}`);
            if (drop === 24)
                await shot(`features-${mode}-drop-24`);
            await sleep(3000);
        }
    }
    set('islandDrop', 12);
    await sleep(900);
    await shot('features-island-drop-12');
    set('barMode', 'bar');
    set('islandDrop', 0);
    await sleep(1200);

    // Music, and what ticks for it.
    const media = source('MediaSource');
    const player = Object.assign(new EventEmitter(), {
        trackTitle: 'Lo-fi to study to', trackArtists: ['Track 4 of 32'], status: 'Playing', trackCoverUrl: '',
        canGoNext: true, canGoPrevious: true, app: null, _busName: null,
        _playerProxy: {Metadata: {'mpris:length': new GLib.Variant('x', 189e6)}},
        playPause() {}, next() {}, previous() {},
    });
    media._source?.disconnectObject(media);
    media._source = Object.assign(new EventEmitter(), {players: [player]});
    media._position = {at: GLib.get_monotonic_time() - 72e6, value: 0};
    media._choose();
    await sleep(3600);
    note(`music docked: docked=${island._docked} tick=${media._tick !== 0}`);
    await click(shape, 2);
    await sleep(1200);
    note(`music large: expanded=${island.expanded} tick=${media._tick !== 0} ${where()}`);
    await shot('features-media-large');
    set('islandWide', true);
    await sleep(1200);
    note(`music large, wide: ${where()}`);
    await shot('features-media-wide');
    set('islandWide', false);
    await sleep(1200);
    note(`music large, wide off: ${where()}`);
    moveTo(200, 600);
    await click(global.stage);
    await sleep(1200);
    note(`music closed: expanded=${island.expanded} tick=${media._tick !== 0}`);
    media._source = Object.assign(new EventEmitter(), {players: []});
    media._choose();
    await sleep(1500);

    // Another extension's button, kept in the bar.
    const button = new PanelMenu.Button(0.5, 'Test tray');
    button.add_child(new St.Icon({icon_name: 'face-smile-symbolic', style_class: 'system-status-icon'}));
    button.menu.addAction('Hello', () => {});
    Main.panel.addToStatusArea('test-tray', button);
    await sleep(800);
    const tile = () => extension._tiles.all.find(t => t.id === 'panel:test-tray');
    const tray = extension._bars.primary.trayBox;
    note(`tray tile: ${Boolean(tile())} shown=${extension._tiles.shown.includes(tile())} polling=${tile()?._poll !== 0}`);
    extension._qs.open(extension._bars.primary.statusPill);
    await sleep(600);
    note(`qs open: polling=${tile()?._poll !== 0}`);
    extension._qs.close({animated: false});
    await sleep(300);
    note(`qs closed: polling=${tile()?._poll !== 0}`);
    set('barIcons', ['panel:test-tray']);
    await sleep(800);
    note(`in the bar: parent is tray=${button.container.get_parent() === tray} tray visible=${tray.visible} tile shown=${extension._tiles.shown.some(t => t.id === 'panel:test-tray')}`);
    await shot('features-tray');
    await click(button);
    await sleep(500);
    note(`its menu opens: ${button.menu.isOpen}`);
    await shot('features-tray-menu');
    button.menu.close();
    await sleep(300);
    extension._qs.open(extension._bars.primary.statusPill);
    extension._qs.navigate('settings');
    await sleep(900);
    await shot('features-settings');
    extension._qs.close({animated: false});
    set('barIcons', []);
    await sleep(800);
    note(`back: parent is GNOME's=${button.container.get_parent() === Main.panel._rightBox} tray visible=${tray.visible}`);

    // The new events.
    const tell = async (name, fire) => {
        fire();
        await sleep(800);
        note(`${name}: ${where()} title=${island._pick().main?.data?.title ?? null}`);
        await shot(`features-${name}`);
        await sleep(6500);
    };
    await tell('updates', () => source('UpdatesSource')._tell(4));
    const health = source('HealthSource');
    const hot = GLib.build_filenamev([GLib.get_tmp_dir(), 'halo-hot']);
    GLib.file_set_contents(hot, '95000\n');
    health._zones = [hot];
    await tell('health', () => health._look());
    await tell('phone', () => source('PhoneSource')._battery('test', 'Pixel 9', 14, false));
    const weather = extension._weather;
    await tell('weather', () => {
        weather.soon = {rainIn: 20, rain: 0.9, warning: null};
        weather.emit('changed');
    });

    // An alarm from GNOME Clocks, as its notification comes in.
    const clocks = new MessageTray.Source({title: 'Clocks', icon: new Gio.ThemedIcon({name: 'alarm-symbolic'})});
    clocks._appId = 'org.gnome.clocks';
    Main.messageTray.add(clocks);
    const alarm = new MessageTray.Notification({source: clocks, title: 'Wake up', body: '07:00', urgency: MessageTray.Urgency.CRITICAL});
    alarm.addAction('Stop', () => note('alarm stopped'));
    alarm.addAction('Snooze', () => note('alarm snoozed'));
    clocks.addNotification(alarm);
    await sleep(1200);
    note(`alarm: kind=${island._pick().main?.kind} ${where()}`);
    await shot('features-alarm');
    volume();
    await sleep(600);
    note(`alarm with volume: main=${island._pick().main?.kind}`);
    alarm.destroy();
    await sleep(1200);
    note(`alarm gone: main=${island._pick().main?.kind ?? null}`);
    await sleep(3000);

    note(`timers now: media tick=${media._tick !== 0} tray poll=${tile()?._poll !== 0}`);
    button.destroy();
    await sleep(500);
}
