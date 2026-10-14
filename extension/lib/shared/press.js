// A short spring on press and release, for anything that can be clicked.

import Clutter from 'gi://Clutter';

import {spring, SPRINGS} from './choreo.js';

const KEYS = [Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_space];

// Makes an actor answer a primary or secondary click with a short press,
// without St.Button, whose press in GNOME 50 travels on to the parent.
// With focus, Return and Space click it too. onClick(event, button) gets
// a null event from the keyboard.
export function pressable(actor, onClick, {scale = 0.94, focus = false} = {}) {
    actor.reactive = true;
    actor.track_hover = true;
    actor.can_focus = focus;
    actor.set_pivot_point(0.5, 0.5);
    let pressed = 0;
    actor.connect('key-press-event', (_actor, event) => {
        if (!KEYS.includes(event.get_key_symbol()))
            return Clutter.EVENT_PROPAGATE;
        onClick(null, Clutter.BUTTON_PRIMARY);
        return Clutter.EVENT_STOP;
    });
    actor.connect('button-press-event', (_actor, event) => {
        pressed = event.get_button();
        spring(actor, {scale_x: scale, scale_y: scale}, {spring: SPRINGS.press});
        return Clutter.EVENT_STOP;
    });
    actor.connect('button-release-event', (_actor, event) => {
        const button = pressed;
        pressed = 0;
        spring(actor, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.release});
        if (button && button === event.get_button())
            onClick(event, button);
        return Clutter.EVENT_STOP;
    });
    actor.connect('leave-event', () => {
        if (pressed) {
            pressed = 0;
            spring(actor, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.release});
        }
    });
}
