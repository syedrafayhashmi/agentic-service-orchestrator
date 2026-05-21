import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Layout } from '@/constants/theme';

export type TabName = 'request' | 'discovery' | 'execution' | 'tracking';

interface TabDef {
  name: TabName;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const TABS: TabDef[] = [
  { name: 'request', label: 'Chat', icon: 'chat-bubble' },
  { name: 'discovery', label: 'Discovery', icon: 'explore' },
  { name: 'execution', label: 'Execution', icon: 'bolt' },
  { name: 'tracking', label: 'Tracking', icon: 'receipt-long' },
];

interface BottomTabBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

export function BottomTabBar({ activeTab, onTabPress }: BottomTabBarProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => onTabPress(tab.name)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}>
            {/* Active indicator pill */}
            {isActive ? (
              <View style={styles.activeIndicator}>
                <MaterialIcons
                  name={tab.icon}
                  size={22}
                  color={colors.primary}
                />
              </View>
            ) : (
              <MaterialIcons
                name={tab.icon}
                size={22}
                color={colors.onSurfaceVariant}
                style={styles.inactiveIcon}
              />
            )}
            <Text
              style={[
                Typography.labelMd,
                styles.label,
                isActive && styles.labelActive,
              ]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '33',
    paddingTop: Spacing.sm,
    // Subtle shadow on top
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxs,
    borderRadius: Radii.md,
    width: 64,
  },
  tabPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  activeIndicator: {
    width: '100%',
    height: 32,
    borderRadius: Radii.full,
    backgroundColor: colors.primaryFixed + '4D', // 30% opacity
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxs,
  },
  inactiveIcon: {
    marginBottom: Spacing.xxs,
    height: 32,
    textAlignVertical: 'center',
  },
  label: {
    color: colors.onSurfaceVariant,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
