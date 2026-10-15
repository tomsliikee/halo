# Tile

A dashboard tile: an icon on a shape, a title, and one big value. Lay tiles out in a two-column grid with 12px gaps, or three columns for small ones.

- Give one tile per screen the screen's tone (`primary`, `secondary`, `tertiary` or `error`) and keep the others `neutral` (`--surface-bright`).
- Corners are 28px. The value is in `metric-l`, with an optional unit in `--on-surface-variant`.
- `trailing` holds a small ring or a quick-add `IconButton`. `footer` holds a sparkline.
