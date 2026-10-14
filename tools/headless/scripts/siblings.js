// Thomas' other extensions with the colour styles Halo added: each menu's
// row of swatches is measured against the menu, and each is shown in
// Halo's quick settings with its settings unfolded where it has a fold.
export default async function ({extension, shot, sleep, note, click, Main}) {
    await sleep(1500);
    const find = (actor, test) => {
        if (test(actor))
            return actor;
        for (const child of actor.get_children?.() ?? []) {
            const found = find(child, test);
            if (found)
                return found;
        }
        return null;
    };
    await click(extension._bars.primary.statusPill);
    await sleep(900);
    for (const tile of extension._tiles.shown.filter(t => t.id.startsWith('panel:'))) {
        extension._qs.navigate('hosted', tile);
        await sleep(700);
        const box = tile.menu.box;
        // Unfold the settings, where the swatches usually wait.
        const fold = find(box, actor => /chevron/.test(actor.style_class ?? ''));
        if (fold)
            fold.emit('clicked', 1);
        await sleep(700);
        const swatches = find(box, actor => /swatch(es)?\b/.test(actor.style_class ?? '') && actor.get_n_children?.() > 4);
        if (swatches) {
            const [, natural] = swatches.get_preferred_width(-1);
            note(`${tile.title}: ${swatches.get_n_children()} swatches, natural ${Math.round(natural)} px, given ${Math.round(swatches.width)} px`);
            // The settings fold is at the bottom.
            const adjustment = extension._qs._stack.at(-1).actor.vadjustment;
            adjustment.value = adjustment.upper - adjustment.page_size;
            await sleep(400);
        } else {
            note(`${tile.title}: no swatches found`);
        }
        await shot(`sibling-${tile.title.toLowerCase()}`);
        extension._qs.back();
        await sleep(500);
    }
    extension._qs.close();
    await sleep(400);
    // Ledge keeps its colour in GSettings and draws on the desktop.
    note(`ledge panel button: ${Boolean(Main.panel.statusArea['ledge@thomashaiden'])}`);
}
