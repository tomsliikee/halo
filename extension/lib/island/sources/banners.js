// Notifications and calls: GNOME's banners stay down and the island shows
// the notification instead. The message tray keeps deciding whether a
// banner may show at all (Do not disturb, fullscreen, urgency) and calls
// _showNotification when it would show one; that method is shadowed on
// the tray and hands the notification to the island.
//
// GNOME does not keep a notification's category. Calls are known by it
// ("call", "call.incoming"), so the D-Bus method that receives
// notifications is shadowed too, only to note the category on the way.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {plainText} from '../words.js';
import {whenText} from '../views.js';

const NOTIFICATION_MS = 5000;
const CRITICAL_MS = 9000;

export class BannerSource {
    constructor(island) {
        this._island = island;
        this._tray = Main.messageTray;
        this._shown = new Map();
        this._nextCategory = null;
        this._count = 0;

        const tray = this._tray;
        const showNotification = tray._showNotification;
        tray._showNotification = () => {
            const notification = tray._notificationQueue[0];
            if (!notification || !this._takes(notification)) {
                showNotification.call(tray);
                return;
            }
            tray._notificationQueue.shift();
            tray.emit('queue-changed');
            this._show(notification);
        };

        this._daemon = Main.notificationDaemon?._fdoNotificationDaemon ?? null;
        const notify = this._daemon?.NotifyAsync;
        if (notify) {
            this._daemon.NotifyAsync = (params, invocation) => {
                const hints = params[6] ?? {};
                const category = hints.category?.deepUnpack?.() ?? hints.category ?? null;
                this._nextCategory = typeof category === 'string' ? category : null;
                try {
                    return notify.call(this._daemon, params, invocation);
                } finally {
                    this._nextCategory = null;
                }
            };
        }
    }

    destroy() {
        delete this._tray._showNotification;
        if (this._daemon)
            delete this._daemon.NotifyAsync;
        for (const [notification, id] of this._shown) {
            notification.disconnectObject(this);
            this._island.remove(id);
        }
        this._shown.clear();
    }

    _isCall(notification) {
        const category = notification._haloCategory ?? this._nextCategory;
        return typeof category === 'string' && category.startsWith('call');
    }

    _takes(notification) {
        return this._island.allows(this._isCall(notification) ? 'calls' : 'notifications');
    }

    _show(notification) {
        if (this._nextCategory)
            notification._haloCategory = this._nextCategory;
        const call = this._isCall(notification);
        // An updated notification keeps its place in the island.
        const id = this._shown.get(notification) ?? `notification:${++this._count}`;
        this._shown.set(notification, id);
        notification.disconnectObject(this);

        const done = () => {
            notification.disconnectObject(this);
            this._shown.delete(notification);
            this._island.remove(id);
        };
        notification.connectObject('destroy', done, this);

        const source = notification.source;
        const actions = notification.actions.map(action => ({label: action.label, activate: () => action.activate()}));
        const onAction = action => {
            action.activate();
            this._island.remove(id);
        };
        // Seen in the island is seen: it does not come back as a banner.
        const acknowledge = () => {
            notification.acknowledged = true;
        };

        if (call) {
            this._island.set({
                id, kind: 'call', view: 'call',
                data: {
                    name: notification.title || source?.title || 'Call',
                    note: plainText(notification.body) || source?.title || 'Incoming call',
                    gicon: notification.gicon ?? null,
                    video: /video/i.test(`${notification.title} ${notification.body}`),
                    actions,
                },
                onAction,
                onClick: () => notification.activate(),
            });
            return;
        }

        const critical = notification.urgency === MessageTray.Urgency.CRITICAL;
        this._island.set({
            id, kind: 'notification', hint: true, sticky: critical && actions.length > 0,
            duration: critical ? CRITICAL_MS : NOTIFICATION_MS,
            view: 'notification',
            data: {
                app: source?.title ?? '',
                appIcon: source?.icon ?? null,
                gicon: notification.gicon ?? null,
                title: notification.title ?? '',
                body: plainText(notification.body),
                when: whenText(notification.datetime),
                actions,
            },
            onAction,
            onClick: () => notification.activate(),
            onExpire: acknowledge,
            onDismiss: acknowledge,
        });
    }
}
