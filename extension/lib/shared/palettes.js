// The eight colour styles of the swatch row, in its order. Each is
// Material 3's SchemeVibrant (contrast 0) of one seed, worked out ahead with
// @material/material-color-utilities 0.3.0; blue is the design system's own
// palette. Teal (#00a896) and salmon (#fa8072) are seeds Halo adds; white
// is SchemeMonochrome. Code reads roles, never hex.

export const COLOURS = ['blue', 'violet', 'green', 'teal', 'orange', 'salmon', 'pink', 'white'];

export const palettes = {
    blue: {
        light: {primary: '#0045fc', onPrimary: '#ffffff', pc: '#dee1ff', onPc: '#0033c2', sc: '#e5deff', onSc: '#474364', tc: '#eedbff', onTc: '#523d6c', surf: '#edecfb', bright: '#fbf8ff', high: '#e7e7f5', highest: '#e2e1ef', low: '#f3f2ff', on: '#191b25', onVar: '#444654', outline: '#757685', outVar: '#c5c5d6'},
        dark: {primary: '#b9c3ff', onPrimary: '#00228b', pc: '#0033c2', onPc: '#dee1ff', sc: '#474364', onSc: '#e5deff', tc: '#523d6c', onTc: '#eedbff', surf: '#1d1f29', bright: '#373843', high: '#282934', highest: '#33343f', low: '#191b25', on: '#e2e1ef', onVar: '#c5c5d6', outline: '#8e909f', outVar: '#444654'},
    },
    violet: {
        light: {primary: '#7706ff', onPrimary: '#ffffff', pc: '#eaddff', onPc: '#5a00c6', sc: '#f2daff', onSc: '#523f5f', tc: '#ffd5ff', onTc: '#5e3962', surf: '#f3ebfa', bright: '#fef7ff', high: '#ede5f4', highest: '#e8dfee', low: '#f9f1ff', on: '#1d1a24', onVar: '#4a4453', outline: '#7b7484', outVar: '#ccc3d5'},
        dark: {primary: '#d2bbff', onPrimary: '#3f008e', pc: '#5a00c6', onPc: '#eaddff', sc: '#523f5f', onSc: '#f2daff', tc: '#5e3962', onTc: '#ffd5ff', surf: '#221e28', bright: '#3c3743', high: '#2c2833', highest: '#37333e', low: '#1d1a24', on: '#e8dfee', onVar: '#ccc3d5', outline: '#958e9e', outVar: '#4a4453'},
    },
    green: {
        light: {primary: '#006e2e', onPrimary: '#ffffff', pc: '#67ff8d', onPc: '#005321', sc: '#c1ecd4', onSc: '#284e3c', tc: '#aaf0df', onTc: '#005045', surf: '#e6f1e3', bright: '#f2fcee', high: '#e1ebdd', highest: '#dbe5d7', low: '#ecf7e8', on: '#151e15', onVar: '#3e4a3d', outline: '#6e7a6c', outVar: '#bdcaba'},
        dark: {primary: '#00e468', onPrimary: '#003915', pc: '#005321', onPc: '#67ff8d', sc: '#284e3c', onSc: '#c1ecd4', tc: '#005045', onTc: '#aaf0df', surf: '#192219', bright: '#323c32', high: '#232c23', highest: '#2e372e', low: '#151e15', on: '#dbe5d7', onVar: '#bdcaba', outline: '#879485', outVar: '#3e4a3d'},
    },
    teal: {
        light: {primary: '#006b5f', onPrimary: '#ffffff', pc: '#00fee3', onPc: '#005047', sc: '#bcebee', onSc: '#1e4d50', tc: '#afecff', onTc: '#004e5d', surf: '#e2f1ed', bright: '#eefdf8', high: '#ddebe7', highest: '#d7e6e1', low: '#e8f7f2', on: '#111e1b', onVar: '#394a46', outline: '#697b76', outVar: '#b8cac5'},
        dark: {primary: '#00dfc7', onPrimary: '#003731', pc: '#005047', onPc: '#00fee3', sc: '#1e4d50', onSc: '#bcebee', tc: '#004e5d', onTc: '#afecff', surf: '#15221f', bright: '#2f3c39', high: '#202c2a', highest: '#2a3734', low: '#111e1b', on: '#d7e6e1', onVar: '#b8cac5', outline: '#839490', outVar: '#394a46'},
    },
    orange: {
        light: {primary: '#ab3500', onPrimary: '#ffffff', pc: '#ffdbd0', onPc: '#832700', sc: '#ffdcc5', onSc: '#633e22', tc: '#ffddb6', onTc: '#633f06', surf: '#ffe9e3', bright: '#fff8f6', high: '#ffe2da', highest: '#f9ddd4', low: '#fff1ed', on: '#271813', onVar: '#58423a', outline: '#8c7169', outVar: '#dfc0b6'},
        dark: {primary: '#ffb59c', onPrimary: '#5c1900', pc: '#832700', onPc: '#ffdbd0', sc: '#633e22', onSc: '#ffdcc5', tc: '#633f06', onTc: '#ffddb6', surf: '#2b1c17', bright: '#47352f', high: '#362621', highest: '#42312b', low: '#271813', on: '#f9ddd4', onVar: '#dfc0b6', outline: '#a78b82', outVar: '#58423a'},
    },
    salmon: {
        light: {primary: '#c0000d', onPrimary: '#ffffff', pc: '#ffdad5', onPc: '#930007', sc: '#ffdbcc', onSc: '#653d29', tc: '#ffdcc1', onTc: '#683c0f', surf: '#ffe9e6', bright: '#fff8f7', high: '#ffe2de', highest: '#f9dcd8', low: '#fff0ee', on: '#271816', onVar: '#58413e', outline: '#8c716d', outVar: '#dfbfbb'},
        dark: {primary: '#ffb4aa', onPrimary: '#690003', pc: '#930007', onPc: '#ffdad5', sc: '#653d29', onSc: '#ffdbcc', tc: '#683c0f', onTc: '#ffdcc1', surf: '#2b1c1a', bright: '#473532', high: '#372624', highest: '#42302e', low: '#271816', on: '#f9dcd8', onVar: '#dfbfbb', outline: '#a78a86', outVar: '#58413e'},
    },
    pink: {
        light: {primary: '#ba005b', onPrimary: '#ffffff', pc: '#ffd9e1', onPc: '#8f0044', sc: '#ffdad7', onSc: '#663b39', tc: '#ffdbcf', onTc: '#6e3824', surf: '#ffe8ec', bright: '#fff8f8', high: '#fce2e6', highest: '#f6dce1', low: '#fff0f2', on: '#26181b', onVar: '#564146', outline: '#897176', outVar: '#ddbfc5'},
        dark: {primary: '#ffb1c4', onPrimary: '#65002e', pc: '#8f0044', onPc: '#ffd9e1', sc: '#663b39', onSc: '#ffdad7', tc: '#6e3824', onTc: '#ffdbcf', surf: '#2a1c1f', bright: '#453538', high: '#352629', highest: '#413034', low: '#26181b', on: '#f6dce1', onVar: '#ddbfc5', outline: '#a48a8f', outVar: '#564146'},
    },
    white: {
        light: {primary: '#000000', onPrimary: '#e2e2e2', pc: '#3b3b3b', onPc: '#ffffff', sc: '#d4d4d4', onSc: '#1b1b1b', tc: '#747474', onTc: '#ffffff', surf: '#eeeeee', bright: '#f9f9f9', high: '#e8e8e8', highest: '#e2e2e2', low: '#f3f3f3', on: '#1b1b1b', onVar: '#474747', outline: '#777777', outVar: '#c6c6c6'},
        dark: {primary: '#ffffff', onPrimary: '#1b1b1b', pc: '#d4d4d4', onPc: '#000000', sc: '#474747', onSc: '#e2e2e2', tc: '#919191', onTc: '#000000', surf: '#1f1f1f', bright: '#393939', high: '#2a2a2a', highest: '#353535', low: '#1b1b1b', on: '#e2e2e2', onVar: '#c6c6c6', outline: '#919191', outVar: '#474747'},
    },
};

// Fixed, they do not follow the style.
export const warn = {light: '#f2b600', dark: '#f5cc4a', on: '#3a2c00'};

// Error and status colours of the design system: fixed, whatever the style.
export const fixed = {
    light: {error: '#ba1a1a', onError: '#ffffff', ec: '#ffdad6', onEc: '#93000a', good: '#2e7d32', onGood: '#ffffff'},
    dark: {error: '#ffb4ab', onError: '#690005', ec: '#93000a', onEc: '#ffdad6', good: '#7bd88f', onGood: '#00390f'},
};

// An unknown colour falls back to blue, so a broken setting still draws.
// Besides the style's roles: the fixed ones, and the inverse surface (the
// island's pill, snackbars), which is the other scheme's highest surface.
export function palette(colour, scheme) {
    const style = palettes[colour] ?? palettes.blue;
    const other = scheme === 'dark' ? 'light' : 'dark';
    const roles = style[scheme];
    return {
        ...roles, ...fixed[scheme], inverse: style[other].highest, onInverse: style[other].on,
        // A floating frame and the pills on it: in light the pills are the
        // brightest surface; in dark the frame sinks so they still stand out.
        well: scheme === 'light' ? roles.highest : roles.surf,
        raised: scheme === 'light' ? roles.bright : roles.highest,
        // What is switched on (a tile, a connected device): the strong
        // primary in light; in dark the deep container, so it does not glare.
        loud: scheme === 'light' ? roles.primary : roles.pc,
        onLoud: scheme === 'light' ? roles.onPrimary : roles.onPc,
        // The chosen row of a list: soft in light, bright in dark.
        chosen: scheme === 'light' ? roles.pc : roles.primary,
        onChosen: scheme === 'light' ? roles.onPc : roles.onPrimary,
        // The quick settings: the panel, the cards on it, and what sits
        // sunk into a card (an icon's circle, a row inside a card).
        panel: scheme === 'light' ? roles.low : roles.surf,
        card: scheme === 'light' ? roles.bright : roles.high,
        dent: scheme === 'light' ? roles.high : roles.bright,
        // Strong red and green on the island's dark surface (hang up,
        // answer, stop): the light scheme's, which hold white text.
        alarm: fixed.light.error,
        onAlarm: fixed.light.onError,
        go: fixed.light.good,
        onGo: fixed.light.onGood,
    };
}

// "#rrggbb" to [r, g, b] in 0–1, for Cairo.
export function rgb(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

// "#rrggbb" plus an alpha 0–1 as CSS rgba(), for set_style().
export function rgba(hex, alpha = 1) {
    const [r, g, b] = rgb(hex).map(channel => Math.round(channel * 255));
    return `rgba(${r},${g},${b},${alpha})`;
}

// A colour on the way from one hex to another, for colour transitions that
// are drawn or set in code.
export function mix(from, to, t) {
    const a = rgb(from);
    const b = rgb(to);
    const k = Math.max(0, Math.min(1, t));
    const channels = a.map((value, i) => Math.round((value + (b[i] - value) * k) * 255));
    return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}
