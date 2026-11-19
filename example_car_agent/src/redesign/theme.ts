// "VW Emerald" design tokens (redesign/HANDOFF.md).
export const C = {
  bg: '#060908',
  panel: '#080B0A',
  // Controls (secondary buttons, segments, chips): clearly lighter than the panel behind them.
  carbon: '#26342F',
  carbon2: '#101513',
  // Selectable tiles (voices, options): the brightest dark surface, so choices stand out from the background.
  tile: '#2B3D36',
  tileBorder: 'rgba(52, 211, 153, 0.75)',
  controlBorder: '#8C9995',
  // The panel behind the controls fades from a soft green-grey at the top to near black.
  panelTop: '#0D1411',
  panelMid: '#060908',
  panelBottom: '#020303',
  titanium: '#4B5552',
  olive: '#3A4D3F',
  emerald: '#10B981',
  mint: '#34D399',
  mintLight: '#6EE7B7',
  mintPale: '#D1FAE5',
  text: '#F9FAFB',
  text2: '#AAB2BA',
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
export const PANEL_GRADIENT = 'linear-gradient(180deg, #0D1411 0%, #060908 38%, #020303 100%)';
/** Dims the decorative header (carbon weave, bar) so it stays behind the content. */
export const HEADER_SCRIM = 'linear-gradient(180deg, rgba(3, 5, 4, 0.72) 0%, rgba(3, 5, 4, 0.5) 100%)';
/** The glow of a primary action. */
export const PRIMARY_GLOW = '0 0 26px rgba(16, 185, 129, 0.65)';
/** The card that carries the screen's main message. */
export const MESSAGE_CARD = '#1E2B26';
/** Lifts a control off the background. */
export const LIFT = '0 6px 16px rgba(0, 0, 0, 0.6)';

/** The designs are drawn on a 390 pt wide phone. */
export const DESIGN_WIDTH = 390;
