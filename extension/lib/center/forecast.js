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
