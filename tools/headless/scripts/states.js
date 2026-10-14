// Sample states the headless shell cannot produce: a recording with the
// microphone on, a low battery, two keyboard layouts and unread
// notifications; then a fullscreen window hiding the bar.
export default async function ({extension, shot, sleep, note, set, launch, desktop, Main, moveTo}) {
    const system = extension._system;
    const fake = values => {
        for (const [key, value] of Object.entries(values))
            Object.defineProperty(system, key, {value, configurable: true});
        system.emit('changed');
    };
    await launch('org.gnome.TextEditor.desktop', 3000);
    fake({recordingSeconds: 134, microphone: true, camera: false, screenSharing: false, keyboardLayout: 'de', unread: true,
        battery: {percent: 12, charging: false, full: false, secondsLeft: 2400}});
    await sleep(900);
    await shot('recording-low');
    fake({recordingSeconds: null, microphone: false, camera: true, screenSharing: true,
        battery: {percent: 64, charging: false, full: false, secondsLeft: 12000}});
    await sleep(900);
    await shot('camera-sharing');
    desktop.set_string('color-scheme', 'prefer-dark');
    await sleep(700);
    await shot('dark-full');
    desktop.set_string('color-scheme', 'default');
    const window = global.display.focus_window;
    window?.make_fullscreen();
    await sleep(1500);
    const bar = extension._bars.primary;
    note(`fullscreen: bar visible=${bar.actor.visible} edge visible=${extension._bars._edge.visible}`);
    await shot('fullscreen');
    moveTo(640, 0);
    await sleep(1200);
    note(`peek: bar visible=${bar.actor.visible} translation=${bar.actor.translation_y}`);
    await shot('fullscreen-peek');
    moveTo(640, 400);
    await sleep(1200);
    note(`after peek: bar visible=${bar.actor.visible}`);
    window?.unmake_fullscreen();
    await sleep(1200);
    note(`unfullscreen: bar visible=${bar.actor.visible} translation=${bar.actor.translation_y}`);
}
