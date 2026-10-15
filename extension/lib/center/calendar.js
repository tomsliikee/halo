// The month the center shows, as plain values, so it can be tested
// without a shell. Months count from 0, as Date does.

// The weeks of a month as rows of seven days, starting on weekStart
// (0 Sunday … 6 Saturday). Days outside the month are null.
export function monthGrid(year, month, weekStart = 1) {
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() - weekStart + 7) % 7;
    const cells = [...Array(lead).fill(null), ...Array.from({length: days}, (_, i) => i + 1)];
    while (cells.length % 7 !== 0)
        cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7)
        weeks.push(cells.slice(i, i + 7));
    return weeks;
}

// The weekdays in the order of the grid, as numbers 0 (Sunday) … 6.
export function weekdays(weekStart = 1) {
    return Array.from({length: 7}, (_, i) => (weekStart + i) % 7);
}

// The month before or after: {year, month}.
export function shiftMonth(year, month, step) {
    const date = new Date(year, month + step, 1);
    return {year: date.getFullYear(), month: date.getMonth()};
}

export function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// From the first shown day to the day after the last, for asking the
// calendar server once for the whole month.
export function monthRange(year, month) {
    return {begin: new Date(year, month, 1), end: new Date(year, month + 1, 1)};
}
