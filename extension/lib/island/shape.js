// The island's body: a dark rounded shape that springs to the size of what
// it holds. The shape may overshoot; what it holds only fades, so text
// never wobbles (design: "Form federt mit Überschwingen, Inhalt blendet
// ohne").

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {expressive, spring, SPRINGS, stopSprings, stretch} from '../shared/choreo.js';
import {roundedRect, setSource} from '../shared/paint.js';
import {ease, FADE} from '../shared/motion.js';

// Corners are round to half the height, but no rounder than this: a large
// island is a card, not a pill.
export const MAX_RADIUS = 32;
// Room around the shape for its shadow.
const SHADOW = 12;
const FADE_OUT_MS = 90;
const FADE_IN_MS = 170;
// The new content comes once the shape is most of the way.
const FADE_IN_DELAY_MS = 110;

export const IslandShape = GObject.registerClass({GTypeName: 'HaloIslandShape', Signals: {'moved': {}}},
class IslandShape extends St.Widget {
    _init(params = {}) {
        super._init({reactive: true, track_hover: true, ...params});
        this._w = 0;
        this._h = 0;
        this._color = '#000000';
        this._content = null;
        // Where the shape hangs from: its centre on x, its top on y.
        this._anchorX = 0;
        this._anchorY = 0;

        this._bg = new St.DrawingArea({reactive: false});
        this._bg.connect('repaint', () => this._draw());
        this.add_child(this._bg);
        this._clip = new St.Widget({clip_to_allocation: true, reactive: false});
        this.add_child(this._clip);
        this.connect('destroy', () => stopSprings(this));
    }

    get boxWidth() {
        return this._w;
    }

    set boxWidth(value) {
        this._w = Math.max(1, value);
        this._layout();
    }

    get boxHeight() {
        return this._h;
    }

    set boxHeight(value) {
        this._h = Math.max(1, value);
        this._layout();
    }

    get content() {
        return this._content;
    }

    setColor(color) {
        this._color = color;
        this._bg.queue_repaint();
    }

    // centreX, top: stage coordinates the shape grows from.
    setAnchor(centreX, top) {
        this._anchorX = Math.round(centreX);
        this._anchorY = Math.round(top);
        this._layout();
    }

    // Shows `actor` in the shape. The size is the actor's natural one unless
    // given. With animate, the shape springs and the old content fades; the
    // first content of a shape only fades in.
    setContent(actor, {width = null, height = null, animate = true} = {}) {
        // Measured on the stage, where its style is known.
        actor.opacity = 0;
        this._clip.add_child(actor);
        const [, naturalWidth] = actor.get_preferred_width(-1);
        const [, naturalHeight] = actor.get_preferred_height(width ?? naturalWidth);
        const w = Math.round(width ?? naturalWidth);
        const h = Math.round(height ?? naturalHeight);
        const old = this._content;
        this._content = actor;
        actor.set_size(w, h);

        const moving = animate && expressive() && this._w > 1;
        if (old) {
            old.remove_all_transitions();
            ease(old, {opacity: 0}, {duration: moving ? stretch(FADE_OUT_MS) : 0, mode: FADE, onComplete: () => old.destroy()});
        }
        if (animate && expressive()) {
            actor.ease({opacity: 255, duration: stretch(FADE_IN_MS), delay: moving ? stretch(FADE_IN_DELAY_MS) : 0, mode: FADE});
        } else {
            actor.opacity = 255;
        }

        this.resize(w, h, {animate: moving});
    }

    // Springs the shape to a size: past it on the way out, a small swing
    // on the way back.
    resize(w, h, {animate = true} = {}) {
        if (!animate || !expressive()) {
            stopSprings(this, ['boxWidth', 'boxHeight']);
            this._w = w;
            this._h = h;
            this._layout();
            return;
        }
        const growing = w * h >= this._w * this._h;
        spring(this, {boxWidth: w, boxHeight: h}, {spring: growing ? SPRINGS.grow : SPRINGS.shrink});
    }

    _layout() {
        const w = Math.round(this._w);
        const h = Math.round(this._h);
        const x = this._anchorX - Math.round(w / 2);
        // A spring sets width and height one after the other, and its tail
        // moves less than a pixel: the shape is redrawn only when it moved.
        const moved = x !== this.x || this._anchorY !== this.y || w !== this.width || h !== this.height;
        if (moved) {
            this.set_position(x, this._anchorY);
            this.set_size(w, h);
            this._clip.set_size(w, h);
            this._bg.set_position(-SHADOW, -SHADOW);
            this._bg.set_size(w + SHADOW * 2, h + SHADOW * 2);
        }
        // What it holds stays centred while the shape swings around it.
        for (const child of this._clip.get_children())
            child.set_position(Math.round((w - child.width) / 2), Math.round((h - child.height) / 2));
        if (moved) {
            this._bg.queue_repaint();
            this.emit('moved');
        }
    }

    _draw() {
        const cr = this._bg.get_context();
        const w = this._w;
        const h = this._h;
        const radius = Math.min(h / 2, w / 2, MAX_RADIUS);
        // A soft shadow below: a few wider rounded shapes, fainter outwards.
        for (let i = SHADOW; i > 0; i -= 3) {
            roundedRect(cr, SHADOW - i / 2, SHADOW - i / 4 + 2, w + i, h + i / 2, radius + i / 2);
            cr.setSourceRGBA(0, 0, 0, 0.035);
            cr.fill();
        }
        roundedRect(cr, SHADOW, SHADOW, w, h, radius);
        setSource(cr, this._color);
        cr.fill();
        cr.$dispose();
    }
});
