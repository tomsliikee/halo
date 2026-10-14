// What every page of the quick settings is made of: a header with a round
// back button, its title and maybe a switch; cards, captions, rows and a
// link at the bottom.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {icon, iconGicon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {HaloSwitch, roundButton} from './controls.js';

export function column(styleClass = '') {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

export function caption(words) {
    return text('qs-caption', {styleClass: 'halo-qs-caption', text: words});
}

// A row of a list: icon, title, note and something at the end. chosen
// rows are filled; onClick makes it pressable.
export function row({iconName = null, gicon = null, title, note = '', trailing = null, onClick = null, chosen = false}) {
    const box = new St.BoxLayout({style_class: 'halo-qs-row', x_expand: true});
    if (chosen)
        box.add_style_class_name('halo-chosen');
    if (iconName || gicon) {
        const shown = new St.Icon({
            gicon: gicon ?? iconGicon(iconName, chosen),
            icon_size: 20,
            style_class: 'halo-qs-row-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(shown);
    }
    const words = column();
    words.y_align = Clutter.ActorAlign.CENTER;
    const titleLabel = text('qs-row', {styleClass: 'halo-qs-row-title', ellipsize: true, text: title});
    words.add_child(titleLabel);
    const noteLabel = text('qs-row-note', {styleClass: 'halo-qs-row-note', ellipsize: true, text: note});
    noteLabel.visible = Boolean(note);
    words.add_child(noteLabel);
    box.add_child(words);
    if (trailing) {
        trailing.y_align = Clutter.ActorAlign.CENTER;
        box.add_child(trailing);
    }
    box.accessible_name = note ? `${title}, ${note}` : title;
    if (onClick)
        pressable(box, () => onClick(box), {scale: 0.97, focus: true});
    return {actor: box, title: titleLabel, note: noteLabel};
}

export function trailingText(words) {
    return text('qs-row-note', {styleClass: 'halo-qs-row-note', text: words});
}

export function trailingIcon(name, {fill = false} = {}) {
    return icon(name, {size: 18, fill, styleClass: 'halo-qs-row-end'});
}

// "All Wi‑Fi settings" and the like: opens a panel of GNOME's settings.
export function settingsLink(ctx, words, desktopId) {
    const label = text('qs-link', {styleClass: 'halo-qs-link', text: words});
    label.x_align = Clutter.ActorAlign.START;
    pressable(label, () => {
        ctx.close();
        openSettings(desktopId);
    }, {scale: 0.96, focus: true});
    return label;
}

export function openSettings(desktopId = 'org.gnome.Settings.desktop') {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId) ??
        Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop');
    if (app) {
        app.activate();
        return;
    }
    // A panel without its own desktop file: ask Settings for it by name.
    const panel = desktopId.replace(/^gnome-/, '').replace(/-panel\.desktop$/, '');
    Gio.Subprocess.new(['gnome-control-center', panel], Gio.SubprocessFlags.NONE);
}

// A page: a scrolling column with the header on top. Subclasses fill
// this.content and undo their connections in _destroy().
export class Page {
    constructor(ctx, title, {toggle = null} = {}) {
        this.ctx = ctx;
        this.content = column('halo-qs-page');
        this.actor = new St.ScrollView({
            child: this.content,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.START,
        });

        const header = new St.BoxLayout({style_class: 'halo-qs-page-header', x_expand: true});
        header.add_child(roundButton('arrow-back', () => ctx.back(), {accessibleName: 'Back'}));
        const titleLabel = text('qs-page', {styleClass: 'halo-qs-page-title', expand: true, ellipsize: true, text: title});
        header.add_child(titleLabel);
        this.switch = null;
        if (toggle) {
            this.switch = new HaloSwitch({theme: ctx.theme, onToggle: toggle, accessibleName: title});
            header.add_child(this.switch);
        }
        this.content.add_child(header);
    }

    add(actor) {
        this.content.add_child(actor);
        return actor;
    }

    destroy() {
        this._destroy();
        this.actor.destroy();
    }

    _destroy() {}
}
