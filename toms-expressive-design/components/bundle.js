/* @ds-bundle: {"format":4,"namespace":"Toms","components":[{"name":"Icon"},{"name":"ShapeBadge"},{"name":"NavBar"},{"name":"Fab"},{"name":"IconButton"},{"name":"Button"},{"name":"ButtonGroup"},{"name":"Switch"},{"name":"WavyProgress"},{"name":"Ring"},{"name":"Tile"},{"name":"ListItem"},{"name":"ListGroup"},{"name":"MetricCell"},{"name":"SectionHeader"},{"name":"TopBar"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  var TONES = {
    primary: { container: 'var(--primary-container)', onContainer: 'var(--on-primary-container)', accent: 'var(--primary)', onAccent: 'var(--on-primary)' },
    secondary: { container: 'var(--secondary-container)', onContainer: 'var(--on-secondary-container)', accent: 'var(--secondary)', onAccent: 'var(--on-secondary)' },
    tertiary: { container: 'var(--tertiary-container)', onContainer: 'var(--on-tertiary-container)', accent: 'var(--tertiary)', onAccent: 'var(--on-tertiary)' },
    error: { container: 'var(--error-container)', onContainer: 'var(--on-error-container)', accent: 'var(--error)', onAccent: 'var(--on-error)' },
    neutral: { container: 'var(--surface-bright)', onContainer: 'var(--on-surface)', accent: 'var(--primary)', onAccent: 'var(--on-primary)' }
  };
  function tone(t) { return TONES[t] || TONES.neutral; }

  /* ---------- expressive shapes (polar approximations of M3 Expressive shapes) ---------- */
  function polar(fn) {
    var d = '';
    for (var i = 0; i <= 160; i++) {
      var t = 2 * Math.PI * i / 160 - Math.PI / 2;
      var r = fn(t);
      d += (i ? ' L' : 'M') + (50 + 50 * r * Math.cos(t)).toFixed(2) + ' ' + (50 + 50 * r * Math.sin(t)).toFixed(2);
    }
    return d + ' Z';
  }
  function cookie(n, a) { return polar(function (t) { return (1 + a * Math.cos(n * t)) / (1 + a); }); }
  function flower(n, a, p) { return polar(function (t) { return (1 - a) + a * Math.pow(Math.abs(Math.cos(n * t / 2)), p); }); }
  function squircle(n) { return polar(function (t) { return 0.94 / Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), 1 / n); }); }
  var HEART = 'M50 92 C 47 88 30 73 15 56 C 3 42 1 32 3 23 C 6 11 16 4 28 4 C 38 4 46 10 50 18 C 54 10 62 4 72 4 C 84 4 94 11 97 23 C 99 32 97 42 85 56 C 70 73 53 88 50 92 Z';
  var cache = {};
  function lazy(key, make) { return function () { if (!cache[key]) cache[key] = make(); return cache[key]; }; }
  var SHAPES = {
    circle: lazy('circle', function () { return polar(function () { return 1; }); }),
    cookie4: lazy('c4', function () { return cookie(4, 0.12); }),
    cookie6: lazy('c6', function () { return cookie(6, 0.1); }),
    cookie7: lazy('c7', function () { return cookie(7, 0.09); }),
    cookie9: lazy('c9', function () { return cookie(9, 0.08); }),
    cookie12: lazy('c12', function () { return cookie(12, 0.06); }),
    sunny: lazy('sunny', function () { return flower(8, 0.16, 1.4); }),
    verySunny: lazy('vsunny', function () { return flower(12, 0.24, 2); }),
    clover4: lazy('cl4', function () { return flower(4, 0.3, 0.5); }),
    clover8: lazy('cl8', function () { return flower(8, 0.2, 0.5); }),
    flower: lazy('flower', function () { return flower(8, 0.32, 0.6); }),
    square: lazy('square', function () { return squircle(5); }),
    pentagon: lazy('pent', function () { return cookie(5, 0.12); }),
    gem: lazy('gem', function () { return cookie(6, 0.16); }),
    burst: lazy('burst', function () { return flower(10, 0.26, 2.5); }),
    boom: lazy('boom', function () { return flower(16, 0.32, 3); }),
    softBurst: lazy('sburst', function () { return flower(10, 0.16, 1.2); }),
    softBoom: lazy('sboom', function () { return flower(14, 0.2, 1.4); }),
    heart: function () { return HEART; }
  };
  var MOODS = {
    soft: ['circle', 'cookie4', 'clover4', 'clover8', 'flower'],
    radiant: ['circle', 'cookie6', 'cookie9', 'sunny', 'verySunny'],
    angular: ['square', 'pentagon', 'gem', 'burst', 'boom'],
    warm: ['circle', 'cookie7', 'softBurst', 'softBoom', 'heart']
  };
  function shapeFor(mood, level) {
    var steps = MOODS[mood] || MOODS.soft;
    if (level == null) return steps[0];
    return steps[Math.max(0, Math.min(4, Math.floor(Math.max(0, Math.min(0.9999, level)) * 5)))];
  }

  /* ---------- icons (Material Symbols) ---------- */
  var ICONS = {
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    insights: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z',
    calendar: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM7 12h5v5H7z',
    person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    favorite: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    moon: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    bulb: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    chevron: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
    chevronUp: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z',
    close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'
  };
  function Icon(props) {
    var size = props.size || 24;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': props.label ? undefined : 'true', role: props.label ? 'img' : undefined, 'aria-label': props.label, style: Object.assign({ display: 'block', flex: 'none' }, props.style) },
      h('path', { fill: props.color || 'currentColor', d: ICONS[props.name] || ICONS.add }));
  }

  function ShapeBadge(props) {
    var size = props.size || 116;
    var name = props.shape || shapeFor(props.mood || 'soft', props.level);
    var d = (SHAPES[name] || SHAPES.circle)();
    var isHeart = name === 'heart';
    var label = props.label;
    return h('div', { style: { position: 'relative', width: size, height: size, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }, role: props.ariaLabel ? 'img' : undefined, 'aria-label': props.ariaLabel },
      h('svg', { width: size, height: size, viewBox: '0 0 100 100', 'aria-hidden': 'true', style: { position: 'absolute', inset: 0 } }, h('path', { d: d, fill: props.fill || 'var(--primary)' })),
      props.children ? h('span', { style: { position: 'relative', color: props.color || 'var(--on-primary)', display: 'flex' } }, props.children) :
        label != null ? h('span', { style: { position: 'relative', marginTop: isHeart ? -size * 0.12 : 0, fontSize: Math.round(size * (String(label).length > 3 ? 0.22 : 0.28)), fontWeight: 800, fontStretch: '112%', fontVariantNumeric: 'tabular-nums', color: props.color || 'var(--on-primary)' } }, label) : null);
  }

  var FLOAT = { background: 'var(--surface-container-highest)', boxShadow: 'var(--shadow-floating)' };

  function NavBar(props) {
    var items = props.items || [{ label: 'Home', icon: 'home' }, { label: 'Search', icon: 'search' }, { label: 'Insights', icon: 'insights' }, { label: 'Profile', icon: 'person' }];
    var sel = props.selected || 0;
    return h('nav', { 'aria-label': props.ariaLabel || 'Main', style: Object.assign({ height: 64, boxSizing: 'border-box', padding: 8, borderRadius: 32, display: 'inline-flex', alignItems: 'center' }, FLOAT) },
      items.map(function (t, i) {
        var on = i === sel;
        return h('button', {
          key: i, type: 'button', 'aria-current': on ? 'page' : undefined, 'aria-label': on ? undefined : t.label,
          onClick: function () { if (props.onSelect) props.onSelect(i); },
          style: on
            ? { height: 48, padding: '0 20px 0 16px', border: 0, borderRadius: 24, background: 'var(--primary)', color: 'var(--on-primary)', display: 'flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 15, fontWeight: 800, fontStretch: '112%', cursor: 'pointer', transition: 'all 260ms cubic-bezier(.3,1.4,.5,1)' }
            : { width: 52, height: 48, border: 0, borderRadius: 24, background: 'none', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
        }, h(Icon, { name: t.icon, size: on ? 20 : 22 }), on ? t.label : null);
      }));
  }

  function Fab(props) {
    return h('button', { type: 'button', 'aria-label': props.label || 'Add', onClick: props.onClick,
      style: { width: 56, height: 56, border: 0, borderRadius: 18, background: 'var(--tertiary-container)', color: 'var(--on-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-floating)', cursor: 'pointer' } },
      h(Icon, { name: props.icon || 'add' }));
  }

  function IconButton(props) {
    return h('button', { type: 'button', 'aria-label': props.label, onClick: props.onClick,
      style: { width: 48, height: 48, border: 0, borderRadius: 24, background: 'var(--surface-container-highest)', color: 'var(--on-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: props.flat ? 'none' : 'var(--shadow-button)', cursor: 'pointer', flex: 'none' } },
      h(Icon, { name: props.icon || 'edit', size: 22 }));
  }

  function Button(props) {
    var tonal = props.variant === 'tonal';
    return h('button', { type: 'button', onClick: props.onClick, disabled: props.disabled,
      style: { height: 56, padding: '0 28px', width: props.full ? '100%' : undefined, border: 0, borderRadius: 28, background: tonal ? 'var(--primary-container)' : 'var(--primary)', color: tonal ? 'var(--on-primary-container)' : 'var(--on-primary)', font: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer', opacity: props.disabled ? 0.38 : 1 } },
      props.children);
  }

  function ButtonGroup(props) {
    var options = props.options || [];
    var last = options.length - 1;
    var small = props.size === 'small';
    return h('div', { role: 'radiogroup', 'aria-label': props.ariaLabel, style: { display: 'flex', gap: 2 } },
      options.map(function (o, i) {
        var on = o.value === props.value;
        var r = small ? 20 : 28;
        var radius = last === 0 ? r + 'px' : i === 0 ? r + 'px 8px 8px ' + r + 'px' : i === last ? '8px ' + r + 'px ' + r + 'px 8px' : '8px';
        return h('button', { key: o.value, type: 'button', role: 'radio', 'aria-checked': on, onClick: function () { if (props.onChange) props.onChange(o.value); },
          style: { height: small ? 40 : 56, padding: small ? '0 16px' : '0 24px', border: 0, borderRadius: on ? (small ? 20 : 28) : radius, background: on ? 'var(--primary)' : 'var(--primary-container)', color: on ? 'var(--on-primary)' : 'var(--on-primary-container)', font: 'inherit', fontSize: small ? 14 : 16, fontWeight: 500, cursor: 'pointer', transition: 'border-radius 220ms cubic-bezier(.3,1.4,.5,1)' } },
          o.label);
      }));
  }

  function Switch(props) {
    var on = !!props.checked;
    return h('button', { type: 'button', role: 'switch', 'aria-checked': on, 'aria-label': props.label, onClick: function () { if (props.onChange) props.onChange(!on); },
      style: { width: 52, height: 32, padding: 0, border: 0, borderRadius: 16, position: 'relative', flex: 'none', cursor: 'pointer', background: on ? 'var(--primary)' : 'var(--surface-container-highest)', boxShadow: on ? 'none' : 'inset 0 0 0 2px var(--outline)' } },
      h('span', { style: { position: 'absolute', top: on ? 4 : 8, left: on ? 24 : 8, width: on ? 24 : 16, height: on ? 24 : 16, borderRadius: 12, background: on ? 'var(--on-primary)' : 'var(--outline)', transition: 'all 200ms cubic-bezier(.2,.8,.2,1.2)' } }));
  }

  function WavyProgress(props) {
    var w = props.width || 340;
    var f = Math.max(0, Math.min(1, props.value || 0));
    var color = props.color || 'var(--primary)';
    var end = Math.max(0, Math.min(w - 10, (w - 6) * f));
    var d = 'M2 7';
    for (var x = 2; x <= end; x += 1.5) d += ' L' + x.toFixed(1) + ' ' + (7 + 3 * Math.sin((x - 2) / 19 * 2 * Math.PI)).toFixed(2);
    var trackX = Math.min(w - 6, end + 9);
    return h('svg', { width: w, height: 14, viewBox: '0 0 ' + w + ' 14', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(f * 100), 'aria-label': props.label, style: { display: 'block', maxWidth: '100%' } },
      f > 0 ? h('path', { d: d, fill: 'none', stroke: color, strokeWidth: 4, strokeLinecap: 'round' }) : null,
      h('line', { x1: trackX, y1: 7, x2: w - 6, y2: 7, stroke: props.trackColor || color, strokeOpacity: props.trackColor ? 1 : 0.22, strokeWidth: 4, strokeLinecap: 'round' }),
      h('circle', { cx: w - 3, cy: 7, r: 2, fill: color }));
  }

  function Ring(props) {
    var size = props.size || 170, stroke = props.stroke || 12;
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
    var f = Math.max(0, Math.min(1, props.value || 0));
    var inner = props.inner;
    var ri = inner ? r - stroke - 6 : 0, ci = 2 * Math.PI * ri;
    var fi = inner ? Math.max(0, Math.min(1, inner.value || 0)) : 0;
    var rot = 'rotate(-90 ' + mid + ' ' + mid + ')';
    return h('div', { style: { position: 'relative', width: size, height: size, flex: 'none' }, role: 'img', 'aria-label': props.label },
      h('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true', style: { position: 'absolute', inset: 0 } },
        h('circle', { cx: mid, cy: mid, r: r, fill: 'none', stroke: props.trackColor || 'var(--primary-container)', strokeWidth: stroke }),
        h('circle', { cx: mid, cy: mid, r: r, fill: 'none', stroke: props.color || 'var(--primary)', strokeWidth: stroke, strokeLinecap: 'round', strokeDasharray: (c * f).toFixed(1) + ' ' + c.toFixed(1), transform: rot }),
        inner ? h('circle', { cx: mid, cy: mid, r: ri, fill: 'none', stroke: inner.trackColor || 'var(--surface-container-highest)', strokeWidth: stroke }) : null,
        inner ? h('circle', { cx: mid, cy: mid, r: ri, fill: 'none', stroke: inner.color || 'var(--secondary)', strokeWidth: stroke, strokeLinecap: 'round', strokeDasharray: (ci * fi).toFixed(1) + ' ' + ci.toFixed(1), transform: rot }) : null,
        props.children ? h('circle', { cx: mid, cy: mid, r: (inner ? ri : r) - stroke / 2 - 2, fill: 'var(--surface-container-low)' }) : null),
      props.children ? h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } }, props.children) : null);
  }

  function Badge(props) {
    var t = tone(props.tone);
    var size = props.size || 40;
    return h(ShapeBadge, { size: size, shape: props.shape || 'cookie9', fill: props.solid ? t.accent : t.container, color: props.solid ? t.onAccent : t.accent },
      h(Icon, { name: props.icon, size: Math.round(size / 2) }));
  }

  function Tile(props) {
    var t = tone(props.tone);
    var neutral = !props.tone || props.tone === 'neutral';
    return h('div', { style: { minHeight: props.height || 176, boxSizing: 'border-box', padding: 16, borderRadius: 28, background: t.container, color: neutral ? 'var(--on-surface)' : (props.tone === 'primary' ? t.accent : t.onContainer), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        props.icon ? h(Badge, { icon: props.icon, tone: neutral ? 'tertiary' : props.tone, solid: !neutral, shape: props.shape || 'cookie7' }) : null,
        h('div', { style: { flex: 1, fontSize: 14, fontWeight: 500 } }, props.title),
        props.trailing || null),
      h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 34, lineHeight: '40px', fontWeight: 800, fontStretch: '112%', fontVariantNumeric: 'tabular-nums' } }, props.value),
          props.unit ? h('span', { style: { fontSize: 14, color: 'var(--on-surface-variant)' } }, props.unit) : null),
        props.label ? h('div', { style: { fontSize: 12, lineHeight: '16px', fontStretch: '88%' } }, props.label) : null,
        props.footer || null));
  }

  function ListItem(props) {
    var t = tone(props.tone || 'tertiary');
    var lead = props.value != null
      ? h(ShapeBadge, { size: 44, shape: props.shape || 'flower', fill: t.container, color: t.onContainer, label: String(props.value) })
      : props.icon ? h(Badge, { icon: props.icon, tone: props.tone || 'tertiary', shape: props.shape || 'cookie12' }) : null;
    var Tag = props.href ? 'a' : 'div';
    return h(Tag, { href: props.href, style: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px 16px 16px', borderRadius: props.radius || 28, background: 'var(--surface-bright)', color: 'var(--on-surface)', textDecoration: 'none' } },
      lead,
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: 14, lineHeight: '20px', fontWeight: 500 } }, props.title),
        props.subtitle ? h('div', { style: { fontSize: 12, lineHeight: '16px', color: 'var(--on-surface-variant)' } }, props.subtitle) : null),
      props.trailing ? h('div', { style: { fontSize: 15, fontWeight: 700, fontStretch: '106%', color: t.accent, whiteSpace: 'nowrap' } }, props.trailing) : null);
  }

  function ListGroup(props) {
    var items = props.items || [];
    var last = items.length - 1;
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      items.map(function (it, i) {
        var radius = last === 0 ? '24px' : i === 0 ? '24px 24px 8px 8px' : i === last ? '8px 8px 24px 24px' : '8px';
        return h('div', { key: i, style: { padding: '16px 20px', borderRadius: radius, background: it.highlight ? 'var(--primary-container)' : 'var(--surface-bright)', color: 'var(--on-surface)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: '20px' } },
            h('span', { style: { fontWeight: 700 } }, it.label), it.control || h('span', null, it.value)),
          it.progress != null ? h('div', { style: { marginTop: 8 } }, h(WavyProgress, { value: it.progress, width: props.barWidth || 340, color: it.color || props.color || 'var(--primary)', label: it.label })) : null,
          it.note ? h('div', { style: { marginTop: 6, fontSize: 12, color: 'var(--on-surface-variant)' } }, it.note) : null);
      }));
  }

  function MetricCell(props) {
    var t = tone(props.tone || 'primary');
    if (props.circle) {
      return h('div', { style: { width: 108, height: 108, borderRadius: 54, flex: 'none', background: t.container, color: !props.tone || props.tone === 'primary' ? t.accent : t.onContainer, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } },
        h('div', { style: { fontSize: String(props.value).length > 6 ? 16 : 20, fontWeight: 800, fontStretch: '112%', fontVariantNumeric: 'tabular-nums' } }, props.value),
        h('div', { style: { fontSize: 12, fontStretch: '88%' } }, props.label));
    }
    return h('div', { style: { flex: 1, minWidth: 0, height: 108, boxSizing: 'border-box', padding: props.pill ? '0 28px' : '0 20px', borderRadius: props.pill ? 54 : 32, background: 'var(--surface-bright)', color: 'var(--on-surface)', display: 'flex', flexDirection: 'column', justifyContent: 'center' } },
      h('div', { style: { fontSize: 14, color: 'var(--on-surface-variant)' } }, props.label),
      h('div', { style: { fontSize: 26, lineHeight: '32px', fontWeight: 800, fontStretch: '112%', fontVariantNumeric: 'tabular-nums' } }, props.value),
      props.note ? h('div', { style: { fontSize: 12, color: 'var(--on-surface-variant)' } }, props.note) : null);
  }

  function SectionHeader(props) {
    return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: props.flush ? 0 : '28px 4px 12px' } },
      h('h2', { style: { margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 750, fontStretch: '108%', color: 'var(--on-surface)', textWrap: 'balance' } }, props.children),
      props.action ? h('a', { href: props.href || '#', style: { fontSize: 14, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap' } }, props.action) : null);
  }

  function TopBar(props) {
    return h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0 20px 4px' } },
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('h1', { style: { margin: 0, fontSize: 36, lineHeight: '44px', fontWeight: 450, color: props.ink || 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, props.title),
        props.subtitle ? h('div', { style: { marginTop: 2, fontSize: 16, lineHeight: '24px', fontWeight: 450, color: props.ink || 'var(--on-surface-variant)', opacity: props.ink ? 0.8 : 1 } }, props.subtitle) : null),
      props.actions || null);
  }

  window.Toms = {
    Icon: Icon, ShapeBadge: ShapeBadge, NavBar: NavBar, Fab: Fab, IconButton: IconButton, Button: Button, ButtonGroup: ButtonGroup,
    Switch: Switch, WavyProgress: WavyProgress, Ring: Ring, Tile: Tile, ListItem: ListItem, ListGroup: ListGroup,
    MetricCell: MetricCell, SectionHeader: SectionHeader, TopBar: TopBar, Badge: Badge,
    icons: Object.keys(ICONS), moods: MOODS, shapes: Object.keys(SHAPES), shapeFor: shapeFor
  };
})();
