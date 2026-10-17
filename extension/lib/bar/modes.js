// The bar's three modes, as plain rules: "bar" shows the top bar; "island"
// hides it and leaves only the clock island reaching into the window;
// "handle" leaves only a thin grip at the top edge, out of which the clock
// island and everything the island shows come. In both hidden modes
// windows get the whole screen and a push against the top edge brings the
// bar down for a while.

export const BAR_MODES = ['bar', 'island', 'handle'];
// How long a swipe up sends the island away in "island" mode, in seconds.
export const HIDE_SECONDS = [5, 10, 20, 30, 60];

// The grip of "handle" mode: its size and how far from the top it stands,
// as Harbor's handle.
export const HANDLE = {width: 96, height: 6, top: 8};

// Whether the bar is out of sight: always in the hidden modes, over a
// fullscreen window when it should hide there.
export function barAway({mode, fullscreen = false, hideInFullscreen = true}) {
    return mode !== 'bar' || (fullscreen && hideInFullscreen);
}

// Whether the bar takes room from the windows.
export function takesRoom(mode) {
    return mode === 'bar';
}

// The grip's rectangle on a monitor {x, y, width}.
export function handleRect(monitor) {
    return {
        x: Math.round(monitor.x + (monitor.width - HANDLE.width) / 2),
        y: monitor.y + HANDLE.top,
        width: HANDLE.width,
        height: HANDLE.height,
    };
}

// What the resting island (the clock, or a running thing docked in it)
// does in a mode: "shown" where it rests, or "away" above the screen.
//   barShown: the bar is down right now (a push brought it, or mode bar)
//   handleOpen: the pointer is on the grip or the island ("handle")
//   swipedUntil: a swipe up sent it away until this time ("island")
export function restShown({mode, barShown = false, handleOpen = false, swipedUntil = 0, now = 0}) {
    if (mode === 'bar' || barShown)
        return true;
    if (mode === 'handle')
        return handleOpen;
    return now >= swipedUntil;
}

// A drag on the island that sends it away: mostly upwards, far enough.
export const SWIPE_PX = 16;

export function isSwipeUp(dx, dy) {
    return -dy >= SWIPE_PX && -dy > Math.abs(dx);
}
