// The expressive shapes as plain numbers, so they can be tested without a
// shell: r(θ) = R · (1 − a · (1 − cos(n·θ)) / 2), turned by −90°.

export const POINTS = 240;

export const CIRCLE = Object.freeze({n: 0, a: 0});
// An app's tile: a square with round corners (the corners reach out, so a
// cookie or a circle morphs into it point by point).
export const TILE = Object.freeze({n: 4, a: -0.16});
export const COOKIE = Object.freeze({n: 6, a: 0.14});
// A soft eight-scalloped sun.
export const SUNNY = Object.freeze({n: 8, a: 0.1});
// A bolder flower.
export const BLOOM = Object.freeze({n: 8, a: 0.22});
// The battery badge on the energy page: ten soft scallops.
export const BADGE = Object.freeze({n: 10, a: 0.12});

// The radius at one angle, as a share of the full radius.
export function radiusAt({n, a}, theta) {
    return 1 - a * (1 - Math.cos(n * theta)) / 2;
}

// Closed outline around (cx, cy) with full radius r: [[x, y], …].
export function outline(shape, cx, cy, r, points = POINTS) {
    const result = [];
    for (let i = 0; i < points; i++) {
        const theta = (i / points) * 2 * Math.PI;
        const rho = r * radiusAt(shape, theta);
        const angle = theta - Math.PI / 2;
        result.push([cx + rho * Math.cos(angle), cy + rho * Math.sin(angle)]);
    }
    return result;
}

// A morph between two shapes runs point by point, so a 4-point shape
// turns into an 8-point one without the outline tearing.
export function between(from, to, cx, cy, r, t, points = POINTS) {
    const a = outline(from, cx, cy, r, points);
    const b = outline(to, cx, cy, r, points);
    return a.map(([ax, ay], i) => [ax + (b[i][0] - ax) * t, ay + (b[i][1] - ay) * t]);
}
