// The notifications GNOME's message tray keeps, for the center to list.
// The tray stays the one place they live: apps add and withdraw them
// there, and a dismissal here destroys them there.
//
// Emits "changed" (once per burst) when one came, went or changed.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {plainText} from '../island/words.js';
import {groupNotifications} from './words.js';

export class NotificationModel extends EventEmitter {
    constructor() {
        super();
        this._tray = Main.messageTray;
        this._ids = new WeakMap();
        this._count = 0;
        this._watched = new Set();
        this._queued = 0;
        this._tray.connectObject(
            'source-added', (_tray, source) => this._watch(source),
            'source-removed', (_tray, source) => this._unwatch(source), this);
        for (const source of this._tray.getSources())
            this._watch(source);
    }

    // [{id, notification, app, title, body, time, gicon, appIcon, actions,
    //   resident, unseen}], newest first.
    get items() {
        const items = [];
        for (const source of this._tray.getSources()) {
            for (const notification of source.notifications) {
                if (!this._ids.has(notification))
                    this._ids.set(notification, ++this._count);
                items.push({
                    id: this._ids.get(notification),
                    notification,
                    app: source.title ?? '',
                    title: notification.title ?? '',
                    body: plainText(notification.body),
                    time: (notification.datetime?.to_unix() ?? 0) * 1000,
                    gicon: notification.gicon ?? null,
                    appIcon: source.icon ?? null,
                    actions: notification.actions,
                    resident: notification.resident,
                    unseen: !notification.acknowledged,
                });
            }
        }
        return items.sort((a, b) => b.time - a.time || b.id - a.id);
    }

    // Cards by app and conversation; see groupNotifications.
    get groups() {
        return groupNotifications(this.items);
    }

    get count() {
        return this._tray.getSources().reduce((sum, source) => sum + source.notifications.length, 0);
    }

    // Seen in the center is seen: GNOME's unread dot goes.
    acknowledgeAll() {
        for (const source of this._tray.getSources()) {
            for (const notification of source.notifications)
                notification.acknowledged = true;
        }
    }

    dismiss(notification) {
        notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
    }

    // Everything that may go; resident notifications (a running download,
    // music) stay, as in GNOME's own list.
    clearAll() {
        for (const source of this._tray.getSources()) {
            for (const notification of [...source.notifications]) {
                if (!notification.resident)
                    this.dismiss(notification);
            }
        }
    }

    destroy() {
        if (this._queued)
            GLib.source_remove(this._queued);
        this._queued = 0;
        this._tray.disconnectObject(this);
        for (const source of this._watched)
            source.disconnectObject(this);
        this._watched.clear();
        this.disconnectAll();
    }

    _watch(source) {
        if (this._watched.has(source))
            return;
        this._watched.add(source);
        source.connectObject(
            'notification-added', () => this._changed(),
            'notification-removed', () => this._changed(),
            'notify::count', () => this._changed(), this);
        this._changed();
    }

    _unwatch(source) {
        source.disconnectObject(this);
        this._watched.delete(source);
        this._changed();
    }

    _changed() {
        if (this._queued)
            return;
        this._queued = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._queued = 0;
            this.emit('changed');
            return GLib.SOURCE_REMOVE;
        });
    }
}
