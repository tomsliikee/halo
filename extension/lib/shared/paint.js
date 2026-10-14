// Shared helpers for everything Halo draws with Cairo.

import {rgb} from './palettes.js';
import {outline} from './shapes.js';

export function setSource(cr, hex, alpha = 1) {
    const [r, g, b] = rgb(hex);
    cr.setSourceRGBA(r, g, b, alpha);
}

// A rectangle with its own radius per corner: [topLeft, topRight,
// bottomRight, bottomLeft], each clamped to half the shorter side.
export function roundedRect(cr, x, y, width, height, radii) {
    const limit = Math.min(width, height) / 2;
    const [tl, tr, br, bl] = (Array.isArray(radii) ? radii : [radii, radii, radii, radii])
        .map(r => Math.max(0, Math.min(limit, r)));
    cr.newSubPath();
    cr.arc(x + width - tr, y + tr, tr, -Math.PI / 2, 0);
    cr.arc(x + width - br, y + height - br, br, 0, Math.PI / 2);
    cr.arc(x + bl, y + height - bl, bl, Math.PI / 2, Math.PI);
    cr.arc(x + tl, y + tl, tl, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

export function polygon(cr, points) {
    cr.newSubPath();
    points.forEach(([x, y], i) => (i === 0 ? cr.moveTo(x, y) : cr.lineTo(x, y)));
    cr.closePath();
}

export function shapePath(cr, shape, cx, cy, r) {
    polygon(cr, outline(shape, cx, cy, r));
}
