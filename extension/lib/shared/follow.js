// Calls onMove whenever an actor may have moved on the stage: it or any of
// its parents was laid out again, moved by a translation, shown or hidden.
// Returns a function that stops following.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SIGNALS = ['notify::allocation', 'notify::translation-x', 'notify::translation-y', 'notify::visible', 'notify::mapped'];

export function follow(actor, onMove) {
    const owner = {};
    const followed = [];
    for (let current = actor; current && current !== Main.layoutManager.uiGroup; current = current.get_parent()) {
        current.connectObject(...SIGNALS.flatMap(signal => [signal, () => onMove()]), owner);
        followed.push(current);
    }
    return () => {
        for (const current of followed)
            current.disconnectObject(owner);
    };
}
