// Labels set in a type role of the design system.
//
// St's CSS cannot reach the axes of a variable font (width, roundness,
// slant), so the role is applied as a Pango attribute instead of through
// the stylesheet.

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

const FAMILY = 'Google Sans Flex';
// The calm, friendly end of the design system's roundness dial.
const ROUNDNESS = 100;
const PX_TO_PT = 0.75;

export const ROLES = {
    'metric-l': {size: 34, weight: 800, width: 112, tabular: true},
    'metric-m': {size: 28, weight: 800, width: 112, tabular: true},
    'metric-s': {size: 22, weight: 700, width: 106, tabular: true},
    'badge-number': {size: 12, weight: 800, width: 112, tabular: true},
    'title-row': {size: 14, weight: 700},
    'body': {size: 14, weight: 400},
    'body-medium': {size: 14, weight: 500},
    'body-strong': {size: 14, weight: 700},
    'label': {size: 12, weight: 450, width: 88},
    'aside': {size: 12, weight: 400, slant: -10},
    'nav-label': {size: 15, weight: 800, width: 112},
    'segment': {size: 13, weight: 600},
    // The top bar
    'bar-date': {size: 15, weight: 450, width: 100},
    'bar-time': {size: 17, weight: 800, width: 112, tabular: true},
    'bar-app': {size: 15, weight: 700, width: 104},
    'bar-status': {size: 15, weight: 800, width: 106, tabular: true},
    'bar-chip': {size: 13, weight: 700, width: 100},
    // Quick settings
    'qs-page': {size: 24, weight: 750, width: 106},
    'qs-tile': {size: 15, weight: 700, width: 104},
    'qs-tile-note': {size: 12, weight: 450, width: 100},
    'qs-row': {size: 15, weight: 600, width: 100},
    'qs-row-note': {size: 12, weight: 400, width: 100},
    'qs-caption': {size: 12, weight: 500, width: 100},
    'qs-link': {size: 14, weight: 700, width: 100},
    'qs-big': {size: 30, weight: 800, width: 112, tabular: true},
    // The island
    'island-headline': {size: 20, weight: 800, width: 106},
    'island-title': {size: 17, weight: 800, width: 104},
    'island-note': {size: 13, weight: 450, width: 100},
    'island-body': {size: 15, weight: 450, width: 100},
    'island-label': {size: 16, weight: 550, width: 100},
    'island-small': {size: 13, weight: 500, width: 100},
    'island-action': {size: 15, weight: 750, width: 104},
    'island-metric': {size: 23, weight: 800, width: 112, tabular: true},
    'island-big': {size: 30, weight: 800, width: 112, tabular: true},
    'island-avatar': {size: 22, weight: 800, width: 106},
};

// The font description of a role; size is in pixels, scaled by the role
// when something draws larger or smaller than its role.
export function descriptionFor(role, scale = 1) {
    const spec = ROLES[role] ?? ROLES.body;
    const description = Pango.FontDescription.from_string(FAMILY);
    // Points, not pixels, so the text follows the desktop's text scaling.
    description.set_size(Math.round(spec.size * scale * PX_TO_PT * Pango.SCALE));
    const axes = [`wght=${spec.weight}`, `wdth=${spec.width ?? 100}`, `ROND=${ROUNDNESS}`];
    if (spec.slant)
        axes.push(`slnt=${spec.slant}`);
    description.set_variations(axes.join(','));
    return description;
}

// Pango colour channels are 16 bit, the theme's are 8 bit.
const CHANNEL = 257;

function apply(label, role, scale) {
    const attributes = new Pango.AttrList();
    attributes.insert(Pango.attr_font_desc_new(descriptionFor(role, scale)));
    if (ROLES[role]?.tabular)
        attributes.insert(Pango.attr_font_features_new('tnum=1'));
    // Heavy weights of the variable font are drawn without the label's own
    // colour, so the colour from the style is passed on as an attribute.
    if (label.get_stage()) {
        const color = label.get_theme_node().get_foreground_color();
        attributes.insert(Pango.attr_foreground_new(
            color.red * CHANNEL, color.green * CHANNEL, color.blue * CHANNEL));
    }
    label.clutter_text.set_attributes(attributes);
}

// Sets a role on an existing label and keeps it there: St replaces the
// attributes whenever the style is recomputed.
export function applyTextRole(label, role, scale = 1) {
    label._haloRole = {role, scale};
    apply(label, role, scale);
    if (!label._haloRoleWatch) {
        label._haloRoleWatch = label.connect_after('style-changed',
            () => apply(label, label._haloRole.role, label._haloRole.scale));
    }
}

export function text(role, {styleClass = '', expand = false, wrap = false, ellipsize = false, scale = 1, text: content = ''} = {}) {
    const label = new St.Label({
        style_class: styleClass,
        text: content,
        x_expand: expand,
        y_align: Clutter.ActorAlign.CENTER,
    });
    applyTextRole(label, role, scale);
    if (wrap) {
        label.clutter_text.line_wrap = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    } else if (ellipsize) {
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    }
    return label;
}
