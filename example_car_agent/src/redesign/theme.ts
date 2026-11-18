// "VW Emerald" design tokens (redesign/HANDOFF.md).
export const C = {
  bg: '#0B0F0E',
  panel: '#0D1210',
  // Controls (secondary buttons, segments, chips): clearly lighter than the panel behind them.
  carbon: '#1D2925',
  carbon2: '#161D1B',
  // Selectable tiles (voices, options): the brightest dark surface, so choices stand out from the background.
  tile: '#24342E',
  tileBorder: 'rgba(52, 211, 153, 0.55)',
  controlBorder: '#6B7773',
  // The panel behind the controls fades from a soft green-grey at the top to near black.
  panelTop: '#121A17',
  panelMid: '#090D0C',
  panelBottom: '#040605',
  titanium: '#4B5552',
  olive: '#3A4D3F',
  emerald: '#10B981',
  mint: '#34D399',
  mintLight: '#6EE7B7',
  mintPale: '#D1FAE5',
  text: '#F9FAFB',
  text2: '#9CA3AF',
  tag: '#D1D5DB',
  onPrimary: '#04140D',
  warning: '#F59E0B',
  warning2: '#FBBF24',
  vent: '#60A5FA',
};

// Android loads each weight as its own family (assets/fonts/Inter-*.ttf); never combine with fontWeight.
export const F = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extrabold: 'Inter-ExtraBold',
};

export const PRIMARY_GRADIENT = 'linear-gradient(180deg, #34D399 0%, #10B981 100%)';
export const GLOW = '0 0 12px rgba(16, 185, 129, 0.35)';
export const PANEL_GRADIENT = 'linear-gradient(180deg, #121A17 0%, #090D0C 42%, #040605 100%)';
/** Lifts a control off the background. */
export const LIFT = '0 6px 16px rgba(0, 0, 0, 0.6)';

/** The designs are drawn on a 390 pt wide phone. */
export const DESIGN_WIDTH = 390;
