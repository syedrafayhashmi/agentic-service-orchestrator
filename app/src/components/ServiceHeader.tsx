import React, { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, Text, Pressable, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Layout } from '@/constants/theme';
import { LoginModal } from '@/components/LoginModal';
import { ProfileModal } from '@/components/ProfileModal';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

interface ServiceHeaderProps {
  /** Opens the sidebar drawer */
  onMenuPress?: () => void;
  /** Legacy back-button support for Chat screen */
  onMenu?: () => void;
  /** Whether the sidebar is currently open */
  isSidebarOpen?: boolean;
  /** Whether the user is logged in */
  isLoggedIn?: boolean;
}

const PROFILE_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDHuJaxR0M3q08NBFOI0mCgclsGoNs7KqV5CMu7JHpl-x03ViD7cfBd0dWq7yrsyfpyeWFLVM4WeOTMXPDkE1dJTdpcla9DnZ5QgvIyx-BLjnf-MH7RrXQ2AnqrlJGwYvChbAA6LLBTMH6i7jwSRNhBcmpHFjCQRS5cUFFOZq5YSN60nwteAe42RvvANFMOBoO0IshqVOt87aMi7bJ0RQKx2wJ0Bntx_1SwLVLmbMDyztm2jZP7s4vOwUwe3AFhxC4MwI56Q2hCxto';

export function ServiceHeader({ onMenuPress, onMenu, isSidebarOpen, isLoggedIn = false }: ServiceHeaderProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [isLoginVisible, setLoginVisible] = useState(false);
  const [isProfileVisible, setProfileVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  
  const { session, profile } = useAuthStore();
  const isUserLoggedIn = isLoggedIn || !!session;
  const avatarUri = profile?.avatar_url || session?.user?.user_metadata?.avatar_url || PROFILE_IMAGE;
  
  const handleMenuPress = onMenuPress ?? onMenu;
  const showBurger = !isDesktop;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.surface + 'CC' }]}>
      <View style={styles.inner}>
        {/* Burger menu — hidden on desktop since the sidebar is always present (collapsed or expanded) */}
        {showBurger ? (
          <Pressable
            onPress={handleMenuPress}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            hitSlop={8}>
            <MaterialIcons name="menu" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}

        {/* Service AI title — solid primary blue */}
        <Text style={[Typography.headlineMd, styles.title, { color: colors.primary }]}>Service AI</Text>

        {/* Profile or Login Action */}
        <View style={styles.rightAction}>
          {isUserLoggedIn ? (
            <Pressable onPress={() => setIsMenuOpen(!isMenuOpen)} style={styles.avatarContainer}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            </Pressable>
          ) : (
            <Pressable style={[styles.loginBtn, { backgroundColor: colors.primary }]} onPress={() => setLoginVisible(true)}>
              <Text style={[Typography.labelLg, styles.loginText]}>Log in</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Profile Dropdown Menu */}
      {isMenuOpen && isUserLoggedIn && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setIsMenuOpen(false)} />
          <View style={[
            styles.menuDropdown,
            { 
              backgroundColor: colors.surfaceContainerLowest, 
              borderColor: colors.outlineVariant,
              right: isDesktop ? Spacing.marginDesktop : Spacing.marginMobile,
            }
          ]}>
            {/* Header info */}
            <View style={styles.menuHeader}>
              <Image source={{ uri: avatarUri }} style={styles.menuAvatar} contentFit="cover" />
              <View style={styles.menuHeaderTexts}>
                <Text style={[Typography.labelLg, styles.menuName, { color: colors.onSurface }]} numberOfLines={1}>
                  {profile?.full_name || session?.user?.user_metadata?.full_name || 'Service User'}
                </Text>
                <Text style={[Typography.labelMd, styles.menuEmail, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                  {session?.user?.email || ''}
                </Text>
              </View>
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.outlineVariant }]} />

            {/* Menu Items */}
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: colors.surfaceContainerHigh },
              ]}
              onPress={() => {
                setIsMenuOpen(false);
                setProfileVisible(true);
              }}
            >
              <MaterialIcons name="person-outline" size={20} color={colors.onSurface} style={styles.menuItemIcon} />
              <Text style={[Typography.labelLg, styles.menuItemText, { color: colors.onSurface }]}>Profile</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: colors.surfaceContainerHigh },
              ]}
              onPress={async () => {
                setIsMenuOpen(false);
                await supabase.auth.signOut();
              }}
            >
              <MaterialIcons name="logout" size={20} color={colors.error} style={styles.menuItemIcon} />
              <Text style={[Typography.labelLg, styles.menuItemText, { color: colors.error }]}>Sign out</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Auth & Profile Modals */}
      <LoginModal visible={isLoginVisible} onClose={() => setLoginVisible(false)} />
      <ProfileModal visible={isProfileVisible} onClose={() => setProfileVisible(false)} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: Layout.headerHeight,
    paddingHorizontal: Spacing.marginMobile,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  title: {
    fontWeight: '700',
  },
  rightAction: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
  },
  loginBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
  },
  loginText: {
    color: '#FFF',
    fontWeight: '600',
  },
  avatar: {
    width: 40,
    height: 40,
  },
  // Dropdown styles
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    height: Platform.OS === 'web' ? '100vh' as any : 2000,
  },
  menuDropdown: {
    position: 'absolute',
    top: Layout.headerHeight + 4,
    width: 240,
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.sm,
    zIndex: 100,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
      } as any,
      default: {
        elevation: 8,
      },
    }),
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  menuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
  },
  menuHeaderTexts: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  menuName: {
    fontWeight: '600',
  },
  menuEmail: {
    fontSize: 11,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.default,
  },
  menuItemIcon: {
    marginRight: Spacing.md,
  },
  menuItemText: {
    fontWeight: '500',
  },
});

