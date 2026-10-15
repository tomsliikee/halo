# NavBar

Floating main navigation for three to five top-level screens. It rests 28px above the bottom edge, centred, with the `Fab` beside it.

- 64px tall with 8px padding, on `--surface-container-highest` with `--shadow-floating`, fully rounded.
- The selected item is a `--primary` pill (48px) with icon and label in `nav-label`. Other items show only their icon in `--on-surface-variant`, with the label as the accessible name.
- The pill slides with a spatial spring when the selection changes.
- The consumer provides `items`, `selected` and `onSelect`.
