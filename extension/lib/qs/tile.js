// One tile of the quick settings: an icon in a circle, a title and a note,
// and a chevron when it leads to a page. On, it fills with the loud colour
// and its circle pops; a press squeezes it a little.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {spring, SPRINGS} from '../shared/choreo.js';
import {icon, iconGicon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';

const ICON = 20;

export class TileView {
    // tile: a model from tiles.js; onPage(tile) opens its page.
    constructor(tile, onPage) {
        this.tile = tile;
        this._onPage = onPage;
        this._active = null;

        this.actor = new St.BoxLayout({
            style_class: 'halo-tile',
            x_expand: true,
            accessible_role: 'toggle-button',
        });
        this._icon = new St.Icon({icon_size: ICON});
        this._circle = new St.Bin({style_class: 'halo-tile-icon', child: this._icon, y_align: Clutter.ActorAlign.CENTER});
        this._circle.set_pivot_point(0.5, 0.5);
        this.actor.add_child(this._circle);

        const words = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'halo-tile-words',
        });
        this._title = text('qs-tile', {styleClass: 'halo-tile-title', ellipsize: true});
        this._note = text('qs-tile-note', {styleClass: 'halo-tile-note', ellipsize: true});
        words.add_child(this._title);
        words.add_child(this._note);
        this.actor.add_child(words);

        this._chevron = new St.Bin({
            style_class: 'halo-tile-chevron',
            child: icon('chevron-right', {size: 18}),
            y_expand: true,
            accessible_name: 'Open',
            accessible_role: 'push-button',
        });
        this.actor.add_child(this._chevron);
        pressable(this._chevron, () => this._onPage(this.tile), {scale: 0.8});

        pressable(this.actor, () => {
            if (this.tile.switches)
                this.tile.activate();
            else if (this.tile.page)
                this._onPage(this.tile);
        }, {scale: 0.96, focus: true});

        tile.connectObject('changed', () => this._update(), this);
        this.actor.connect('destroy', () => tile.disconnectObject(this));
        this._update();
    }

    _update() {
        const tile = this.tile;
        this._title.text = tile.title;
        this._note.text = tile.note;
        this._note.visible = Boolean(tile.note);
        this.actor.accessible_name = tile.note ? `${tile.title}, ${tile.note}` : tile.title;

        if (tile.drawn) {
            if (this._clone?.source !== tile.drawn) {
                const [, height] = tile.drawn.get_preferred_height(-1);
                const scale = height > 0 ? ICON / height : 1;
                this._clone = new Clutter.Clone({source: tile.drawn, scale_x: scale, scale_y: scale});
                this._circle.child = this._clone;
            }
        } else {
            if (this._circle.child !== this._icon)
                this._circle.child = this._icon;
            this._clone = null;
            this._icon.gicon = tile.gicon ?? iconGicon(tile.icon, tile.active);
        }

        // A chevron only where the tile itself switches; a tile that only
        // leads somewhere opens its page from anywhere.
        this._chevron.visible = Boolean(tile.page) && tile.switches;

        if (tile.active === this._active)
            return;
        const first = this._active === null;
        this._active = tile.active;
        if (tile.active) {
            this.actor.add_style_class_name('halo-on');
        } else {
            this.actor.remove_style_class_name('halo-on');
        }
        if (!first) {
            this._circle.set({scale_x: 0.72, scale_y: 0.72});
            spring(this._circle, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.pop});
        }
    }
}
