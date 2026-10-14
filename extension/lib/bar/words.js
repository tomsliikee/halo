// What the bar shows, worked out from plain values: which icon stands for
// a state GNOME reports, and how numbers and dates are written.

// GNOME's network icon names to Halo's: Wi-Fi strength in bars, wired,
// cellular and the states in between.
export function networkIcon(gnomeName) {
    const name = (gnomeName ?? '').replace(/-symbolic$/, '');
    if (!name)
        return null;
    if (name.startsWith('network-wireless-signal-')) {
        const level = name.slice('network-wireless-signal-'.length);
        return {excellent: 'wifi', good: 'network-wifi-3-bar', ok: 'network-wifi-2-bar', weak: 'network-wifi-1-bar'}[level] ??
            'signal-wifi-0-bar';
    }
    if (name.startsWith('network-wireless-acquiring') || name.startsWith('network-wireless-connected'))
        return 'wifi';
    if (name.startsWith('network-wireless-no-route') || name.startsWith('network-wireless-offline'))
        return 'signal-wifi-0-bar';
    if (name.startsWith('network-wireless-disabled') || name.startsWith('network-wireless-hardware-disabled'))
        return 'wifi-off';
    if (name.startsWith('network-wired'))
        return 'lan';
    if (name.startsWith('network-vpn'))
        return 'vpn-key';
    if (name.startsWith('network-cellular'))
        return 'network-wifi-3-bar';
    if (name.startsWith('network-error') || name.startsWith('network-offline'))
        return 'wifi-off';
    return 'wifi';
}

export function volumeIcon(gnomeName) {
    const name = (gnomeName ?? '').replace(/-symbolic$/, '');
    if (name.endsWith('muted'))
        return 'volume-off';
    if (name.endsWith('low'))
        return 'volume-mute';
    if (name.endsWith('medium'))
        return 'volume-down';
    return 'volume-up';
}

// percent: 0–100. The lying battery of Material's Android set, as the
// design has it.
export function batteryIcon(percent, charging) {
    if (charging)
        return 'battery-android-bolt';
    if (percent >= 95)
        return 'battery-android-full';
    if (percent < 10)
        return 'battery-android-alert';
    // Seven steps of bars, as Material draws them.
    const bars = Math.max(0, Math.min(6, Math.floor(percent / 100 * 7)));
    return `battery-android-${bars}`;
}

export const LOW_BATTERY = 20;

export function batteryLow(percent, charging) {
    return !charging && percent < LOW_BATTERY;
}

// Units are written with a space (design system, Voice).
export function percentText(value) {
    return `${Math.round(value)} %`;
}

// "1 h 45 min", "45 min", "under a minute".
export function durationText(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 1)
        return 'under a minute';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0)
        return `${rest} min`;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// How far off something is: "now", "in 10 min", "in 1 h 5 min".
export function untilText(seconds) {
    return seconds < 60 ? 'now' : `in ${durationText(seconds)}`;
}

// The input source's short name, as GNOME has it ("de", "us").
export function layoutText(shortName) {
    return (shortName ?? '').toUpperCase();
}

// A running timer in the bar: "02:14", or "1:02:14" past an hour.
export function elapsedText(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const two = n => String(n).padStart(2, '0');
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor(s / 60) % 60;
    return hours > 0 ? `${hours}:${two(minutes)}:${two(s % 60)}` : `${two(minutes)}:${two(s % 60)}`;
}
