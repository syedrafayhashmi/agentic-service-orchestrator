/**
 * Service AI Design System
 * Extracted from Google Stitch DESIGN.md
 *
 * "Digital Fluency" — Modern Minimalism + Glassmorphism
 * Font: Hanken Grotesk
 * Grid: 8px unit scale
 */

import { Platform, TextStyle, ViewStyle } from 'react-native';

/* ───────────────────────────────────────────
 * Colors
 * ─────────────────────────────────────────── */

export const ServiceColors = {
  // Surface tones
  surface: '#F6FAFF',
  surfaceDim: '#D6DADF',
  surfaceBright: '#F6FAFF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F0F4F9',
  surfaceContainer: '#EAEEF3',
  surfaceContainerHigh: '#E4E9ED',
  surfaceContainerHighest: '#DFE3E8',
  surfaceBorder: '#C4C7C5',
  surfaceVariant: '#DFE3E8',
  surfaceTint: '#0856CF',

  // On-surface
  onSurface: '#171C20',
  onSurfaceVariant: '#424654',
  inverseSurface: '#2C3135',
  inverseOnSurface: '#EDF1F6',

  // Primary
  primary: '#0041A2',
  primaryContainer: '#0B57D0',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#CED9FF',
  inversePrimary: '#B2C5FF',
  primaryFixed: '#DAE2FF',
  primaryFixedDim: '#B2C5FF',
  onPrimaryFixed: '#001847',
  onPrimaryFixedVariant: '#0040A1',

  // Secondary
  secondary: '#6E45BE',
  secondaryContainer: '#AB82FE',
  onSecondary: '#FFFFFF',
  onSecondaryContainer: '#3F018E',
  secondaryFixed: '#EADDFF',
  secondaryFixedDim: '#D2BBFF',
  onSecondaryFixed: '#25005A',
  onSecondaryFixedVariant: '#5629A4',

  // Tertiary
  tertiary: '#802B00',
  tertiaryContainer: '#A83B00',
  onTertiary: '#FFFFFF',
  onTertiaryContainer: '#FFCFBE',
  tertiaryFixed: '#FFDBCE',
  tertiaryFixedDim: '#FFB599',
  onTertiaryFixed: '#370E00',
  onTertiaryFixedVariant: '#7F2B00',

  // Error
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#93000A',

  // Outline
  outline: '#737785',
  outlineVariant: '#C3C6D6',

  // Aurora gradient colors
  auroraBlue: '#4285F4',
  auroraCyan: '#8AB4F8',
  auroraPurple: '#C67EFD',

  // Semantic
  background: '#F6FAFF',
  onBackground: '#171C20',
  textPrimary: '#1F1F1F',

  // Chip colors
  chipBlueBg: '#E3EDFD',
  chipBlueText: '#001847',

  // Transparent helpers
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ServiceColor = keyof typeof ServiceColors;

/* ───────────────────────────────────────────
 * Typography
 * ─────────────────────────────────────────── */

const fontFamily = 'HankenGrotesk_400Regular';
const fontFamilyMedium = 'HankenGrotesk_500Medium';
const fontFamilySemiBold = 'HankenGrotesk_600SemiBold';

export const Typography = {
  displayLg: {
    fontFamily: fontFamilySemiBold,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.12, // -0.02em
  } as TextStyle,

  headlineLg: {
    fontFamily: fontFamilyMedium,
    fontSize: 32,
    lineHeight: 40,
  } as TextStyle,

  headlineLgMobile: {
    fontFamily: fontFamilyMedium,
    fontSize: 28,
    lineHeight: 36,
  } as TextStyle,

  headlineMd: {
    fontFamily: fontFamilyMedium,
    fontSize: 24,
    lineHeight: 32,
  } as TextStyle,

  bodyLg: {
    fontFamily,
    fontSize: 18,
    lineHeight: 28,
  } as TextStyle,

  bodyMd: {
    fontFamily,
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,

  labelLg: {
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  } as TextStyle,

  labelMd: {
    fontFamily: fontFamilyMedium,
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,
} as const;

/* ───────────────────────────────────────────
 * Spacing (8px unit scale)
 * ─────────────────────────────────────────── */

export const Spacing = {
  /** 2px */
  xxs: 2,
  /** 4px */
  xs: 4,
  /** 8px — base unit */
  sm: 8,
  /** 12px */
  md: 12,
  /** 16px — mobile margin */
  base: 16,
  /** 20px */
  lg: 20,
  /** 24px — gutter / card padding */
  xl: 24,
  /** 32px — desktop margin */
  xxl: 32,
  /** 40px */
  xxxl: 40,
  /** 48px */
  huge: 48,
  /** 64px */
  giant: 64,

  // Semantic aliases
  marginMobile: 16,
  marginDesktop: 32,
  gutter: 24,
  unit: 8,
} as const;

/* ───────────────────────────────────────────
 * Border Radii
 * ─────────────────────────────────────────── */

export const Radii = {
  /** 4px */
  sm: 4,
  /** 8px */
  default: 8,
  /** 12px */
  md: 12,
  /** 16px */
  lg: 16,
  /** 24px */
  xl: 24,
  /** 9999px — pill */
  full: 9999,
} as const;

/* ───────────────────────────────────────────
 * Shadows
 * ─────────────────────────────────────────── */

export const Shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 2,
  } as ViewStyle,

  cardSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  } as ViewStyle,

  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 4,
  } as ViewStyle,
} as const;

/* ───────────────────────────────────────────
 * Layout constants
 * ─────────────────────────────────────────── */

export const Layout = {
  headerHeight: 56,
  bottomTabHeight: Platform.select({ ios: 80, default: 64 }),
  maxContentWidth: 800,
  containerMaxWidth: 1280,
} as const;

/* ───────────────────────────────────────────
 * Aurora gradient definitions
 * ─────────────────────────────────────────── */

export const AuroraGradient = {
  colors: [
    ServiceColors.auroraBlue,
    ServiceColors.auroraPurple,
    ServiceColors.auroraCyan,
  ],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
} as const;

/* ───────────────────────────────────────────
 * Legacy compat (for any remaining refs)
 * ─────────────────────────────────────────── */

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
