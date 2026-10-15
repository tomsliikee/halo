// Toms Expressive Design. Global: window.Toms. Colours come from tokens.css custom properties.

export type Tone = 'primary' | 'secondary' | 'tertiary' | 'error' | 'neutral';
export type Mood = 'soft' | 'radiant' | 'angular' | 'warm';
export type ShapeName = 'circle' | 'cookie4' | 'cookie6' | 'cookie7' | 'cookie9' | 'cookie12' | 'sunny' | 'verySunny' | 'clover4' | 'clover8' | 'flower' | 'square' | 'pentagon' | 'gem' | 'burst' | 'boom' | 'softBurst' | 'softBoom' | 'heart';
export type IconName = 'home' | 'search' | 'insights' | 'calendar' | 'person' | 'tune' | 'bell' | 'star' | 'favorite' | 'folder' | 'moon' | 'bolt' | 'bulb' | 'add' | 'edit' | 'back' | 'chevron' | 'chevronUp' | 'close' | 'check';

export interface IconProps { name: IconName; size?: number; color?: string; label?: string; style?: object }

export interface ShapeBadgeProps {
  /** The ladder of shapes; `level` (0–1) picks one of its five steps. */
  mood?: Mood;
  level?: number | null;
  /** A fixed shape instead of the mood's step. */
  shape?: ShapeName;
  size?: number;
  fill?: string;
  color?: string;
  label?: string;
  ariaLabel?: string;
  children?: any;
}

export interface NavBarProps { items?: { label: string; icon: IconName }[]; selected?: number; onSelect?: (i: number) => void; ariaLabel?: string }
export interface FabProps { label?: string; icon?: IconName; onClick?: () => void }
export interface IconButtonProps { label: string; icon?: IconName; flat?: boolean; onClick?: () => void }
export interface ButtonProps { children: any; variant?: 'filled' | 'tonal'; full?: boolean; disabled?: boolean; onClick?: () => void }
export interface ButtonGroupProps { options: { value: string; label: string }[]; value: string; onChange?: (v: string) => void; size?: 'medium' | 'small'; ariaLabel?: string }
export interface SwitchProps { checked: boolean; onChange?: (v: boolean) => void; label: string }
export interface WavyProgressProps { value: number; width?: number; color?: string; trackColor?: string; label?: string }
export interface RingProps { value: number; size?: number; stroke?: number; color?: string; trackColor?: string; inner?: { value: number; color?: string; trackColor?: string }; label?: string; children?: any }
export interface TileProps { tone?: Tone; icon?: IconName; shape?: ShapeName; title: string; value: string; unit?: string; label?: string; trailing?: any; footer?: any; height?: number }
export interface ListItemProps { title: string; subtitle?: string; trailing?: string; tone?: Tone; value?: string | number; shape?: ShapeName; icon?: IconName; href?: string; radius?: number | string }
export interface ListGroupProps { items: { label: string; value?: string; control?: any; progress?: number; note?: string; color?: string; highlight?: boolean }[]; color?: string; barWidth?: number }
export interface MetricCellProps { value: string; label: string; circle?: boolean; pill?: boolean; tone?: Tone; note?: string }
export interface SectionHeaderProps { children: any; action?: string; href?: string; flush?: boolean }
export interface TopBarProps { title: string; subtitle?: string; ink?: string; actions?: any }
