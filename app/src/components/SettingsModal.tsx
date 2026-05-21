import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ScrollView,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Shadows } from '@/constants/theme';
import { useTheme, ThemeMode } from '@/contexts/ThemeContext';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

type SubPanel = null | 'theme' | 'help' | 'feedback' | 'about';

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { mode, colors, setMode } = useTheme();
  const [subPanel, setSubPanel] = useState<SubPanel>(null);

  function handleClose() {
    setSubPanel(null);
    onClose();
  }

  // ── Sub‑panel: Theme ──────────────────────────────────────────────
  const ThemePanel = (
    <View style={[styles.container, { backgroundColor: colors.surfaceContainerLowest }]}>
      <View style={[styles.panelHeader, { borderBottomColor: colors.outlineVariant }]}>
        <Pressable onPress={() => setSubPanel(null)} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={[Typography.labelLg, { color: colors.onSurface }]}>Theme</Text>
      </View>
      {(['light', 'dark'] as ThemeMode[]).map((t) => (
        <Pressable
          key={t}
          style={({ pressed }) => [
            styles.menuItem,
            pressed && { backgroundColor: colors.surfaceContainerLow },
          ]}
          onPress={() => setMode(t)}
        >
          <View style={styles.menuItemLeft}>
            <MaterialIcons
              name={t === 'light' ? 'light-mode' : 'dark-mode'}
              size={20}
              color={colors.onSurfaceVariant}
              style={styles.icon}
            />
            <Text style={[styles.menuText, { color: colors.onSurface }]}>
              {t === 'light' ? 'Light' : 'Dark'}
            </Text>
          </View>
          {mode === t && (
            <MaterialIcons name="check" size={18} color={colors.primary} />
          )}
        </Pressable>
      ))}
    </View>
  );

  // ── Sub‑panel: Help ───────────────────────────────────────────────
  const HelpPanel = (
    <View style={[styles.container, { backgroundColor: colors.surfaceContainerLowest }]}>
      <View style={[styles.panelHeader, { borderBottomColor: colors.outlineVariant }]}>
        <Pressable onPress={() => setSubPanel(null)} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={[Typography.labelLg, { color: colors.onSurface }]}>Help</Text>
      </View>
      <ScrollView>
        {[
          {
            icon: 'menu-book' as const,
            label: 'Documentation',
            sub: 'Read the full user guide',
            url: 'https://github.com',
          },
          {
            icon: 'forum' as const,
            label: 'Community Forum',
            sub: 'Ask questions & find answers',
            url: 'https://github.com',
          },
          {
            icon: 'smart-toy' as const,
            label: 'How AI works',
            sub: 'Learn about our AI agents',
            url: 'https://github.com',
          },
        ].map((item) => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [
              styles.menuItem,
              styles.menuItemTall,
              pressed && { backgroundColor: colors.surfaceContainerLow },
            ]}
            onPress={async () => {
              try {
                const supported = await Linking.canOpenURL(item.url);
                if (supported) {
                  await Linking.openURL(item.url);
                }
              } catch (error) {
                console.warn('Failed to open URL:', item.url, error);
              }
            }}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryFixed + '60' }]}>
                <MaterialIcons name={item.icon} size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.menuText, { color: colors.onSurface }]}>{item.label}</Text>
                <Text style={[styles.menuSub, { color: colors.onSurfaceVariant }]}>{item.sub}</Text>
              </View>
            </View>
            <MaterialIcons name="open-in-new" size={16} color={colors.onSurfaceVariant} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // ── Sub‑panel: Send Feedback ──────────────────────────────────────
  const FeedbackPanel = (
    <View style={[styles.container, { backgroundColor: colors.surfaceContainerLowest }]}>
      <View style={[styles.panelHeader, { borderBottomColor: colors.outlineVariant }]}>
        <Pressable onPress={() => setSubPanel(null)} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={[Typography.labelLg, { color: colors.onSurface }]}>Send Feedback</Text>
      </View>
      <ScrollView>
        {[
          {
            icon: 'thumb-up' as const,
            label: 'I like something',
            sub: "Tell us what's working well",
            subject: 'Positive Feedback - Service AI',
          },
          {
            icon: 'thumb-down' as const,
            label: 'I have an issue',
            sub: 'Report a bug or problem',
            subject: 'Bug Report - Service AI',
          },
          {
            icon: 'lightbulb' as const,
            label: 'Feature suggestion',
            sub: 'Share your idea',
            subject: 'Feature Request - Service AI',
          },
        ].map((item) => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [
              styles.menuItem,
              styles.menuItemTall,
              pressed && { backgroundColor: colors.surfaceContainerLow },
            ]}
            onPress={() =>
              Linking.openURL(`mailto:feedback@serviceai.app?subject=${encodeURIComponent(item.subject)}`)
            }
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryFixed + '60' }]}>
                <MaterialIcons name={item.icon} size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.menuText, { color: colors.onSurface }]}>{item.label}</Text>
                <Text style={[styles.menuSub, { color: colors.onSurfaceVariant }]}>{item.sub}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // ── Sub‑panel: About ──────────────────────────────────────────────
  const AboutPanel = (
    <View style={[styles.container, { backgroundColor: colors.surfaceContainerLowest }]}>
      <View style={[styles.panelHeader, { borderBottomColor: colors.outlineVariant }]}>
        <Pressable onPress={() => setSubPanel(null)} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={[Typography.labelLg, { color: colors.onSurface }]}>About</Text>
      </View>
      <View style={styles.aboutLogoRow}>
        <View style={[styles.appIcon, { backgroundColor: colors.primaryFixed }]}>
          <MaterialIcons name="auto-awesome" size={28} color={colors.primary} />
        </View>
        <Text style={[Typography.headlineMd, { color: colors.onSurface, marginTop: Spacing.md }]}>
          Service AI
        </Text>
        <Text style={[Typography.labelMd, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
          Version 1.0.0 (build 1)
        </Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
      {[
        { label: 'Privacy Policy', url: 'https://example.com/privacy' },
        { label: 'Terms of Service', url: 'https://example.com/terms' },
        { label: 'Open Source Licenses', url: 'https://example.com/licenses' },
      ].map((item) => (
        <Pressable
          key={item.label}
          style={({ pressed }) => [
            styles.menuItem,
            pressed && { backgroundColor: colors.surfaceContainerLow },
          ]}
          onPress={() => Linking.openURL(item.url)}
        >
          <Text style={[styles.menuText, { color: colors.onSurface }]}>{item.label}</Text>
          <MaterialIcons name="open-in-new" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      ))}
      <Text style={[styles.copyright, { color: colors.onSurfaceVariant }]}>
        © 2025 Service AI. All rights reserved.
      </Text>
    </View>
  );

  // ── Root menu ─────────────────────────────────────────────────────
  const RootMenu = (
    <View style={[styles.container, { backgroundColor: colors.surfaceContainerLowest }]}>
      <View style={[styles.menuList]}>
        {/* Theme */}
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceContainerLow }]}
          onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        >
          <View style={styles.menuItemLeft}>
            <MaterialIcons
              name={mode === 'dark' ? 'dark-mode' : 'light-mode'}
              size={20}
              color={colors.onSurfaceVariant}
              style={styles.icon}
            />
            <Text style={[styles.menuText, { color: colors.onSurface }]}>Theme</Text>
          </View>
          <View style={styles.menuItemRight}>
            <Text style={[styles.menuSub, { color: colors.onSurfaceVariant }]}>
              {mode === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Switch
              value={mode === 'dark'}
              onValueChange={(val) => setMode(val ? 'dark' : 'light')}
              trackColor={{ false: colors.surfaceContainerHigh, true: colors.primary }}
              thumbColor={colors.onPrimary}
            />
          </View>
        </Pressable>

        {/* Help */}
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceContainerLow }]}
          onPress={() => setSubPanel('help')}
        >
          <View style={styles.menuItemLeft}>
            <MaterialIcons name="help-outline" size={20} color={colors.onSurfaceVariant} style={styles.icon} />
            <Text style={[styles.menuText, { color: colors.onSurface }]}>Help</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        {/* Send Feedback */}
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceContainerLow }]}
          onPress={() => setSubPanel('feedback')}
        >
          <View style={styles.menuItemLeft}>
            <MaterialIcons name="feedback" size={20} color={colors.onSurfaceVariant} style={styles.icon} />
            <Text style={[styles.menuText, { color: colors.onSurface }]}>Send feedback</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        {/* About */}
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceContainerLow }]}
          onPress={() => setSubPanel('about')}
        >
          <View style={styles.menuItemLeft}>
            <MaterialIcons name="info-outline" size={20} color={colors.onSurfaceVariant} style={styles.icon} />
            <Text style={[styles.menuText, { color: colors.onSurface }]}>About</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );

  const activePanel =
    subPanel === 'theme' ? ThemePanel
      : subPanel === 'help' ? HelpPanel
        : subPanel === 'feedback' ? FeedbackPanel
          : subPanel === 'about' ? AboutPanel
            : RootMenu;

  const modalContent = (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      {activePanel}
    </View>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View
        style={[StyleSheet.absoluteFill, { zIndex: 9999, position: 'fixed' as any }]}
        pointerEvents="auto"
      >
        {modalContent}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      {modalContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: 300,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.sm,
    ...Shadows.floating,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  menuList: {
    width: '100%',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  menuItemTall: {
    paddingVertical: Spacing.base,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.md,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  icon: {
    // keeps icon aligned without gap prop in older RN
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    ...Typography.bodyMd,
  },
  menuSub: {
    ...Typography.labelMd,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
  aboutLogoRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  appIcon: {
    width: 64,
    height: 64,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyright: {
    ...Typography.labelMd,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});
