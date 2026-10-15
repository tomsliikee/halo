// The quick settings' first page, as in the design: the battery and four
// round buttons, the sliders, the tiles two by two, what plays, and the
// apps running in the background.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import {percentText, volumeIcon} from '../bar/words.js';
import {spring, SPRINGS} from '../shared/choreo.js';
import {icon, setIcon} from '../shared/icons.js';
import {pressable} from '../shared/press.js';
import {text} from '../shared/text.js';
import {HaloSlider, roundButton} from './controls.js';
import {column} from './page.js';
import {TileView} from './tile.js';
import {backgroundAppsText, batteryNote} from './words.js';

const SENSOR_BUS = 'net.hadess.SensorProxy';
const SENSOR_PATH = '/net/hadess/SensorProxy';
const POWER_SCHEMA = 'org.gnome.settings-daemon.plugins.power';

// Keeps a Halo slider and one of GNOME's sliders in step, both ways.
function bindSlider(halo, gnomeItem, owner) {
    const source = gnomeItem.slider;
    const sync = () => {
        halo.setMax(source.maximum_value ?? 1);
        halo.setValue(source.value);
    };
    source.connectObject('notify::value', sync, 'notify::maximum-value', sync, owner);
    sync();
    return value => {
        source.value = value;
    };
}

export class MainPage {
    constructor(ctx) {
        this._ctx = ctx;
        this._gnome = ctx.gnome;
        this._expanded = false;
        this._player = null;
        this._tileViews = [];

        this.actor = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this._content = column('halo-qs-page');
        this.actor.child = this._content;

        this._buildHeader();
        this._sliders = column('halo-qs-card halo-qs-sliders');
        this._content.add_child(this._sliders);
        this._grid = column('halo-qs-grid');
        this._content.add_child(this._grid);
        this._media = new St.BoxLayout({style_class: 'halo-qs-card halo-qs-media', x_expand: true, visible: false});
        this._content.add_child(this._media);
        this._buildMedia();
        this._background = column('halo-qs-background');
        this._background.visible = false;
        this._content.add_child(this._background);

        ctx.system.connectObject('changed', () => this._updateHeader(), this);
        ctx.tiles.connectObject('changed', () => this._buildGrid(), this);
        this._buildGrid();
        if (this._gnome.ready)
            this._ready();
        else
            this._gnome.connectObject('ready', () => this._ready(), this);
        this._updateHeader();
    }

    // What rises in one after the other when the card opens.
    get sections() {
        return [this._header, this._sliders, ...this._grid.get_children(), this._media, this._background]
            .filter(section => section.visible);
    }

    opened() {
        this._updateHeader();
        this._updateBackground();
        this._setExpanded(false, {animated: false});
    }

    closed() {}

    destroy() {
        if (this._gridId)
            GLib.source_remove(this._gridId);
        this._gridId = 0;
        this._grid.destroy_all_children();
        this._letGoOfTiles();
        this._ctx.system.disconnectObject(this);
        this._ctx.tiles.disconnectObject(this);
        this._gnome.disconnectObject(this);
        this._disconnectGnome();
        this._ambient?.disconnectObject(this);
        this._powerSettings?.disconnectObject(this);
        this.actor.destroy();
    }

    // Header

    _buildHeader() {
        this._header = new St.BoxLayout({style_class: 'halo-qs-header', x_expand: true});
        const words = column();
        words.y_align = Clutter.ActorAlign.CENTER;
        this._big = text('qs-big', {styleClass: 'halo-qs-big'});
        this._small = text('qs-tile-note', {styleClass: 'halo-qs-small'});
        words.add_child(this._big);
        words.add_child(this._small);
        this._header.add_child(words);

        const buttons = new St.BoxLayout({style_class: 'halo-qs-header-buttons', y_align: Clutter.ActorAlign.CENTER});
        buttons.add_child(roundButton('screenshot-region', () => {
            this._ctx.close();
            Main.screenshotUI.open().catch(logError);
        }, {accessibleName: 'Take a screenshot'}));
        this._gear = roundButton('settings', () => this._ctx.navigate('settings'), {accessibleName: 'Halo settings'});
        buttons.add_child(this._gear);
        this._lock = roundButton('lock', () => {
            this._ctx.close();
            SystemActions.getDefault().activateLockScreen();
        }, {accessibleName: 'Lock'});
        buttons.add_child(this._lock);
        buttons.add_child(roundButton('power-settings-new', () => this._ctx.navigate('power'),
            {styleClass: 'halo-qs-power', accessibleName: 'Power off or log out'}));
        this._header.add_child(buttons);
        this._content.add_child(this._header);
    }

    _updateHeader() {
        const battery = this._ctx.system.battery;
        if (battery) {
            this._big.text = percentText(battery.percent);
            this._small.text = batteryNote(battery);
            this._big.remove_style_class_name('halo-low');
        } else {
            // Without a battery the corner shows the day.
            this._big.text = GLib.DateTime.new_now_local().format('%a %-d');
            this._small.text = GLib.get_real_name();
        }
        this._small.visible = Boolean(this._small.text);
        // On the lock screen nothing leads to settings or another session.
        const locked = Main.sessionMode.isLocked;
        this._lock.visible = !locked && SystemActions.getDefault().can_lock_screen;
        this._gear.visible = !locked;
    }

    // Sliders

    _ready() {
        const qs = this._gnome.qs;
        const theme = this._ctx.theme;

        this._output = qs._volumeOutput?._output ?? null;
        this._volumeRow = new St.BoxLayout({style_class: 'halo-qs-slider-row', x_expand: true});
        this._volume = new HaloSlider({
            theme,
            iconName: 'volume-up',
            accessibleName: 'Volume',
            onChange: value => this._setVolume?.(value),
            onIcon: () => this._output?.emit('icon-clicked'),
        });
        this._volumeRow.add_child(this._volume);
        this._outputButton = roundButton('headphones', () => this._ctx.navigate('sound'), {accessibleName: 'Sound output'});
        this._volumeRow.add_child(this._outputButton);
        this._sliders.add_child(this._volumeRow);
        if (this._output) {
            this._setVolume = bindSlider(this._volume, this._output, this);
            this._output.connectObject('notify::visible', () => this._updateSliders(), this);
        }

        this._input = qs._volumeInput?._input ?? null;
        this._micRow = new St.BoxLayout({style_class: 'halo-qs-slider-row', x_expand: true});
        this._mic = new HaloSlider({
            theme,
            iconName: 'mic',
            accessibleName: 'Microphone',
            onChange: value => this._setMic?.(value),
            onIcon: () => this._input?.emit('icon-clicked'),
        });
        this._micRow.add_child(this._mic);
        this._sliders.add_child(this._micRow);
        if (this._input) {
            this._setMic = bindSlider(this._mic, this._input, this);
            this._input.connectObject('notify::visible', () => this._updateSliders(), this);
        }

        this._brightnessItem = qs._brightness?.quickSettingsItems[0] ?? null;
        this._brightnessRow = new St.BoxLayout({style_class: 'halo-qs-slider-row', x_expand: true});
        this._brightness = new HaloSlider({
            theme,
            iconName: 'brightness-6',
            accessibleName: 'Brightness',
            onChange: value => this._setBrightness?.(value),
        });
        this._brightnessRow.add_child(this._brightness);
        this._autoButton = roundButton('brightness-auto', () => this._toggleAmbient(), {accessibleName: 'Automatic brightness'});
        this._autoButton.visible = false;
        this._brightnessRow.add_child(this._autoButton);
        this._sliders.add_child(this._brightnessRow);
        if (this._brightnessItem) {
            this._setBrightness = bindSlider(this._brightness, this._brightnessItem, this);
            this._brightnessItem.connectObject('notify::visible', () => this._updateSliders(), this);
        }
        this._watchAmbient();

        qs._volumeOutput?._indicator?.connectObject('notify::icon-name', () => this._updateSliders(), this);
        qs._volumeInput?._indicator?.connectObject('notify::icon-name', () => this._updateSliders(), this);
        this._updateSliders();

        this._backgroundToggle = qs._backgroundApps?.quickSettingsItems[0] ?? null;
        this._backgroundToggle?.connectObject('notify::visible', () => this._updateBackground(),
            'notify::title', () => this._updateBackground(), this);
        this._updateBackground();

        this._mediaSource = Main.panel.statusArea.dateMenu?._messageList?._messageView?._mediaSource ?? null;
        this._mediaSource?.connectObject('player-added', () => this._updateMedia(),
            'player-removed', () => this._updateMedia(), this);
        this._updateMedia();
    }

    _disconnectGnome() {
        const qs = this._gnome.qs;
        for (const object of [this._output, this._output?.slider, this._input, this._input?.slider,
            this._brightnessItem, this._brightnessItem?.slider, qs?._volumeOutput?._indicator,
            qs?._volumeInput?._indicator, this._backgroundToggle, this._mediaSource, this._player])
            object?.disconnectObject(this);
    }

    _updateSliders() {
        const qs = this._gnome.qs;
        this._volumeRow.visible = Boolean(this._output?.visible);
        this._volume.setIcon(volumeIcon(qs._volumeOutput?._indicator?.icon_name));
        setIcon(this._outputButton.child, this._output?._hasHeadphones ? 'headphones' : 'speaker');
        this._micRow.visible = Boolean(this._input?.visible);
        const micMuted = (qs._volumeInput?._indicator?.icon_name ?? '').includes('muted');
        this._mic.setIcon(micMuted ? 'mic-off' : 'mic');
        this._brightnessRow.visible = Boolean(this._brightnessItem?.visible);
        this._sliders.visible = this._volumeRow.visible || this._micRow.visible || this._brightnessRow.visible;
    }

    // The light sensor's own switch, only where there is a sensor.
    _watchAmbient() {
        this._powerSettings = new Gio.Settings({schema_id: POWER_SCHEMA});
        this._powerSettings.connectObject('changed::ambient-enabled', () => this._updateAmbient(), this);
        Gio.DBusProxy.new(Gio.DBus.system, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null,
            SENSOR_BUS, SENSOR_PATH, SENSOR_BUS, null, (_source, result) => {
                try {
                    this._ambient = Gio.DBusProxy.new_finish(result);
                    this._ambient.connectObject('g-properties-changed', () => this._updateAmbient(), this);
                } catch {
                    this._ambient = null;
                }
                this._updateAmbient();
            });
    }

    _updateAmbient() {
        if (!this._autoButton)
            return;
        const has = this._ambient?.get_cached_property('HasAmbientLight')?.unpack() ?? false;
        this._autoButton.visible = has;
        const on = this._powerSettings.get_boolean('ambient-enabled');
        if (on)
            this._autoButton.add_style_class_name('halo-on');
        else
            this._autoButton.remove_style_class_name('halo-on');
    }

    _toggleAmbient() {
        this._powerSettings.set_boolean('ambient-enabled', !this._powerSettings.get_boolean('ambient-enabled'));
    }

    // Tiles

    _buildGrid() {
        this._tileViews = [];
        this._grid.destroy_all_children();
        this._letGoOfTiles();
        const shown = this._ctx.tiles.shown;
        this._watchedTiles = shown;
        // A tile that hides or shows itself changes the rows.
        for (const tile of shown) {
            let visible = tile.visible;
            tile.connectObject('changed', () => {
                if (tile.visible !== visible) {
                    visible = tile.visible;
                    this._queueGrid();
                }
            }, this);
        }
        const visible = shown.filter(tile => tile.visible);
        for (let i = 0; i < visible.length; i += 2) {
            const line = new St.BoxLayout({style_class: 'halo-qs-tile-row', x_expand: true});
            line.layout_manager.homogeneous = true;
            for (const tile of visible.slice(i, i + 2)) {
                const view = new TileView(tile, chosen => this._openPage(chosen));
                this._tileViews.push(view);
                line.add_child(view.actor);
            }
            // The last tile of an odd count keeps its half.
            if (visible.length - i === 1)
                line.add_child(new St.Widget({x_expand: true}));
            this._grid.add_child(line);
        }
    }

    _letGoOfTiles() {
        for (const tile of this._watchedTiles ?? [])
            tile.disconnectObject(this);
        this._watchedTiles = [];
    }

    _queueGrid() {
        if (this._gridId)
            return;
        this._gridId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._gridId = 0;
            this._buildGrid();
            return GLib.SOURCE_REMOVE;
        });
    }

    _openPage(tile) {
        if (tile.page === 'hosted')
            this._ctx.navigate('hosted', tile);
        else if (tile.page)
            this._ctx.navigate(tile.page, tile);
    }

    // Media

    _buildMedia() {
        this._art = new St.Bin({style_class: 'halo-qs-art', child: icon('graphic-eq', {size: 26}), y_align: Clutter.ActorAlign.CENTER});
        this._media.add_child(this._art);
        const words = column();
        words.y_align = Clutter.ActorAlign.CENTER;
        this._trackTitle = text('qs-tile', {styleClass: 'halo-qs-track', wrap: true});
        this._trackArtist = text('qs-tile-note', {styleClass: 'halo-qs-artist', ellipsize: true});
        words.add_child(this._trackTitle);
        words.add_child(this._trackArtist);
        this._media.add_child(words);
        const controls = new St.BoxLayout({style_class: 'halo-qs-media-controls', y_align: Clutter.ActorAlign.CENTER});
        this._previous = this._mediaButton('skip-previous', () => this._player?.previous(), 'Previous');
        this._play = this._mediaButton('play-arrow', () => this._player?.playPause(), 'Play or pause');
        this._play.add_style_class_name('halo-qs-play');
        this._next = this._mediaButton('skip-next', () => this._player?.next(), 'Next');
        controls.add_child(this._previous);
        controls.add_child(this._play);
        controls.add_child(this._next);
        this._media.add_child(controls);
        pressable(this._art, () => {
            this._ctx.close();
            this._player?.raise();
        }, {scale: 0.92});
    }

    _mediaButton(name, onClick, accessibleName) {
        const button = new St.Bin({
            style_class: 'halo-qs-media-button',
            child: icon(name, {size: 22, fill: true}),
            accessible_name: accessibleName,
            accessible_role: 'push-button',
        });
        pressable(button, onClick, {scale: 0.86, focus: true});
        return button;
    }

    _updateMedia() {
        const players = this._mediaSource?.players ?? [];
        const player = players.find(p => p.status === 'Playing') ?? players[0] ?? null;
        if (player !== this._player) {
            this._player?.disconnectObject(this);
            this._player = player;
            this._player?.connectObject('changed', () => this._updateMedia(), this);
        }
        this._media.visible = Boolean(player);
        if (!player)
            return;
        this._trackTitle.text = player.trackTitle || player.app?.get_name() || 'Playing';
        this._trackArtist.text = (player.trackArtists ?? []).join(', ') || player.app?.get_name() || '';
        const playing = player.status === 'Playing';
        if (this._playing !== playing) {
            this._playing = playing;
            setIcon(this._play.child, playing ? 'pause' : 'play-arrow', true);
            // The button turns from a circle into a rounded square while it plays.
            if (playing)
                this._play.add_style_class_name('halo-playing');
            else
                this._play.remove_style_class_name('halo-playing');
            this._play.set_pivot_point(0.5, 0.5);
            this._play.set({scale_x: 0.85, scale_y: 0.85});
            spring(this._play, {scale_x: 1, scale_y: 1}, {spring: SPRINGS.pop});
        }
        this._previous.opacity = player.canGoPrevious ? 255 : 90;
        this._next.opacity = player.canGoNext ? 255 : 90;
        const cover = player.trackCoverUrl;
        if (cover && cover.startsWith('file://')) {
            this._art.set_style(`background-image: url("${cover}"); background-size: cover;`);
            this._art.child.visible = false;
        } else {
            this._art.set_style(null);
            this._art.child.visible = true;
        }
    }

    // Background apps

    _backgroundApps() {
        const proxy = this._backgroundToggle?._proxy;
        const apps = Shell.AppSystem.get_default();
        return (proxy?.BackgroundApps ?? [])
            .map(entry => apps.lookup_app(`${entry.app_id.deepUnpack()}.desktop`))
            .filter(Boolean)
            .sort((a, b) => a.get_name().localeCompare(b.get_name()));
    }

    _updateBackground() {
        const list = this._backgroundApps();
        // Which apps run is nobody's business on the lock screen.
        const show = Boolean(this._backgroundToggle?.visible) && list.length > 0 && !Main.sessionMode.isLocked;
        this._background.visible = show;
        this._background.destroy_all_children();
        if (!show)
            return;
        const head = new St.BoxLayout({style_class: 'halo-qs-background-head', x_expand: true});
        head.add_child(icon('apps', {size: 20}));
        head.add_child(text('qs-row', {expand: true, text: backgroundAppsText(list.length)}));
        this._chevron = icon('keyboard-arrow-down', {size: 20});
        this._chevron.set_pivot_point(0.5, 0.5);
        this._chevron.rotation_angle_z = this._expanded ? 180 : 0;
        head.add_child(this._chevron);
        head.accessible_name = backgroundAppsText(list.length);
        pressable(head, () => this._setExpanded(!this._expanded), {scale: 0.97, focus: true});
        this._background.add_child(head);

        this._appList = column('halo-qs-background-list');
        for (const app of list) {
            const line = new St.BoxLayout({style_class: 'halo-qs-background-app', x_expand: true});
            line.add_child(app.create_icon_texture(24));
            line.add_child(text('qs-row-note', {expand: true, styleClass: 'halo-qs-row-title', text: app.get_name()}));
            const quit = new St.Bin({
                style_class: 'halo-qs-quit',
                child: icon('close', {size: 16}),
                accessible_name: `Quit ${app.get_name()}`,
            });
            pressable(quit, () => {
                app.activate_action('quit', null, 0, -1, null).catch(() => {
                    const id = app.get_id().replace(/\.desktop$/, '');
                    Gio.Subprocess.new(['flatpak', 'kill', id], Gio.SubprocessFlags.NONE);
                });
            }, {scale: 0.85});
            line.add_child(quit);
            pressable(line, () => {
                this._ctx.close();
                app.activate();
            }, {scale: 0.98});
            this._appList.add_child(line);
        }
        this._appList.visible = this._expanded;
        this._background.add_child(this._appList);
    }

    _setExpanded(expanded, {animated = true} = {}) {
        this._expanded = expanded;
        if (!this._appList)
            return;
        this._appList.visible = expanded;
        if (animated) {
            spring(this._chevron, {rotation_angle_z: expanded ? 180 : 0}, {spring: SPRINGS.glide});
            if (expanded) {
                this._appList.get_children().forEach((line, i) => {
                    line.set({opacity: 0, translation_y: -6});
                    spring(line, {translation_y: 0}, {spring: SPRINGS.pop, delay: i * 30});
                    line.ease({opacity: 255, delay: i * 30, duration: 160});
                });
            }
        } else if (this._chevron) {
            this._chevron.rotation_angle_z = expanded ? 180 : 0;
        }
        this._ctx.refit();
    }
}
