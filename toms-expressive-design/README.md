# Toms Expressive Design

A general design language for apps that show a few important numbers and let people act on them. It is built on Material 3 Expressive: one colour scheme read by role, a flexible variable font that changes character with its job, and soft, characterful shapes that carry values.

It grew out of the Pulse app, but it is not tied to it. Use it for any product: finance, habits, travel, tools, dashboards.

## Principles

1. **One scheme, read by role.** Colours come from one seed through the M3 vibrant scheme. Components never name a hex; they name a role (`primary-container`, `on-surface-variant`). Change the seed and everything follows.
2. **One loud thing per screen.** Each screen or section picks a tone (primary, secondary, tertiary or error). Exactly one tile is painted in that tone's container; everything else is neutral (`surface-bright` on `surface-container`).
3. **Numbers lead, words follow.** A block is one big number in `metric-*`, a `label` saying what it is, and at most one `body-strong` sentence comparing it with something the user knows ("3 more than last week").
4. **Shapes carry meaning.** A value sits on an expressive shape instead of in a plain box. The shape grows more pronounced as the value grows, so a glance tells good from poor before reading.
5. **Floating, not docked.** Primary navigation and actions float above the content as rounded bars with a soft shadow. They do not sit in a full-width bottom bar.
6. **Honest labels.** Anything estimated or computed by the app carries an `aside` note saying so.

## Colour

- The screen background is `surface-container`. Cards are `surface-bright`. Floating controls are `surface-container-highest` with `shadow-floating`.
- Tone pairs always travel together: `X` with `on-X`, and `X-container` with `on-X-container`. Never put body text in `outline-variant`.
- **Status** (`status-good`, `status-warn`, `status-bad`) is fixed and does not follow the colour style. Use it only for values judged against a range, never as decoration.
- **Styles.** Ship the default (`seed-blue`) and let users switch seed: violet, green, orange, pink. A wallpaper-based style (Material You) is welcome on Android. A multi-colour style gives each section its own seed.
- Every role has a dark value; the dark theme is the same roles, not an inversion.

## Type

One family, **Google Sans Flex**, a variable font. Each role sets its own axes, so the type has a voice without a second family:

| Role | Weight | Width | Notes |
| --- | --- | --- | --- |
| `metric-*`, `badge-number` | 700–800 | 106–112 | tabular figures |
| `headline`, `title` | 750 | 108 | |
| `label` | 450 | 88 | narrow and quiet |
| `aside` | 400 | 100 | slant −10 |
| `nav-label` | 500 → 800 | 96 → 112 | grows as it is selected |

Roundness (`ROND`) is a mood dial: 100 for calm, friendly screens, 50 for neutral, 0 for sporty or technical ones. Set it once on the screen root (`font-variation-settings: 'ROND' 100`) and use `font-weight` / `font-stretch` per role.

## Shape

- Radii follow the M3 Expressive scale. Use `radius-extra-large` (28) for cards, `radius-extra-large-increased` (32) for big tiles and bars, and `radius-full` for pills and circles.
- **Groups:** related rows sit 4px apart (`space-1`). The group's outer corners are `radius-tile` and every inner corner is `radius-small`, so the rows read as one block.
- **ShapeBadge moods**, each a ladder of five shapes from plain to pronounced:
  - `soft`: circle → 4-cookie → clover → 8-clover → flower
  - `radiant`: circle → 6-cookie → 9-cookie → sunny → very sunny
  - `angular`: square → pentagon → gem → burst → boom
  - `warm`: circle → 7-cookie → soft burst → soft boom → heart

  Pick one mood per section and let the value (0–1) choose the step.
- **Metric grid:** rows alternate a 108px disc and a 108px-tall card. Odd rows use a pill instead of a card for rhythm.

## Space

The screen gutter is `space-4` (16). Text is inset `space-5` (20). There is `space-7` (28) above a section header, `space-3` (12) between tiles, and `space-1` (4) between grouped rows. Floating bottom controls rest 28px above the edge, and content keeps clear of them.

## Motion

Spring-based. Spatial springs (moving, scaling, morphing shapes) may overshoot. Effect springs (colour, opacity, counting numbers) never do. A number counts up lighter and settles at full weight. A progress that reaches 100 % may turn into a travelling wave. Respect `prefers-reduced-motion`.

## Iconography

Material Symbols Rounded, 20–24px. Selected navigation uses the filled form; everything else uses the outlined form. In lists and tiles an icon sits at half size on a 40px shape, either a container-tone shape or a solid tone shape with the `on-` colour. No emoji.

## Voice

Plain, specific and second person. Lead with the number, then compare it with the user's own past rather than a generic norm: "Like last week", "2 more than yesterday at this time". Write units with a space (`12.4 GB`, `1 h 45 min`, `64 %`). Use sentence case everywhere.

## Logo

This system has no logo of its own. Products built on it bring their own mark. Where none exists, set the product name in `display` at weight 800.
