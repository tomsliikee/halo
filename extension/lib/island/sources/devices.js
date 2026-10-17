// Keys that lock (Caps Lock, Num Lock) and drives that come and go: a short
// word each. A change is told only after the first reading.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {driveText, lockTitle} from '../words.js';

export class DevicesSource {
    constructor(island) {
        this._island = island;
        this._keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this._caps = this._keymap.get_caps_lock_state();
        this._num = this._keymap.get_num_lock_state();
        this._keymap.connectObject('state-changed', () => this._keys(), this);
        this._volumes = Gio.VolumeMonitor.get();
        this._volumes.connectObject(
            'mount-added', (_monitor, mount) => this._mount(mount, true),
            'mount-removed', (_monitor, mount) => this._mount(mount, false), this);
    }

    destroy() {
        this._keymap.disconnectObject(this);
        this._volumes.disconnectObject(this);
    }

    _keys() {
        const caps = this._keymap.get_caps_lock_state();
        const num = this._keymap.get_num_lock_state();
        if (caps !== this._caps)
            this._lock('caps', caps);
        else if (num !== this._num)
            this._lock('num', num);
        this._caps = caps;
        this._num = num;
    }

    _lock(kind, on) {
        if (!this._island.allows('locks'))
            return;
        this._island.set({
            id: 'hint:lock', kind: 'locks', hint: true, duration: 1500, view: 'info',
            data: {icon: kind === 'caps' ? 'keyboard-capslock' : 'dialpad', tone: on ? 'primary' : 'soft', square: true, title: lockTitle(kind, on)},
        });
    }

    // Only drives one can take out; the system's own mounts stay quiet.
    _mount(mount, added) {
        if (!this._island.allows('drives') || !(mount.can_eject() || mount.can_unmount()) || mount.is_shadowed())
            return;
        const {title, note} = driveText(mount.get_name(), added);
        const root = mount.get_root();
        this._island.set({
            id: `hint:drive:${root.get_uri()}`, kind: 'drives', hint: true, duration: 4000, view: 'info',
            data: {icon: 'usb', tone: 'tertiary', square: true, title, note},
            onClick: added ? () => {
                try {
                    Gio.AppInfo.launch_default_for_uri(root.get_uri(), global.create_app_launch_context(0, -1));
                } catch (e) {
                    logError(e, 'Halo: cannot open the drive');
                }
            } : null,
        });
    }
}
