import React, { ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Spacing, Radii, Shadows } from '@/constants/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Elevation level */
  variant?: 'elevated' | 'outlined' | 'filled';
}

export function Card({ children, style, variant = 'elevated' }: CardProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' && styles.elevated,
        variant === 'outlined' && styles.outlined,
        variant === 'filled' && styles.filled,
        style,
      ]}>
      {children}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  base: {
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  elevated: {
    backgroundColor: colors.surfaceContainerLowest,
    ...Shadows.card,
  },
  outlined: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
  },
  filled: {
    backgroundColor: colors.surfaceContainerLow,
  },
});
