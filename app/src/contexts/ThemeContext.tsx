import React, { createContext, useContext, useState } from 'react';
import { ServiceColors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  [K in keyof typeof ServiceColors]: string;
};

// Define DarkColors based on ServiceColors for dark mode
export const DarkColors: ThemeColors = {
  ...ServiceColors,
  // Surface tones (darker variant)
  surface: '#0F1318',
  surfaceDim: '#0A0D10',
  surfaceBright: '#1C2025',
  surfaceContainerLowest: '#0A0D11',
  surfaceContainerLow: '#13171C',
  surfaceContainer: '#1A1E24',
  surfaceContainerHigh: '#22272E',
  surfaceContainerHighest: '#2A303A',
  surfaceBorder: '#3E444D',
  surfaceVariant: '#2D323A',
  surfaceTint: '#4B92FF',

  // On-surface (light text for dark mode)
  onSurface: '#EDF1F7',
  onSurfaceVariant: '#A6AFB9',
  inverseSurface: '#F6FAFF',
  inverseOnSurface: '#171C20',

  // Primary
  primary: '#4B92FF',
  primaryContainer: '#0041A2',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#DAE2FF',
  inversePrimary: '#B2C5FF',
  primaryFixed: '#30457A',
  primaryFixedDim: '#25325C',
  onPrimaryFixed: '#DAE2FF',
  onPrimaryFixedVariant: '#CED9FF',

  // Outline
  outline: '#8E96A0',
  outlineVariant: '#3E444D',

  // Semantic
  background: '#0F1318',
  onBackground: '#EDF1F7',
  textPrimary: '#F3F3F3',

  // Transparent helpers
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
};

// Use the existing ServiceColors as LightColors
export const LightColors: ThemeColors = ServiceColors;

interface ThemeContextType {
  mode: ThemeMode;
  theme: 'light' | 'dark'; // Resolved theme (light or dark)
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light'); // default to light

  const colors = mode === 'dark' ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ mode, theme: mode, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
