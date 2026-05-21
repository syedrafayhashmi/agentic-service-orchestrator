/**
 * IntentCapture Screen
 * Maps to: intent_capture_modern_airy_variant
 *
 * Landing page with aurora hero section, AI prompt bar,
 * and horizontally-scrollable suggestion chips.
 */

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { StyleSheet, View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ServiceHeader } from '@/components/ServiceHeader';
import { AIPromptBar } from '@/components/AIPromptBar';
import { Chip } from '@/components/Chip';
import { OnboardingModal } from '@/components/OnboardingModal';
import { Typography, Spacing, Shadows, Layout } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

interface IntentCaptureScreenProps {
  onSubmit?: (text: string) => void;
  onMenuPress?: () => void;
  isSidebarOpen?: boolean;
}

const SUGGESTIONS = [
  { label: 'House Cleaning', icon: 'cleaning-services' as const },
  { label: 'Plumbing Fix', icon: 'plumbing' as const },
  { label: 'Moving Help', icon: 'local-shipping' as const },
];

const MORNING_START_HOUR = 6;
const AFTERNOON_START_HOUR = 12;
const EVENING_START_HOUR = 18;
const NIGHT_START_HOUR = 21;

const getTimeGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour >= MORNING_START_HOUR && hour < AFTERNOON_START_HOUR) return 'Good morning';
  if (hour >= AFTERNOON_START_HOUR && hour < EVENING_START_HOUR) return 'Good afternoon';
  if (hour >= EVENING_START_HOUR && hour < NIGHT_START_HOUR) return 'Good evening';
  return 'Good night';
};

export function IntentCaptureScreen({ onSubmit, onMenuPress, isSidebarOpen }: IntentCaptureScreenProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { profile } = useAuthStore();
  const [now, setNow] = React.useState(() => new Date());
  const greeting = React.useMemo(() => getTimeGreeting(now), [now]);
  
  // Show onboarding if profile is incomplete
  const isProfileIncomplete = !profile || !profile.phone_number || !profile.address || !profile.dob || !profile.exact_location;

  // Pulse animation for the sparkle icon glow
  const pulseOpacity = useSharedValue(0.3);
  React.useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.8, { duration: 2000 }),
      -1,
      true
    );
  }, [pulseOpacity]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const promptAndChips = (
    <View style={styles.promptWrapper}>
      {/* AI Prompt Bar */}
      <View style={styles.promptSection}>
        <AIPromptBar
          placeholder="Describe what you need..."
          onSubmit={onSubmit}
        />
      </View>

      {/* Suggestion Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
        style={styles.chipsScroll}>
        {SUGGESTIONS.map((s) => (
          <Chip
            key={s.label}
            label={s.label}
            icon={s.icon}
            onPress={() => onSubmit?.(s.label)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Layout.headerHeight + Spacing.xxl, paddingBottom: isDesktop ? 0 : 240 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* Aurora background glow */}
          <View style={styles.auroraBg} />

          {/* Sparkle icon */}
          <View style={styles.sparkleContainer}>
            <Animated.View style={[styles.sparkleGlow, pulseStyle]} />
            <View style={styles.sparkleCircle}>
              <MaterialIcons name="auto-awesome" size={36} color={colors.primary} />
            </View>
          </View>

          {/* Greeting */}
          <Text style={[Typography.headlineLgMobile, styles.greeting]}>{greeting}</Text>
          <Text style={[Typography.bodyLg, styles.subtitle]}>How can I assist you today?</Text>
        </View>

        {isDesktop && promptAndChips}
      </ScrollView>

      {/* Floating Bottom Section for Mobile */}
      {!isDesktop && (
        <View style={[styles.bottomFloat, { paddingBottom: Math.max(insets.bottom, Spacing.xl) }]}>
          {promptAndChips}
        </View>
      )}
      
      {/* Onboarding Modal - blocks interaction until profile is complete */}
      <OnboardingModal visible={isProfileIncomplete} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.marginMobile,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    minHeight: 320,
    marginBottom: Spacing.xxl,
    width: '100%',
    maxWidth: 800,
    borderRadius: 80,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLow,
  },
  auroraBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.auroraCyan,
    opacity: 0.12,
    borderRadius: 64,
  },
  sparkleContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  sparkleGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.auroraBlue,
  },
  sparkleCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.floating,
  },
  greeting: {
    color: colors.onSurface,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  promptWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  promptSection: {
    width: '100%',
    alignItems: 'center',
  },
  chipsScroll: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    marginTop: Spacing.lg,
  },
  chipsContainer: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
  },
  bottomFloat: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.marginMobile,
    paddingTop: Spacing.lg,
    backgroundColor: colors.surface + 'F0',
    alignItems: 'center',
  },
});
