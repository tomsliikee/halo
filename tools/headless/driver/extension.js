// Loads the script named in HALO_SCRIPT and hands it what it needs to
// drive Halo: the running extension, a virtual pointer, and screenshots.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const OUT = GLib.getenv('HALO_OUT');
const sleep = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

async function shot(name) {
    const stream = Gio.File.new_for_path(`${OUT}/shots/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    const screenshot = new Shell.Screenshot();
    await new Promise(resolve => screenshot.screenshot(false, stream, (_source, result) => {
        try {
            screenshot.screenshot_finish(result);
        } catch (e) {
            logError(e);
        }
        resolve();
    }));
    stream.close(null);
}

const lines = [];
function note(line) {
    lines.push(line);
    GLib.file_set_contents(`${OUT}/log.txt`, `${lines.join('\n')}\n`);
}

export default class Driver extends Extension {
    enable() {
        this._run().catch(e => {
            note(`DRIVER ERROR ${e.message}\n${e.stack}`);
            global.context.terminate();
        });
    }

    disable() {}

    async _run() {
        // The shell starts in the overview, and its start-up animation may
        // bring it back once after it was left; it has to stay away.
        await sleep(3000);
        for (let calm = 0, tries = 0; calm < 8 && tries < 60; tries++) {
            if (Main.layoutManager._startingUp || Main.overview.visible) {
                calm = 0;
                if (!Main.layoutManager._startingUp)
                    Main.overview.hide();
            } else {
                calm++;
            }
            await sleep(250);
        }
        const halo = Main.extensionManager.lookup('halo@thomashaiden');
        if (!halo?.stateObj?._settings)
            throw new Error(`Halo is not running: ${halo?.error}`);
        const seat = Clutter.get_default_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const time = () => GLib.get_monotonic_time();
        // The very first motion of a virtual pointer arrives without its y.
        pointer.notify_absolute_motion(time(), 640, 300);
        const script = await import(`file://${GLib.getenv('HALO_SCRIPT')}`);
        await script.default({
            extension: halo.stateObj,
            shot, sleep, note, Main,
            desktop: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
            moveTo: (x, y) => pointer.notify_absolute_motion(time(), x, y),
            // Moves the pointer by dx, dy as a mouse does, so a barrier feels it.
            nudge: (dx, dy) => pointer.notify_relative_motion(time(), dx, dy),
            // A two-finger touchpad scroll by dx, dy.
            swipe: (dx, dy) => pointer.notify_scroll_continuous(time(), dx, dy, Clutter.ScrollSource.FINGER, Clutter.ScrollFinishFlags.NONE),
            // Holds the primary button down or lets it go, for drags.
            hold: down => pointer.notify_button(time(), Clutter.BUTTON_PRIMARY,
                down ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED),
            move: actor => {
                const [x, y] = actor.get_transformed_position();
                const [w, h] = actor.get_transformed_size();
                pointer.notify_absolute_motion(time(), x + w / 2, y + h / 2);
            },
            click: async (actor, button = Clutter.BUTTON_PRIMARY) => {
                const [x, y] = actor.get_transformed_position();
                const [w, h] = actor.get_transformed_size();
                pointer.notify_absolute_motion(time(), x + w / 2, y + h / 2);
                await sleep(100);
                pointer.notify_button(time(), button, Clutter.ButtonState.PRESSED);
                await sleep(60);
                pointer.notify_button(time(), button, Clutter.ButtonState.RELEASED);
            },
            // Opens a window of an app and waits until it is mapped.
            launch: async (id, wait = 2500) => {
                Shell.AppSystem.get_default().lookup_app(id)?.open_new_window(-1);
                await sleep(wait);
            },
            set: (key, value) => halo.stateObj._settings.set(key, value),
        });
        global.context.terminate();
    }
}
