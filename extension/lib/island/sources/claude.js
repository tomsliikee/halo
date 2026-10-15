// Claude: a pill while Claude Code works, read from Ember's D-Bus service,
// and a short message when Tally's plan limits pass 80 or 95 %.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {crossed, readLimits} from '../limits.js';
import {claudeNote, claudePeek, limitNote, limitTitle, unitAppId} from '../words.js';

const EMBER = 'io.github.tomsliikee.Ember';
const EMBER_PATH = '/io/github/tomsliikee/Ember';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const TALLY = GLib.build_filenamev([GLib.get_user_cache_dir(), 'tally']);
const DESKTOP_APP = 'com.anthropic.Claude.desktop';
const ID = 'claude';
// The note counts minutes; a minute is enough.
const TICK_S = 30;

function sessionsOf(json) {
    try {
        const state = JSON.parse(json);
        return (Array.isArray(state?.sessions) ? state.sessions : [])
            .filter(s => s && typeof s.project === 'string' && ['working', 'waiting'].includes(s.state))
            .map(s => ({
                project: s.project, state: s.state, since: typeof s.since === 'number' ? s.since : null,
                unit: typeof s.unit === 'string' ? s.unit : null, desktop: s.desktop === true,
            }));
    } catch {
        return [];
    }
}

// The window a session runs in: the terminal whose unit Ember reports,
// else Claude's desktop app where it is installed, else null.
function appOf(session) {
    const apps = Shell.AppSystem.get_default();
    const id = session?.desktop ? null : unitAppId(session?.unit);
    return (id ? apps.lookup_app(id) : null) ?? apps.lookup_app(DESKTOP_APP);
}

function readText(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export class ClaudeSource {
    constructor(island) {
        this._island = island;
        this._sessions = [];
        this._waiting = new Set();
        this._tick = 0;
        this._cancellable = new Gio.Cancellable();
        this._bus = Gio.DBus.session;
        this._changed = this._bus.signal_subscribe(EMBER, PROPERTIES, 'PropertiesChanged', EMBER_PATH, null,
            Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, args) => {
                const [, changed] = args.recursiveUnpack();
                if (typeof changed.State === 'string')
                    this._sessionsChanged(sessionsOf(changed.State));
            });
        this._watch = Gio.bus_watch_name(Gio.BusType.SESSION, EMBER, Gio.BusNameWatcherFlags.NONE,
            () => this._read(), () => this._sessionsChanged([]));

        this._limits = this._readLimits();
        this._monitor = Gio.File.new_for_path(TALLY).monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, file, _o, type) => {
            if (type === Gio.FileMonitorEvent.CHANGES_DONE_HINT && /^(limits|statusline)\.json$/.test(file.get_basename()))
                this._limitsChanged();
        });
    }

    destroy() {
        this._cancellable.cancel();
        this._bus.signal_unsubscribe(this._changed);
        Gio.bus_unwatch_name(this._watch);
        this._monitor.cancel();
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        this._island.remove(ID);
    }

    _read() {
        this._bus.call(EMBER, EMBER_PATH, PROPERTIES, 'Get', new GLib.Variant('(ss)', [EMBER, 'State']), null,
            Gio.DBusCallFlags.NO_AUTO_START, -1, this._cancellable, (bus, result) => {
                try {
                    const [state] = bus.call_finish(result).recursiveUnpack();
                    this._sessionsChanged(sessionsOf(state));
                } catch {
                    // Without the service, Claude is not known to work.
                }
            });
    }

    _sessionsChanged(sessions) {
        // A session that starts waiting for an answer says so once.
        for (const session of sessions) {
            if (session.state === 'waiting' && !this._waiting.has(session.project) && this._island.allows('claude')) {
                this._island.set({
                    id: `hint:claude-wait:${session.project}`, kind: 'claude', hint: true, duration: 5000, view: 'info',
                    data: {icon: 'smart-toy', tone: 'tertiary', title: 'Claude needs you', note: claudeNote(session, Date.now())},
                    onOpen: this._opener(session),
                });
            }
        }
        this._waiting = new Set(sessions.filter(s => s.state === 'waiting').map(s => s.project));
        this._sessions = sessions;
        this._update();
    }

    _update() {
        const working = this._sessions.filter(s => s.state === 'working');
        if (working.length === 0 || !this._island.allows('claude')) {
            this._island.remove(ID);
            if (this._tick)
                GLib.source_remove(this._tick);
            this._tick = 0;
            return;
        }
        const first = working[0];
        this._island.set({
            id: ID, kind: 'claude', view: 'info',
            data: {
                icon: 'progress-activity', tone: 'soft', spin: true,
                title: working.length > 1 ? `Claude · ${working.length} sessions` : 'Claude is working',
                note: claudeNote(first, Date.now()),
                peek: claudePeek(working),
            },
            onOpen: this._opener(first),
        });
        if (!this._tick) {
            this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_S, () => {
                this._update();
                return this._tick ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
            });
        }
    }

    _opener(session) {
        const app = appOf(session);
        return app ? () => app.activate() : null;
    }

    _readLimits() {
        return readLimits(readText(`${TALLY}/limits.json`), readText(`${TALLY}/statusline.json`), Date.now());
    }

    _limitsChanged() {
        const before = this._limits;
        this._limits = this._readLimits();
        if (!this._island.allows('claude'))
            return;
        const crossing = crossed(before, this._limits)[0];
        if (!crossing)
            return;
        this._island.set({
            id: 'hint:claude-limit', kind: 'claude', hint: true, duration: 6000, view: 'info',
            data: {
                icon: 'warning', tone: crossing.mark >= 95 ? 'alarm' : 'tertiary',
                title: limitTitle(crossing), note: limitNote(crossing, Date.now()),
            },
        });
    }
}
