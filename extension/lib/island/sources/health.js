// The computer running hot, or memory or a disk nearly full: a word when
// it crosses the line, once, and again only after it was fine for a while
// (../health.js). A look once a minute, not while the screen is locked;
// the glance asks for the readings themselves (stats()).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {cpuZones, hottest, memoryLeft, newProblems, problems} from '../health.js';
import {healthText} from '../words.js';

const CHECK_S = 60;
const SHOW_MS = 6000;
const THERMAL = '/sys/class/thermal';
const ICONS = {hot: 'warning', memory: 'speed', disk: 'folder'};

function read(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes) : null;
    } catch {
        return null;
    }
}

export class HealthSource {
    constructor(island) {
        this._island = island;
        this._state = {};
        this._zones = this._thermalZones();
        this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, CHECK_S, () => {
            this._look();
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
    }

    _thermalZones() {
        const zones = [];
        try {
            const children = Gio.File.new_for_path(THERMAL).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            for (let info = children.next_file(null); info; info = children.next_file(null)) {
                const zone = `${THERMAL}/${info.get_name()}`;
                if (info.get_name().startsWith('thermal_zone'))
                    zones.push({path: `${zone}/temp`, type: read(`${zone}/type`)?.trim() ?? ''});
            }
            children.close(null);
        } catch {
            // No sensors to read.
        }
        return cpuZones(zones);
    }

    _diskLeft() {
        const shares = [GLib.get_home_dir(), '/'].map(path => {
            try {
                const info = Gio.File.new_for_path(path).query_filesystem_info('filesystem::free,filesystem::size', null);
                const size = info.get_attribute_uint64('filesystem::size');
                return size > 0 ? info.get_attribute_uint64('filesystem::free') / size : null;
            } catch {
                return null;
            }
        }).filter(share => share !== null);
        return shares.length > 0 ? Math.min(...shares) : null;
    }

    // How it is doing right now, for the glance: {memoryUsed, temperature,
    // diskFree, uptime}, each null when it cannot be read.
    stats() {
        const left = memoryLeft(read('/proc/meminfo'));
        const uptime = Number.parseFloat(read('/proc/uptime') ?? '');
        return {
            memoryUsed: left === null ? null : 1 - left,
            temperature: hottest(this._zones.map(read).filter(Boolean)),
            diskFree: this._homeFree(),
            uptime: Number.isFinite(uptime) ? uptime : null,
        };
    }

    _homeFree() {
        try {
            const info = Gio.File.new_for_path(GLib.get_home_dir()).query_filesystem_info('filesystem::free', null);
            return info.get_attribute_uint64('filesystem::free');
        } catch {
            return null;
        }
    }

    _look() {
        if (Main.sessionMode.isLocked || !this._island.allows('health'))
            return;
        const readings = {
            temperature: hottest(this._zones.map(read).filter(Boolean)),
            memory: memoryLeft(read('/proc/meminfo')),
            disk: this._diskLeft(),
        };
        const now = problems(readings, this._state);
        const fresh = newProblems(now, this._state);
        this._state = now;
        for (const problem of fresh) {
            const {title, note} = healthText(problem, readings);
            this._island.set({
                id: `hint:health-${problem}`, kind: 'health', hint: true, duration: SHOW_MS, view: 'info',
                data: {icon: ICONS[problem], tone: 'alarm', square: true, title, note},
            });
        }
    }
}
