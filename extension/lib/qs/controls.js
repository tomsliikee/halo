// The controls of the quick settings, drawn after the design system: the
// switch with a check in its thumb, the expressive slider with a handle
// that stands apart from its track, and the round icon button.

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {spring, SPRINGS} from '../shared/choreo.js';
import {icon, setIcon} from '../shared/icons.js';
import {roundedRect, setSource} from '../shared/paint.js';
import {mix} from '../shared/palettes.js';
import {pressable} from '../shared/press.js';

const SWITCH_WIDTH = 52;
const SWITCH_HEIGHT = 32;
const SWITCH_BORDER = 2;
const THUMB_OFF = 16;
const THUMB_ON = 24;
const CHECK_STROKE = 2;

function check(cr, cx, cy, size) {
    cr.setLineWidth(CHECK_STROKE);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineJoin(Cairo.LineJoin.ROUND);
    cr.moveTo(cx - size * 0.45, cy + size * 0.02);
    cr.lineTo(cx - size * 0.12, cy + size * 0.32);
    cr.lineTo(cx + size * 0.48, cy - size * 0.3);
    cr.stroke();
}

// Material 3's switch. Off, an outlined track with a small thumb on the
// left; on, a filled track with a large thumb on the right that carries
// a check. The thumb springs across and grows.
export const HaloSwitch = GObject.registerClass({GTypeName: 'HaloSwitch'},
class HaloSwitch extends St.DrawingArea {
    _init({theme, onToggle = null, accessibleName = ''}) {
        super._init({
            width: SWITCH_WIDTH,
            height: SWITCH_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: accessibleName,
            accessible_role: 'toggle-button',
        });
        this._theme = theme;
        this._position = 0;
        this._on = false;
        this.connect('repaint', () => this._draw());
        this._theme.connectObject('changed', () => this.queue_repaint(), this);
        this.connect('destroy', () => this._theme.disconnectObject(this));
        if (onToggle)
            pressable(this, () => onToggle(!this._on), {scale: 0.9, focus: true});
    }

    get on() {
        return this._on;
    }

    // 0 off, 1 on; springs may pass 1 a little.
    get position() {
        return this._position;
    }

    set position(value) {
        this._position = value;
        this.queue_repaint();
    }

    set(on, {animated = true} = {}) {
        if (on === this._on)
            return;
        this._on = on;
        if (animated)
            spring(this, {position: on ? 1 : 0}, {spring: SPRINGS.glide});
        else
            this.position = on ? 1 : 0;
    }

    _draw() {
        const cr = this.get_context();
        const roles = this._theme.roles;
        const on = Math.max(0, Math.min(1, this._position));
        const travel = SWITCH_WIDTH - SWITCH_HEIGHT;

        roundedRect(cr, 0, 0, SWITCH_WIDTH, SWITCH_HEIGHT, SWITCH_HEIGHT / 2);
        setSource(cr, mix(roles.highest, roles.primary, on));
        cr.fill();
        if (on < 1) {
            roundedRect(cr, SWITCH_BORDER / 2, SWITCH_BORDER / 2, SWITCH_WIDTH - SWITCH_BORDER,
                SWITCH_HEIGHT - SWITCH_BORDER, (SWITCH_HEIGHT - SWITCH_BORDER) / 2);
            setSource(cr, roles.outline, 1 - on);
            cr.setLineWidth(SWITCH_BORDER);
            cr.stroke();
        }

        // The spring may carry the thumb a little past its end.
        const cx = SWITCH_HEIGHT / 2 + travel * this._position;
        const radius = (THUMB_OFF + (THUMB_ON - THUMB_OFF) * on) / 2;
        cr.arc(cx, SWITCH_HEIGHT / 2, radius, 0, 2 * Math.PI);
        setSource(cr, mix(roles.outline, roles.onPrimary, on));
        cr.fill();
        if (on > 0.5) {
            setSource(cr, roles.primary, (on - 0.5) * 2);
            check(cr, cx, SWITCH_HEIGHT / 2, 12);
        }
        cr.$dispose();
    }
});

const SLIDER_HEIGHT = 52;
const TRACK = 44;
const HANDLE = 4;
const HANDLE_PRESSED = 2;
const GAP = 6;
const OUTER = 16;
const INNER = 4;
const STOP = 4;
const SLIDER_ICON = 20;
const SCROLL_STEP = 0.05;
const ICON_X = 14;

// Material 3 Expressive's slider: the filled part carries the icon, a
// slim handle stands between it and the rest, and a dot marks the end.
// The handle thins while it is held. value runs from 0 to max.
export const HaloSlider = GObject.registerClass({GTypeName: 'HaloSlider'},
class HaloSlider extends St.Widget {
    _init({theme, iconName, max = 1, onChange, onIcon = null, accessibleName = ''}) {
        super._init({
            height: SLIDER_HEIGHT,
            x_expand: true,
            reactive: true,
            can_focus: true,
            accessible_name: accessibleName,
            accessible_role: 'slider',
        });
        this._theme = theme;
        this._value = 0;
        this._max = max;
        this._handle = HANDLE;
        this._onChange = onChange;
        this._onIcon = onIcon;
        this._dragging = false;
        this._pressX = 0;
        this._moved = false;
        this._grab = null;

        // The drawing fills the slider; the icon sits at the start of the track.
        this._area = new St.DrawingArea();
        this._area.add_constraint(new Clutter.BindConstraint({source: this, coordinate: Clutter.BindCoordinate.SIZE}));
        this._area.connect('repaint', () => this._draw());
        this.add_child(this._area);
        this._icon = icon(iconName, {size: SLIDER_ICON});
        this._icon.set_position(ICON_X, (SLIDER_HEIGHT - SLIDER_ICON) / 2);
        this.add_child(this._icon);

        this._theme.connectObject('changed', () => this._repaint(), this);
        this.connect('destroy', () => {
            this._theme.disconnectObject(this);
            this._grab?.dismiss();
            this._grab = null;
        });
        this.connect('notify::width', () => this._repaint());
        this.connect('notify::mapped', () => this._repaint());
        this.connect('button-press-event', (_actor, event) => this._press(event));
        this.connect('motion-event', (_actor, event) => this._motion(event));
        this.connect('button-release-event', (_actor, event) => this._release(event));
        this.connect('touch-event', (_actor, event) => this._touch(event));
        this.connect('scroll-event', (_actor, event) => this._scroll(event));
        this.connect('key-press-event', (_actor, event) => this._key(event));
    }

    // The handle's width; springs while it is held.
    get handle() {
        return this._handle;
    }

    set handle(value) {
        this._handle = value;
        this._area.queue_repaint();
    }

    get value() {
        return this._value;
    }

    setIcon(name) {
        setIcon(this._icon, name);
    }

    setMax(max) {
        this._max = Math.max(1, max);
        this._repaint();
    }

    // From outside: ignored while the pointer holds the handle.
    setValue(value) {
        if (this._dragging)
            return;
        this._value = Math.max(0, Math.min(this._max, value));
        this._repaint();
    }

    _set(value) {
        const next = Math.max(0, Math.min(this._max, value));
        if (next === this._value)
            return;
        this._value = next;
        this._repaint();
        this._onChange(next);
    }

    _valueAt(stageX) {
        const [x] = this.get_transformed_position();
        const width = this.width;
        const usable = Math.max(1, width - 2 * GAP);
        return ((stageX - x - GAP) / usable) * this._max;
    }

    _iconZone(stageX) {
        const [x] = this.get_transformed_position();
        return stageX - x < ICON_X + SLIDER_ICON + 10;
    }

    _press(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const [stageX] = event.get_coords();
        this._begin(stageX);
        return Clutter.EVENT_STOP;
    }

    _begin(stageX) {
        this._dragging = true;
        this._pressX = stageX;
        this._moved = false;
        this._grab = global.stage.grab(this);
        spring(this, {handle: HANDLE_PRESSED}, {spring: SPRINGS.press});
        // A tap on the icon is for the icon, so the value waits for a move.
        if (!(this._onIcon && this._iconZone(stageX)))
            this._set(this._valueAt(stageX));
    }

    _motion(event) {
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;
        const [stageX] = event.get_coords();
        if (Math.abs(stageX - this._pressX) > 3)
            this._moved = true;
        if (this._moved || !this._onIcon)
            this._set(this._valueAt(stageX));
        return Clutter.EVENT_STOP;
    }

    _release(event) {
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;
        const [stageX] = event.get_coords();
        this._end(stageX);
        return Clutter.EVENT_STOP;
    }

    _end(stageX) {
        this._dragging = false;
        this._grab?.dismiss();
        this._grab = null;
        spring(this, {handle: HANDLE}, {spring: SPRINGS.release});
        if (!this._moved && this._onIcon && this._iconZone(stageX))
            this._onIcon();
    }

    _touch(event) {
        const [stageX] = event.get_coords();
        switch (event.type()) {
        case Clutter.EventType.TOUCH_BEGIN:
            this._begin(stageX);
            return Clutter.EVENT_STOP;
        case Clutter.EventType.TOUCH_UPDATE:
            if (this._dragging) {
                this._moved = true;
                this._set(this._valueAt(stageX));
            }
            return Clutter.EVENT_STOP;
        case Clutter.EventType.TOUCH_END:
        case Clutter.EventType.TOUCH_CANCEL:
            if (this._dragging)
                this._end(stageX);
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _scroll(event) {
        const direction = event.get_scroll_direction();
        let step = 0;
        if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.RIGHT)
            step = SCROLL_STEP;
        else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.LEFT)
            step = -SCROLL_STEP;
        else if (direction === Clutter.ScrollDirection.SMOOTH)
            step = -event.get_scroll_delta()[1] * SCROLL_STEP;
        if (step !== 0)
            this._set(this._value + step * this._max);
        return Clutter.EVENT_STOP;
    }

    _key(event) {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Right || symbol === Clutter.KEY_Up)
            this._set(this._value + SCROLL_STEP * this._max);
        else if (symbol === Clutter.KEY_Left || symbol === Clutter.KEY_Down)
            this._set(this._value - SCROLL_STEP * this._max);
        else
            return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    }

    _split() {
        const width = this.width;
        const share = this._max > 0 ? this._value / this._max : 0;
        return GAP + share * Math.max(0, width - 2 * GAP);
    }

    _repaint() {
        // Sizes are only known on the stage.
        if (!this.get_stage())
            return;
        this._area.queue_repaint();
        // The icon sits on the filled part while it fits, else on the rest.
        const roles = this._theme.roles;
        const onFill = this._split() - GAP - this._handle / 2 >= ICON_X + SLIDER_ICON + 6;
        this._icon.set_style(`color: ${onFill ? roles.onPrimary : roles.onPc};`);
    }

    _draw() {
        const cr = this._area.get_context();
        const [width, height] = this._area.get_surface_size();
        const roles = this._theme.roles;
        const top = (height - TRACK) / 2;
        const split = this._split();
        const left = split - GAP - this._handle / 2;
        const right = split + GAP + this._handle / 2;

        if (left > 0) {
            roundedRect(cr, 0, top, left, TRACK, [OUTER, INNER, INNER, OUTER]);
            setSource(cr, roles.primary);
            cr.fill();
        }
        if (right < width) {
            roundedRect(cr, right, top, width - right, TRACK, [INNER, OUTER, OUTER, INNER]);
            setSource(cr, roles.pc);
            cr.fill();
            // The stop at the end, while the rest is long enough to show it.
            if (width - right > OUTER + STOP) {
                cr.arc(width - OUTER, height / 2, STOP / 2, 0, 2 * Math.PI);
                setSource(cr, roles.primary);
                cr.fill();
            }
        }
        roundedRect(cr, split - this._handle / 2, 0, this._handle, height, this._handle / 2);
        setSource(cr, roles.primary);
        cr.fill();
        cr.$dispose();
    }
});

// A round icon button, 44px, as in the header and beside the sliders.
export function roundButton(iconName, onClick, {styleClass = '', accessibleName = ''} = {}) {
    const button = new St.Bin({
        style_class: `halo-qs-round ${styleClass}`,
        child: icon(iconName, {size: 20}),
        accessible_name: accessibleName,
        accessible_role: 'push-button',
        y_align: Clutter.ActorAlign.CENTER,
    });
    pressable(button, () => onClick(button), {scale: 0.88, focus: true});
    return button;
}
