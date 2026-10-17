// The island's body: a dark rounded shape that springs to the size of what
// it holds. The shape may overshoot; what it holds only fades, so text
// never wobbles (design: "Form federt mit Überschwingen, Inhalt blendet
// ohne").

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {expressive, spring, SPRINGS, stopSprings, stretch} from '../shared/choreo.js';
import {ease, FADE} from '../shared/motion.js';

// Corners are round to half the height, but no rounder than this: a large
// island stays a soft pill, not a card.
export const MAX_RADIUS = 48;
// A soft shadow below. St draws it with the rounded box, so a frame of a
// spring only sets a size; nothing is rasterised by hand per frame.
const SHADOW = '0 3px 12px rgba(0, 0, 0, 0.22)';
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
        this._topTarget = null;
        // The size of what it holds, and room added around it (on hover).
        this._inner = {w: 0, h: 0};
        this._pad = {x: 0, y: 0};
        // Gone into the handle's grip: drawn as the grip, what it holds
        // faded out, hidden once there.
        this._tucked = null;

        this._bg = new St.Widget({reactive: false});
        this._bgStyle = '';
        this.add_child(this._bg);
        // A spring sets width, height and top one after the other; the shape
        // is laid out once per frame, just before it is drawn.
        this._later = 0;
        this._clip = new St.Widget({clip_to_allocation: true, reactive: false});
        this.add_child(this._clip);
        this.connect('destroy', () => {
            stopSprings(this);
            if (this._later)
                global.compositor.get_laters().remove(this._later);
            this._later = 0;
        });
    }

    _queueLayout() {
        if (this._later)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this._layout();
            return GLib.SOURCE_REMOVE;
        });
    }

    get boxWidth() {
        return this._w;
    }

    set boxWidth(value) {
        this._w = Math.max(1, value);
        this._queueLayout();
    }

    get boxHeight() {
        return this._h;
    }

    set boxHeight(value) {
        this._h = Math.max(1, value);
        this._queueLayout();
    }

    // The height of what it holds, without the room around it.
    get innerHeight() {
        return this._inner.h || this._h;
    }

    // The room around what it holds: {x, y} on each side.
    get pad() {
        return this._pad;
    }

    get content() {
        return this._content;
    }

    setColor(color) {
        this._color = color;
        this._paintBody();
    }

    get boxTop() {
        return this._anchorY;
    }

    set boxTop(value) {
        this._anchorY = value;
        this._queueLayout();
    }

    // centreX, top: stage coordinates the shape grows from. With animate a
    // new top is sprung to (down below the bar and back up), the x follows
    // at once.
    setAnchor(centreX, top, {animate = false} = {}) {
        top = Math.round(top);
        this._anchorX = Math.round(centreX);
        if (top === this._topTarget) {
            this._layout();
            return;
        }
        const down = this._topTarget !== null && top > this._topTarget;
        this._topTarget = top;
        if (animate && expressive() && this._w > 1) {
            spring(this, {boxTop: top}, {spring: down ? SPRINGS.grow : SPRINGS.shrink});
        } else {
            stopSprings(this, ['boxTop']);
            this.boxTop = top;
        }
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

    // Room around what it holds, on each side: the shape grows past its
    // content, wider and downwards, while the content keeps its size and
    // stays sharp.
    setPad(x, y, {animate = true} = {}) {
        if (x === this._pad.x && y === this._pad.y)
            return;
        this._pad = {x, y};
        if (this._inner.w)
            this.resize(this._inner.w, this._inner.h, {animate, spring: SPRINGS.hover});
    }

    get tucked() {
        return Boolean(this._tucked);
    }

    // Sinks into the grip of "handle" mode: the shape springs to the grip's
    // size while what it holds fades, and hides once there, so the grip
    // seems to have swallowed it. onDone: it is there and hidden.
    tuck(width, height, {animate = true, onDone = null} = {}) {
        const key = `${width}x${height}`;
        if (this._tucked?.key === key) {
            // Asked again: on its way, or already there and hidden.
            if (this._tucked.there)
                this.visible = false;
            return;
        }
        const tucked = {key, there: false};
        this._tucked = tucked;
        const moving = animate && expressive() && this._w > 1 && this.visible;
        this._clip.remove_all_transitions();
        ease(this._clip, {opacity: 0}, {duration: moving ? stretch(FADE_OUT_MS) : 0, mode: FADE});
        const there = () => {
            if (this._tucked !== tucked)
                return;
            tucked.there = true;
            this.visible = false;
            onDone?.();
        };
        if (!moving) {
            stopSprings(this, ['boxWidth', 'boxHeight']);
            this._w = width;
            this._h = height;
            this._layout();
            there();
            return;
        }
        spring(this, {boxWidth: width, boxHeight: height}, {spring: SPRINGS.shrink, onDone: there});
    }

    // Grows back out of the grip to what it holds.
    untuck({animate = true} = {}) {
        if (!this._tucked)
            return;
        this._tucked = null;
        this.visible = true;
        const moving = animate && expressive();
        this._clip.remove_all_transitions();
        if (moving)
            this._clip.ease({opacity: 255, duration: stretch(FADE_IN_MS), delay: stretch(FADE_IN_DELAY_MS), mode: FADE});
        else
            this._clip.opacity = 255;
        if (this._inner.w)
            this.resize(this._inner.w, this._inner.h, {animate: moving});
    }

    // Springs the shape to a size (of what it holds; the pad comes on top):
    // past it on the way out, a small swing on the way back. In the grip it
    // only remembers the size for when it comes out.
    resize(innerW, innerH, {animate = true, spring: chosen = null} = {}) {
        this._inner = {w: innerW, h: innerH};
        if (this._tucked)
            return;
        const w = innerW + 2 * this._pad.x;
        const h = innerH + 2 * this._pad.y;
        if (!animate || !expressive()) {
            stopSprings(this, ['boxWidth', 'boxHeight']);
            this._w = w;
            this._h = h;
            this._layout();
            return;
        }
        const growing = w * h >= this._w * this._h;
        spring(this, {boxWidth: w, boxHeight: h}, {spring: chosen ?? (growing ? SPRINGS.grow : SPRINGS.shrink)});
    }

    _layout() {
        const w = Math.round(this._w);
        const h = Math.round(this._h);
        const x = this._anchorX - Math.round(w / 2);
        const y = Math.round(this._anchorY);
        // A spring sets width and height one after the other, and its tail
        // moves less than a pixel: the shape is redrawn only when it moved.
        const moved = x !== this.x || y !== this.y || w !== this.width || h !== this.height;
        if (moved) {
            this.set_position(x, y);
            this.set_size(w, h);
            this._clip.set_size(w, h);
            this._bg.set_size(w, h);
        }
        // What it holds stays centred while the shape swings around it.
        for (const child of this._clip.get_children())
            child.set_position(Math.round((w - child.width) / 2), Math.round((h - child.height) / 2));
        if (moved) {
            this._paintBody();
            this.emit('moved');
        }
    }

    // The style changes only when the colour or the rounded radius does.
    _paintBody() {
        const radius = Math.round(Math.min(this._h / 2, this._w / 2, MAX_RADIUS));
        const style = `background-color: ${this._color}; border-radius: ${radius}px; box-shadow: ${SHADOW};`;
        if (style !== this._bgStyle) {
            this._bgStyle = style;
            this._bg.set_style(style);
        }
    }
});
