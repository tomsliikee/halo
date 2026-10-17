// Notifications and calls: GNOME's banners stay down and the island shows
// the notification instead. The message tray keeps deciding whether a
// banner may show at all (Do not disturb, fullscreen, urgency) and calls
// _showNotification when it would show one; that method is shadowed on
// the tray and hands the notification to the island.
//
// GNOME does not keep a notification's category. Calls are known by it
// ("call", "call.incoming"), so the D-Bus method that receives
// notifications is shadowed too, only to note the category on the way.
//
// On the lock screen GNOME shows no banners; the tray keeps them queued
// for after. The island then tells only that something came, from which
// app, as GNOME's lock screen does, and shows the title only where the
// user lets details show there.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {lockedNote, plainText} from '../words.js';
import {whenText} from '../views.js';

const NOTIFICATION_MS = 5000;
const CRITICAL_MS = 9000;
const ATTENTION_MS = 6000;
// GNOME Clocks rings its alarms and timers with a notification.
const CLOCKS = 'org.gnome.clocks';

function appIdOf(source) {
    return source?._appId ?? source?.app?.get_id?.()?.replace(/\.desktop$/, '') ?? null;
}

// GNOME's own word that a window wants attention ("… is ready").
function isAttention(source) {
    return Boolean(source?.constructor?.$gtype?.name?.endsWith('WindowAttentionSource'));
}

export class BannerSource {
    constructor(island) {
        this._island = island;
        this._tray = Main.messageTray;
        this._shown = new Map();
        this._nextCategory = null;
        this._count = 0;
        this._lockTold = new WeakSet();
        this._lockIds = new Set();

        const tray = this._tray;
        tray.connectObject('queue-changed', () => this._queueChanged(), this);
        Main.sessionMode.connectObject('updated', () => this._sessionChanged(), this);
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
        this._tray.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        for (const id of this._lockIds)
            this._island.remove(id);
        this._lockIds.clear();
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

    // 'call', 'alarm', 'attention' or 'notification'.
    _kindOf(notification) {
        if (this._isCall(notification))
            return 'call';
        if (appIdOf(notification.source) === CLOCKS)
            return 'alarm';
        return isAttention(notification.source) ? 'attention' : 'notification';
    }

    _takes(notification) {
        const kind = this._kindOf(notification);
        return this._island.allows({call: 'calls', alarm: 'alarms', attention: 'attention'}[kind] ?? 'notifications');
    }

    _show(notification) {
        if (this._nextCategory)
            notification._haloCategory = this._nextCategory;
        const kind = this._kindOf(notification);
        const call = kind === 'call';
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
        // A transient notification goes once it was shown, as GNOME does
        // after its banner.
        const acknowledge = () => {
            notification.acknowledged = true;
            if (notification.isTransient)
                notification.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
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

        if (kind === 'alarm') {
            // Rings until stopped or snoozed: it lasts, with its buttons.
            this._island.set({
                id, kind: 'alarm', view: 'notification',
                data: {
                    app: source?.title ?? 'Clocks', appIcon: source?.icon ?? null, gicon: null,
                    title: notification.title ?? 'Alarm', body: plainText(notification.body),
                    when: whenText(notification.datetime), actions,
                },
                onAction,
                onClick: () => notification.activate(),
                onDismiss: acknowledge,
            });
            return;
        }

        if (kind === 'attention') {
            this._island.set({
                id, kind: 'attention', hint: true, duration: ATTENTION_MS, view: 'info',
                data: {
                    gicon: source?.icon ?? null, icon: 'notifications', tone: 'primary', square: true,
                    title: notification.title || source?.title || '', note: plainText(notification.body),
                },
                onClick: () => {
                    notification.activate();
                    this._island.remove(id);
                },
                onExpire: acknowledge,
                onDismiss: acknowledge,
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

    // Unlocked again: the lock screen's notes go; the tray now shows what
    // it kept, and the island takes it as usual.
    _sessionChanged() {
        if (Main.sessionMode.isLocked)
            return;
        for (const id of this._lockIds)
            this._island.remove(id);
        this._lockIds.clear();
    }

    _queueChanged() {
        if (!Main.sessionMode.isLocked)
            return;
        for (const notification of this._tray._notificationQueue) {
            if (this._lockTold.has(notification))
                continue;
            this._lockTold.add(notification);
            this._showLocked(notification);
        }
    }

    _showLocked(notification) {
        const source = notification.source;
        const policy = source?.policy;
        if (!policy?.showInLockScreen)
            return;
        const call = this._isCall(notification);
        if (!this._island.allows(call ? 'calls' : 'notifications'))
            return;
        const id = `locked:${source.title ?? ''}`;
        const unseen = source.notifications.filter(n => !n.acknowledged).length || 1;
        this._lockIds.add(id);
        this._island.set({
            id, kind: 'notification', hint: true, lockSafe: true,
            duration: NOTIFICATION_MS,
            view: 'notification',
            data: {
                app: source.title ?? '',
                appIcon: source.icon ?? null,
                gicon: null,
                title: call ? 'Incoming call' : lockedNote(unseen, policy.detailsInLockScreen ? notification.title ?? '' : ''),
                body: '',
                when: whenText(notification.datetime),
                actions: [],
            },
            onExpire: () => this._lockIds.delete(id),
            onDismiss: () => this._lockIds.delete(id),
        });
    }
}
