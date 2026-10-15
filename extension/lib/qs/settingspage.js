// Halo's own settings, behind the gear in the quick settings' header: the
// four parts, how it looks, the top bar, what may open the island, the
// tiles (dragged into order, hidden with the eye), motion, and a warning
// when another extension changes the same top bar.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {spring, SPRINGS} from '../shared/choreo.js';
import {icon, setIcon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {ISLAND_EVENTS} from '../shared/settings.js';
import {text} from '../shared/text.js';
import {HaloSwitch} from './controls.js';
import {Page, caption, column, openSettings, row, trailingIcon} from './page.js';
import {COLOUR_NAMES, minutesOf, moveTile} from './words.js';

const PARTS = [
    ['bar', 'Top bar', 'Halo\'s bar instead of GNOME\'s'],
    ['island', 'Dynamic Island', 'Volume, media, timers and hints'],
    ['center', 'Notification center', 'Notifications, calendar and weather'],
    ['quickSettings', 'Quick settings', 'This panel; off, GNOME\'s comes back'],
];

const BAR_SWITCHES = [
    ['floating', 'Floating', 'Keeps a gap to the screen\'s edges'],
    ['seeThrough', 'See-through', 'Lets the wallpaper show through the bar'],
    ['lightBar', 'Light bar', 'Stays light when the desktop is dark'],
    ['hideInFullscreen', 'Hide in fullscreen', 'Rest the pointer on the top edge to bring it back'],
    ['islandFocusBar', 'Pills only behind the island', 'While the island shows something, only the side pills stay'],
];

const EVENT_NAMES = {
    volume: 'Volume', brightness: 'Brightness', notifications: 'Notifications', calls: 'Calls',
    media: 'Media', recording: 'Screen recording', timer: 'Timer', charging: 'Charging',
    settings: 'Do not disturb and settings', devices: 'Bluetooth devices',
    privacy: 'Camera, microphone, screen sharing', progress: 'Downloads and progress',
    events: 'Upcoming events', screenshot: 'Screenshots', clipboard: 'Copied to the clipboard',
    battery: 'Low battery', network: 'Wi‑Fi and VPN', keyboard: 'Keyboard layout',
    powerMode: 'Power mode', claude: 'Claude, from Ember and Tally',
};

const SPEEDS = [['quick', 'Quick'], ['normal', 'Normal'], ['slow', 'Slow']];
const CLICKS = [['app', 'Opens the app'], ['large', 'Opens it larger']];
const STYLES = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']];
const STEP_MINUTES = 30;

function timeOf(minutes) {
    const total = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// How long the page keeps scrolling to a section asked for while it is
// being laid out.
const JUMP_MS = 1500;

function card(title) {
    const box = column('halo-qs-card halo-qs-settings-card');
    if (title)
        box.add_child(caption(title));
    return box;
}

export class SettingsPage extends Page {
    // section: 'island' scrolls to what opens the island, for the island's
    // pencil circle.
    constructor(ctx, section = null) {
        super(ctx, 'Halo');
        this._switches = [];
        this._segments = [];

        this._warning = this.add(new St.BoxLayout({style_class: 'halo-qs-warning', x_expand: true}));
        this._warning.add_child(icon('warning', {size: 20}));
        this._warningText = text('qs-row-note', {expand: true, wrap: true});
        this._warning.add_child(this._warningText);

        const parts = this.add(card('Parts'));
        for (const [name, title, note] of PARTS)
            parts.add_child(this._switchRow(title, note, s => s.parts[name], on => this._setPart(name, on)));

        const look = this.add(card('Appearance'));
        this._colourRow = row({iconName: 'palette', title: 'Colour style', trailing: trailingIcon('chevron-right'),
            onClick: () => ctx.navigate('appearance')});
        look.add_child(this._colourRow.actor);
        look.add_child(this._segmented(STYLES, () => ctx.appearance.style, value => ctx.appearance.setStyle(value)));
        this._times = new St.BoxLayout({style_class: 'halo-qs-times', x_expand: true});
        this._times.add_child(text('qs-row-note', {styleClass: 'halo-qs-row-note', text: 'Dark from'}));
        this._from = this._stepper('darkFrom');
        this._times.add_child(this._from.actor);
        this._times.add_child(text('qs-row-note', {styleClass: 'halo-qs-row-note', text: 'until'}));
        this._to = this._stepper('darkTo');
        this._times.add_child(this._to.actor);
        look.add_child(this._times);

        const bar = this.add(card('Top bar'));
        bar.add_child(row({iconName: 'grid-view', title: 'Layout', note: 'Full, compact or islands',
            trailing: trailingIcon('chevron-right'), onClick: () => ctx.navigate('appearance')}).actor);
        for (const [key, title, note] of BAR_SWITCHES)
            bar.add_child(this._switchRow(title, note, s => s[key], on => ctx.settings.set(key, on)));

        const click = this.add(card('A click on the island'));
        click.add_child(text('qs-row-note', {styleClass: 'halo-qs-small', wrap: true,
            text: 'Music, Claude or a download: open its window, or first its larger look. The middle button always opens it larger.'}));
        click.add_child(this._segmented(CLICKS, () => ctx.settings.current.islandClick,
            value => ctx.settings.set('islandClick', value)));

        const island = this.add(card('What opens the island'));
        this._jumpTo = section === 'island' ? click : null;
        this._jumpEnd = 0;
        for (const name of ISLAND_EVENTS) {
            island.add_child(this._switchRow(EVENT_NAMES[name], '', s => s.islandEvents[name],
                on => ctx.settings.set('islandEvents', {...ctx.settings.current.islandEvents, [name]: on}), {compact: true}));
        }

        const tiles = this.add(card('Tiles'));
        tiles.add_child(text('qs-row-note', {styleClass: 'halo-qs-small', wrap: true,
            text: 'Drag a tile by its handle to move it. The eye hides it from the quick settings.'}));
        this._tileList = column('halo-qs-tile-list');
        tiles.add_child(this._tileList);

        const motion = this.add(card('Motion'));
        motion.add_child(this._switchRow('Expressive motion', 'Springs that overshoot a little, shapes that grow and pop',
            s => s.expressiveMotion, on => ctx.settings.set('expressiveMotion', on)));
        motion.add_child(this._segmented(SPEEDS, () => ctx.settings.current.motionSpeed,
            value => ctx.settings.set('motionSpeed', value)));

        const all = text('qs-link', {styleClass: 'halo-qs-link', text: 'All system settings'});
        all.x_align = Clutter.ActorAlign.START;
        pressable(all, () => {
            ctx.close();
            openSettings();
        }, {scale: 0.96, focus: true});
        this.add(all);

        ctx.appearance.connectObject('changed', () => this.settingsChanged(), this);
        ctx.conflicts.connectObject('changed', () => this._updateWarning(), this);
        ctx.tiles.connectObject('changed', () => this._buildTiles(), this);
        this._buildTiles();
        this._updateWarning();
        this.settingsChanged({animated: false});
    }

    // Shown in the panel: scrolls to the section asked for, once it has
    // its place.
    shown() {
        const target = this._jumpTo;
        this._jumpTo = null;
        if (!target)
            return;
        // The page gets its length while the panel fits it, over a few
        // frames; for a moment every new length scrolls it again.
        const adjustment = this.actor.vadjustment;
        const jump = () => {
            const y = target.get_allocation_box().y1 - 8;
            adjustment.value = Math.max(0, Math.min(y, adjustment.upper - adjustment.page_size));
        };
        const changed = adjustment.connect('changed', jump);
        this._jumpEnd = GLib.timeout_add(GLib.PRIORITY_DEFAULT, JUMP_MS, () => {
            adjustment.disconnect(changed);
            this._jumpEnd = 0;
            return GLib.SOURCE_REMOVE;
        });
        this._jumpStop = () => adjustment.disconnect(changed);
    }

    settingsChanged({animated = true} = {}) {
        const current = this.ctx.settings.current;
        for (const {control, read} of this._switches)
            control.set(read(current), {animated});
        for (const segments of this._segments)
            segments.update();
        this._colourRow.note.text = COLOUR_NAMES[current.colour];
        this._colourRow.note.visible = true;
        this._times.visible = current.darkStyle === 'auto';
        this._from.label.text = current.darkFrom;
        this._to.label.text = current.darkTo;
    }

    _setPart(name, on) {
        const settings = this.ctx.settings;
        // Switching the quick settings off closes them: GNOME's take over.
        if (name === 'quickSettings' && !on)
            this.ctx.close();
        settings.set('parts', {...settings.current.parts, [name]: on});
    }

    _switchRow(title, note, read, write, {compact = false} = {}) {
        const control = new HaloSwitch({theme: this.ctx.theme, accessibleName: title, onToggle: on => write(on)});
        const line = row({title, note, trailing: control});
        line.actor.add_style_class_name(compact ? 'halo-qs-switch-row halo-compact' : 'halo-qs-switch-row');
        pressable(line.actor, () => write(!control.on), {scale: 0.98});
        this._switches.push({control, read});
        return line.actor;
    }

    _segmented(choices, read, write) {
        const box = new St.BoxLayout({style_class: 'halo-qs-segments halo-small', x_expand: true});
        box.layout_manager.homogeneous = true;
        const segments = choices.map(([value, name]) => {
            const segment = new St.Bin({style_class: 'halo-qs-segment', x_expand: true, accessible_name: name,
                child: text('qs-row-note', {text: name})});
            segment.child.x_align = Clutter.ActorAlign.CENTER;
            pressable(segment, () => write(value), {scale: 0.94, focus: true});
            box.add_child(segment);
            return [value, segment];
        });
        this._segments.push({
            update: () => {
                for (const [value, segment] of segments) {
                    if (value === read())
                        segment.add_style_class_name('halo-chosen');
                    else
                        segment.remove_style_class_name('halo-chosen');
                }
            },
        });
        return box;
    }

    // A time with a minus and a plus, in half hours.
    _stepper(key) {
        const box = new St.BoxLayout({style_class: 'halo-qs-stepper'});
        const step = delta => {
            const settings = this.ctx.settings;
            settings.set(key, timeOf(minutesOf(settings.current[key]) + delta));
        };
        const button = (name, delta, accessibleName) => {
            const bin = new St.Bin({style_class: 'halo-qs-step', child: icon(name, {size: 16}), accessible_name: accessibleName});
            pressable(bin, () => step(delta), {scale: 0.85, focus: true});
            return bin;
        };
        box.add_child(button('remove', -STEP_MINUTES, 'Earlier'));
        const label = text('qs-row', {styleClass: 'halo-qs-time'});
        box.add_child(label);
        box.add_child(button('add', STEP_MINUTES, 'Later'));
        return {actor: box, label};
    }

    _updateWarning() {
        const active = this.ctx.conflicts.active;
        this._warning.visible = active.length > 0;
        const names = active.join(' and ');
        const many = active.length > 1;
        this._warningText.text = `${names} ${many ? 'are' : 'is'} on too and ${many ? 'change' : 'changes'} the same top bar. ` +
            `Switch ${many ? 'them' : 'it'} off in Extensions so they do not fight with Halo.`;
    }

    // Tiles: one row each, with a handle to drag and an eye.

    _buildTiles() {
        this._tileList.destroy_all_children();
        const hidden = this.ctx.settings.current.hiddenTiles;
        for (const tile of this.ctx.tiles.ordered) {
            const line = new St.BoxLayout({style_class: 'halo-qs-tile-item', x_expand: true});
            line._haloTile = tile.id;
            const handle = new St.Bin({style_class: 'halo-qs-handle', child: icon('drag-indicator', {size: 20}),
                accessible_name: `Move ${tile.title}`});
            line.add_child(handle);
            const shown = new St.Icon({gicon: tile.gicon ?? null, icon_size: 18, style_class: 'halo-qs-row-icon'});
            if (!tile.gicon)
                setIcon(shown, tile.icon);
            line.add_child(shown);
            line.add_child(text('qs-row-note', {expand: true, ellipsize: true, styleClass: 'halo-qs-row-title',
                text: tile.title || tile.id}));
            if (!tile.visible)
                line.add_child(text('qs-row-note', {styleClass: 'halo-qs-row-note', text: 'Not here'}));
            const isHidden = hidden.includes(tile.id);
            if (isHidden)
                line.add_style_class_name('halo-hidden');
            const eye = new St.Bin({style_class: 'halo-qs-eye', child: icon(isHidden ? 'visibility-off' : 'visibility', {size: 18}),
                accessible_name: isHidden ? `Show ${tile.title}` : `Hide ${tile.title}`});
            pressable(eye, () => this._toggleHidden(tile.id), {scale: 0.85, focus: true});
            line.add_child(eye);
            this._dragHandle(handle, line);
            this._tileList.add_child(line);
        }
    }

    _toggleHidden(id) {
        const settings = this.ctx.settings;
        const hidden = settings.current.hiddenTiles;
        settings.set('hiddenTiles', hidden.includes(id) ? hidden.filter(other => other !== id) : [...hidden, id]);
        this._buildTiles();
    }

    // The row follows the pointer; the rows it passes make way with a
    // spring; letting go saves the new order.
    _dragHandle(handle, line) {
        handle.reactive = true;
        let grab = null;
        let startY = 0;
        handle.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            [, startY] = event.get_coords();
            grab = global.stage.grab(handle);
            line.add_style_class_name('halo-dragging');
            spring(line, {scale_x: 1.03, scale_y: 1.03}, {spring: SPRINGS.hover});
            return Clutter.EVENT_STOP;
        });
        handle.connect('motion-event', (_actor, event) => {
            if (!grab)
                return Clutter.EVENT_PROPAGATE;
            const [, y] = event.get_coords();
            line.translation_y = y - startY;
            this._makeWay(line);
            return Clutter.EVENT_STOP;
        });
        handle.connect('button-release-event', () => {
            if (!grab)
                return Clutter.EVENT_PROPAGATE;
            grab.dismiss();
            grab = null;
            line.remove_style_class_name('halo-dragging');
            this._drop(line);
            return Clutter.EVENT_STOP;
        });
    }

    // Where the dragged row would land: before the first row whose middle
    // lies below the row's middle.
    _target(line) {
        const rows = this._tileList.get_children();
        const middle = line.y + line.translation_y + line.height / 2;
        let index = rows.length - 1;
        for (const [i, other] of rows.entries()) {
            if (other === line)
                continue;
            if (middle < other.y + other.height / 2) {
                index = i > rows.indexOf(line) ? i - 1 : i;
                break;
            }
        }
        return Math.max(0, index);
    }

    _makeWay(line) {
        const rows = this._tileList.get_children();
        const from = rows.indexOf(line);
        const to = this._target(line);
        const step = line.height + 4;
        for (const [i, other] of rows.entries()) {
            if (other === line)
                continue;
            let shift = 0;
            if (from < to && i > from && i <= to)
                shift = -step;
            else if (from > to && i >= to && i < from)
                shift = step;
            if (other._haloShift !== shift) {
                other._haloShift = shift;
                spring(other, {translation_y: shift}, {spring: SPRINGS.glide});
            }
        }
    }

    _drop(line) {
        const rows = this._tileList.get_children();
        const to = this._target(line);
        const ids = this.ctx.tiles.all.map(tile => tile.id);
        const target = rows[to]._haloTile;
        const order = moveTile(ids, this.ctx.settings.current.tileOrder, line._haloTile, target);
        this.ctx.settings.set('tileOrder', order);
        this.ctx.tiles.settingsChanged();
        this._buildTiles();
    }

    _destroy() {
        if (this._jumpEnd) {
            GLib.source_remove(this._jumpEnd);
            this._jumpStop();
        }
        this.ctx.appearance.disconnectObject(this);
        this.ctx.conflicts.disconnectObject(this);
        this.ctx.tiles.disconnectObject(this);
    }
}
