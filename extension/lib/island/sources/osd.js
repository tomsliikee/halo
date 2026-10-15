// Volume, brightness and the other on-screen displays: GNOME's own windows
// stay quiet and the island shows the level instead. GNOME shows one
// through OsdWindowManager._showOsdWindow, for every way in (the volume
// keys, the brightness keys, gnome-settings-daemon over D-Bus), so that one
// method is shadowed on the manager and given back on destroy.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {percentText} from '../../bar/words.js';
import {isMuted, levelShare, osdIcon, osdKind} from '../words.js';

// How long a level stays after the last change.
const LEVEL_MS = 1600;

// Which of Halo's switches covers which kind of display.
const EVENTS = {volume: 'volume', microphone: 'volume', brightness: 'brightness', keyboardLight: 'brightness', other: 'settings'};

export class OsdSource {
    constructor(island) {
        this._island = island;
        this._manager = Main.osdWindowManager;
        const original = this._manager._showOsdWindow;
        this._manager._showOsdWindow = (monitorIndex, gicon, label, level, maxLevel) => {
            if (!this._show(monitorIndex, gicon, label, level, maxLevel))
                original.call(this._manager, monitorIndex, gicon, label, level, maxLevel);
        };
    }

    destroy() {
        // The prototype's method comes back.
        delete this._manager._showOsdWindow;
    }

    // Returns false when GNOME should show it after all.
    _show(monitorIndex, gicon, label, level, maxLevel) {
        const iconName = gicon?.get_names?.()[0] ?? gicon?.to_string?.() ?? '';
        const kind = osdKind(iconName);
        if (!this._island.allows(EVENTS[kind]))
            return false;
        // Only the main monitor has an island; the others stay quiet too.
        if (monitorIndex !== Main.layoutManager.primaryIndex)
            return true;
        const muted = isMuted(iconName);
        const hasLevel = typeof level === 'number' && level >= 0;
        const share = hasLevel ? levelShare(level, maxLevel) : 0;
        if (muted && kind === 'volume') {
            this._island.set({id: 'osd', kind: 'volume', hint: true, duration: LEVEL_MS, view: 'symbol', data: {icon: osdIcon(kind, 0, true)}});
            return true;
        }
        if (!hasLevel) {
            // A display without a level: caps lock, the touchpad, a monitor.
            this._island.set({
                id: 'osd', kind: 'settings', hint: true, duration: LEVEL_MS, view: 'info',
                data: {icon: osdIcon(kind, 0, muted), gicon, title: label || 'Changed', note: null},
            });
            return true;
        }
        this._island.set({
            id: 'osd', kind, hint: true, duration: LEVEL_MS, view: 'level',
            data: {icon: osdIcon(kind, share, muted), muted, share, text: percentText(level * 100)},
        });
        return true;
    }
}
