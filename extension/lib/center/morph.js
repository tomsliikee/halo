// The center growing out of the clock: where its shape is when a spring has
// taken it `t` of the way from one rectangle to another. Size and place
// follow the spring past its end and back; corners stop there. The colour
// turns within the first part of the way, so the shape that grows is the
// card's and no grey lies between a white island and a dark card.
//
// from, to: {x, y, width, height, radius} in stage pixels.

const lerp = (a, b, k) => a + (b - a) * k;
// The share of the way by which the colour has fully turned.
const COLOUR_TURN = 0.3;

export function morphAt(from, to, t) {
    const share = Math.max(0, Math.min(1, t));
    // The centre moves, so an overshoot widens both sides alike.
    const centre = lerp(from.x + from.width / 2, to.x + to.width / 2, t);
    const width = Math.max(1, lerp(from.width, to.width, t));
    return {
        x: centre - width / 2,
        y: lerp(from.y, to.y, t),
        width,
        height: Math.max(1, lerp(from.height, to.height, t)),
        radius: lerp(from.radius, to.radius, share),
        share,
        colour: Math.min(1, share / COLOUR_TURN),
    };
}
