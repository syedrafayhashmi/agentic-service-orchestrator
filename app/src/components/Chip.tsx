import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Pressable, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii } from '@/constants/theme';

interface ChipProps {
  label: string;
  /** Material icon name (optional) */
  icon?: keyof typeof MaterialIcons.glyphMap;
  /** Active / selected state */
  active?: boolean;
  onPress?: () => void;
}

export function Chip({ label, icon, active = false, onPress }: ChipProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipInactive,
        pressed && styles.chipPressed,
      ]}>
      {icon && (
        <MaterialIcons
          name={icon}
          size={18}
          color={colors.onSurface}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          Typography.labelLg,
          active ? styles.textActive : styles.textInactive,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',           // shrink-wrap height — prevents vertical stretch
    paddingHorizontal: Spacing.lg,     // 20px — matches px-5 in reference
    paddingVertical: 10,               // matches py-2.5 in reference
    borderRadius: Radii.full,          // pill / capsule shape
    backgroundColor: colors.surfaceContainerHigh + '80', // 50% opacity light grey
  },
  chipActive: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  chipInactive: {
    backgroundColor: colors.surfaceContainerHigh + '80', // #E4E9ED at ~50%
  },
  chipPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  icon: {
    marginRight: Spacing.xs,   // 4px gap between icon and label
  },
  textActive: {
    color: colors.onSurface,
  },
  textInactive: {
    color: colors.onSurface,
  },
});

