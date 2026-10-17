// The weather card's numbers from Open-Meteo's answer, as plain values so
// they can be tested without a shell. Ledge asks the same service the same
// way (ledge/extension/lib/weather.js); Halo needs only today.

// {temperature, code, isDay, max, min} or null for an answer without the
// current weather.
export function parseToday(json) {
    const current = json?.current;
    if (!current || typeof current.temperature_2m !== 'number')
        return null;
    const daily = json.daily ?? {};
    return {
        temperature: current.temperature_2m,
        code: current.weather_code ?? 3,
        isDay: current.is_day !== 0,
        max: daily.temperature_2m_max?.[0] ?? null,
        min: daily.temperature_2m_min?.[0] ?? null,
    };
}

// A place Ledge keeps ({name, latitude, longitude}), or null.
export function parsePlace(text) {
    try {
        const place = JSON.parse(text);
        if (typeof place?.name === 'string' && typeof place.latitude === 'number' && typeof place.longitude === 'number')
            return place;
    } catch {
        // An empty setting: no place chosen yet.
    }
    return null;
}

// Weather codes worth a warning: heavy rain and showers, heavy snow, and
// thunderstorms (WMO codes, as Open-Meteo gives them).
const WARNINGS = {65: 'Heavy rain', 82: 'Violent showers', 75: 'Heavy snow', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail'};
// Rain that counts, in mm per quarter hour.
const RAIN_MM = 0.5;

// What comes in the next hour: {rainIn (minutes from now, or null), rain
// (mm in that quarter hour), warning (its words, or null)}, or null for an
// answer without the quarter hours. now in ms.
export function parseSoon(json, now) {
    const quarters = json?.minutely_15;
    if (!Array.isArray(quarters?.time) || !Array.isArray(quarters.precipitation))
        return null;
    let rainIn = null;
    let rain = 0;
    quarters.time.forEach((time, i) => {
        // The place's own time without a zone; its offset makes it UTC.
        const at = Date.parse(`${time.length === 16 ? `${time}:00` : time}Z`) - (json.utc_offset_seconds ?? 0) * 1000;
        const minutes = Math.round((at - now) / 60000);
        if (rainIn === null && minutes >= -15 && minutes <= 60 && quarters.precipitation[i] >= RAIN_MM) {
            rainIn = Math.max(0, minutes);
            rain = quarters.precipitation[i];
        }
    });
    return {rainIn, rain, warning: WARNINGS[json.current?.weather_code] ?? null};
}
