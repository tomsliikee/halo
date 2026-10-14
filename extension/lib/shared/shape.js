// HaloShape: an expressive shape filled with Cairo, since St cannot use a
// path as a background. A change of shape morphs point by point.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {SPATIAL, STATE_MS, animate} from './motion.js';
import {setSource, polygon} from './paint.js';
import {CIRCLE, outline} from './shapes.js';

const SPIN_MS = 20000;

export const HaloShape = GObject.registerClass({GTypeName: 'HaloShape'},
class HaloShape extends St.DrawingArea {
    _init({size, shape = CIRCLE, color = '#000000', shadow = false, ...params} = {}) {
        super._init({width: size, height: size, ...params});
        // Unit outlines (centre 0, radius 1); drawing scales them.
        this._from = outline(shape, 0, 0, 1);
        this._to = shape;
        this._target = this._from;
        this._t = 1;
        this._color = color;
        this._alpha = 1;
        this._shadow = shadow;
        this._tween = null;
        this._angle = 0;
        this._spin = null;
        this.connect('repaint', () => this._draw());
        this.connect('destroy', () => {
            this._tween?.stop();
            this._spin?.stop();
        });
    }

    // A slow turn while nothing happens, one round in SPIN_MS.
    setSpin(on) {
        if (Boolean(this._spin) === on)
            return;
        if (!on) {
            this._spin.stop();
            this._spin = null;
            return;
        }
        this._spin = new Clutter.Timeline({actor: this, duration: SPIN_MS, repeat_count: -1});
        const start = this._angle;
        this._spin.connect('new-frame', () => {
            this._angle = start + this._spin.get_progress() * 2 * Math.PI;
            this.queue_repaint();
        });
        this._spin.start();
    }

    setShape(shape, {animated = true} = {}) {
        if (shape.n === this._to.n && shape.a === this._to.a)
            return;
        this._tween?.stop();
        this._tween = null;
        // A morph that is cut short starts from where it stands.
        this._from = this._current();
        this._to = shape;
        this._target = outline(shape, 0, 0, 1);
        if (!animated) {
            this._t = 1;
            this.queue_repaint();
            return;
        }
        this._t = 0;
        this._tween = animate(this, STATE_MS, progress => {
            this._t = progress;
            this.queue_repaint();
        }, {mode: SPATIAL});
    }

    _current() {
        const t = this._t;
        return this._from.map(([x, y], i) => [x + (this._target[i][0] - x) * t, y + (this._target[i][1] - y) * t]);
    }

    setColor(color, alpha = 1) {
        this._color = color;
        this._alpha = alpha;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        // A soft shadow below needs room, so the shape stays a little smaller.
        const inset = this._shadow ? 3 : 0;
        const cx = width / 2;
        const cy = height / 2 - (this._shadow ? 1 : 0);
        const cos = Math.cos(this._angle);
        const sin = Math.sin(this._angle);
        const turned = this._current().map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
        // A tile's corners reach past the unit circle; the shape is scaled
        // so it always fits its square, also while it turns.
        const reach = Math.max(1, ...turned.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
        const r = (Math.min(width, height) / 2 - inset) / reach;
        const points = turned.map(([x, y]) => [cx + x * r, cy + y * r]);
        if (this._shadow) {
            cr.save();
            cr.translate(0, 2);
            polygon(cr, points);
            cr.setSourceRGBA(0, 0, 0, 0.14);
            cr.fill();
            cr.restore();
        }
        polygon(cr, points);
        setSource(cr, this._color, this._alpha);
        cr.fill();
        cr.$dispose();
    }
});
