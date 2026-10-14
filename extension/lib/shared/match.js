// Matching an app id to a shipped symbol, as plain data in and out; the
// same rules as Harbor's, so an app looks the same in the dock and the bar.

// The pieces of an app id: "org.libreoffice.LibreOffice.writer.desktop"
// → ["org", "libreoffice", "libreoffice", "writer"].
export function idPieces(appId) {
    return appId.toLowerCase().replace(/\.desktop$/, '').split(/[.\-_]/).filter(Boolean);
}

// The key of the first symbol whose match fits the id, or null. A match
// with a dot, dash or underscore must be the end of the id, a plain word one
// of its pieces; the longer kind is tried first, so "libreoffice-writer"
// wins over "libreoffice".
export function matchSymbol(appId, entries) {
    if (!appId)
        return null;
    const id = appId.toLowerCase().replace(/\.desktop$/, '');
    for (const entry of entries) {
        for (const match of entry.match) {
            if (/[.\-_]/.test(match) && (id === match || id.endsWith(`.${match}`)))
                return entry.key;
        }
    }
    const pieces = new Set(idPieces(appId));
    for (const entry of entries) {
        if (entry.match.some(match => !/[.\-_]/.test(match) && pieces.has(match)))
            return entry.key;
    }
    return null;
}
