// Where the bar and its three groups stand on a monitor, as plain numbers.
// The design: floating 44px high, 8px from the edges; compact layouts take
// half the width at the left, the middle or the right; "islands" has no
// frame, only three separate pills.

export const BAR_HEIGHT = 44;
export const MARGIN = 8;
// Pills inside the frame keep this much of the frame around them.
export const INSET = 4;

// The work area starts below this: the bar plus the same gap below it as
// above, so windows never touch it.
export function strutHeight(floating) {
    return floating ? MARGIN + BAR_HEIGHT + MARGIN : BAR_HEIGHT;
}

// width: the monitor's width. Returns the frame's rectangle (null for
// islands) and which of its corners are round.
export function frameRect(width, layout, floating) {
    if (layout === 'islands')
        return null;
    const margin = floating ? MARGIN : 0;
    const y = margin;
    const full = width - 2 * margin;
    if (layout === 'full')
        return {x: margin, y, width: full, height: BAR_HEIGHT, corners: floating ? 'all' : 'none'};
    const half = Math.round(full / 2);
    const x = layout === 'left' ? margin
        : layout === 'right' ? width - margin - half
            : Math.round((width - half) / 2);
    // On the edge, only the corners away from it are round.
    let corners = 'all';
    if (!floating)
        corners = layout === 'left' ? 'bottom-right' : layout === 'right' ? 'bottom-left' : 'bottom';
    return {x, y, width: half, height: BAR_HEIGHT, corners};
}

// The x of each group's start, given the frame and the groups' widths:
// left at the start, centre in the middle, right at the end. Groups that
// would overlap are pushed apart from the middle.
export function groupPositions(width, frame, sizes, floating) {
    const start = frame ? frame.x + INSET : (floating ? MARGIN : 0);
    const end = frame ? frame.x + frame.width - INSET : width - (floating ? MARGIN : 0);
    const left = start;
    const right = end - sizes.right;
    let centre = Math.round((start + end - sizes.centre) / 2);
    const gap = frame ? 8 : MARGIN;
    if (centre < left + sizes.left + gap)
        centre = left + sizes.left + gap;
    if (centre + sizes.centre > right - gap)
        centre = Math.max(left + sizes.left + gap, right - gap - sizes.centre);
    return {left, centre, right};
}

// The y of a group: inside the frame it is inset; islands are as tall as
// the bar.
export function groupY(floating, layout) {
    const top = floating ? MARGIN : 0;
    return layout === 'islands' ? top : top + INSET;
}

export function groupHeight(layout) {
    return layout === 'islands' ? BAR_HEIGHT : BAR_HEIGHT - 2 * INSET;
}

// CSS border-radius for a set of round corners at radius r.
export function cornerRadius(corners, r) {
    switch (corners) {
    case 'none': return '0';
    case 'bottom': return `0 0 ${r}px ${r}px`;
    case 'bottom-left': return `0 0 0 ${r}px`;
    case 'bottom-right': return `0 0 ${r}px 0`;
    default: return `${r}px`;
    }
}
