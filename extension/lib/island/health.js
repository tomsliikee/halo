// How the computer is doing, as plain values so it can be tested without a
// shell: the hottest sensor, the memory and the disks left, and which of
// them crossed into too hot or too full since the last look.

// Too hot, in °C; and back to fine below this.
export const HOT = 90;
const COOL = 80;
// Too full: less than this share left; and back to fine above twice that.
export const LOW_SHARE = 0.05;

// The hottest of the readings of /sys/class/thermal/*/temp (milli-degrees),
// in °C, or null.
export function hottest(texts) {
    const values = texts.map(text => Number.parseInt(text, 10) / 1000).filter(value => Number.isFinite(value) && value > 0 && value < 150);
    return values.length > 0 ? Math.max(...values) : null;
}

// Which thermal zones to read, from [{path, type}]: the processor's own
// sensor when there is one, as it is the one that runs hot and reads at
// once; the firmware's zones take milliseconds each.
const CPU_TYPES = ['x86_pkg_temp', 'cpu-thermal', 'cpu_thermal', 'k10temp', 'coretemp'];
export function cpuZones(zones) {
    const cpu = zones.filter(zone => CPU_TYPES.includes(zone.type));
    return (cpu.length > 0 ? cpu : zones).map(zone => zone.path);
}

// The share of memory left, from /proc/meminfo, or null.
export function memoryLeft(meminfo) {
    const field = name => Number(new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(meminfo ?? '')?.[1]);
    const total = field('MemTotal');
    const available = field('MemAvailable');
    return total > 0 && Number.isFinite(available) ? available / total : null;
}

// {hot, memory, disk}: each true while it is a problem. A problem stays
// one until it is clearly over, so a value near the line speaks up once.
// readings: {temperature, memory, disk} (°C, share left, share left).
export function problems(readings, before = {}) {
    const {temperature, memory, disk} = readings;
    const over = (value, was, on, off, below) => {
        if (value === null || value === undefined)
            return false;
        if (below)
            return was ? value < off : value < on;
        return was ? value > off : value >= on;
    };
    return {
        hot: over(temperature, before.hot, HOT, COOL, false),
        memory: over(memory, before.memory, LOW_SHARE, 2 * LOW_SHARE, true),
        disk: over(disk, before.disk, LOW_SHARE, 2 * LOW_SHARE, true),
    };
}

// The problems that are new since before, in a fixed order.
export function newProblems(now, before = {}) {
    return ['hot', 'memory', 'disk'].filter(name => now[name] && !before[name]);
}
