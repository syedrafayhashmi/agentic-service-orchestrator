import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { TabName } from './BottomTabBar';
import { SettingsModal } from './SettingsModal';

const SIDEBAR_WIDTH = Dimensions.get('window').width * 0.78;
const DESKTOP_SIDEBAR_WIDTH = 280;
const COLLAPSED_SIDEBAR_WIDTH = 68;
const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface ChatHistoryItem {
  id: string;
  title: string;
  preview: string;
  time: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
}

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
  isDesktop?: boolean;
  activeTab?: TabName;
  onTabPress?: (tab: TabName) => void;
  onOpenSearch?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
}

function iconForMessage(text: string, colors: any): { icon: keyof typeof MaterialIcons.glyphMap; color: string } {
  const t = (text ?? '').toLowerCase();
  if (t.includes('plumb') || t.includes('pipe') || t.includes('leak')) return { icon: 'plumbing', color: colors.auroraBlue };
  if (t.includes('clean')) return { icon: 'cleaning-services', color: colors.secondary };
  if (t.includes('electric') || t.includes('panel') || t.includes('wire')) return { icon: 'electrical-services', color: '#F5A623' };
  if (t.includes('ac') || t.includes('hvac') || t.includes('cool')) return { icon: 'ac-unit', color: colors.auroraCyan };
  if (t.includes('mov') || t.includes('shift')) return { icon: 'local-shipping', color: colors.tertiary };
  if (t.includes('paint')) return { icon: 'format-paint', color: '#AB47BC' };
  return { icon: 'home-repair-service', color: colors.primary };
}

function timeAgo(isoStr: string): string {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function Sidebar({
  visible,
  onClose,
  isDesktop,
  activeTab,
  onTabPress,
  onOpenSearch,
  onSelectSession,
  onNewChat,
}: SidebarProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isCollapsed = !!isDesktop && !visible;
  const NAV_TABS = [
    { name: 'request' as TabName, label: 'Chat', icon: 'chat-bubble' as const },
    { name: 'discovery' as TabName, label: 'Discovery', icon: 'explore' as const },
    { name: 'execution' as TabName, label: 'Execution', icon: 'bolt' as const },
    { name: 'tracking' as TabName, label: 'Tracking', icon: 'receipt-long' as const },
  ];

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        setHistory([]);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/history`, {
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows: any[] = await res.json();

      const items = rows.map((row) => {
        const { icon, color } = iconForMessage(row.user_message ?? '', colors);
        const title = row.user_message
          ? row.user_message.length > 40
            ? `${row.user_message.slice(0, 40)}...`
            : row.user_message
          : 'Untitled Session';
        const preview = row.assistant_message
          ? row.assistant_message.length > 80
            ? `${row.assistant_message.slice(0, 80)}...`
            : row.assistant_message
          : '';
        return {
          id: row.session_id,
          title,
          preview,
          time: timeAgo(row.created_at ?? ''),
          icon,
          iconColor: color,
        } as ChatHistoryItem;
      });
      setHistory(items);
    } catch (error) {
      console.warn('Failed to load chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [colors]);

  useEffect(() => {
    if (session) fetchHistory();
    else setHistory([]);
  }, [fetchHistory, session]);

  useEffect(() => {
    if (visible && session) fetchHistory();
  }, [fetchHistory, session, visible]);

  const sidebarContent = (
    <>
      <View style={[styles.drawerHeader, isCollapsed && styles.centeredHeader]}>
        {isDesktop ? (
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <MaterialIcons name="menu" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : (
          <View style={styles.closeBtn} />
        )}
      </View>

      {!isCollapsed && (
        <Pressable style={styles.searchFieldContainer} onPress={onOpenSearch}>
          <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
          <Text style={styles.searchPlaceholder}>Search chats...</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.newChatBtn, isCollapsed && styles.newChatBtnCollapsed]}
        onPress={() => {
          onNewChat?.();
          if (session) setTimeout(() => fetchHistory(), 300);
          if (!isDesktop) onClose();
        }}
      >
        <MaterialIcons name="add" size={18} color={colors.primary} />
        {!isCollapsed && <Text style={[Typography.labelLg, styles.newChatText]}>New Chat</Text>}
      </Pressable>

      {isCollapsed && (
        <Pressable style={[styles.newChatBtn, styles.searchChatBtn, styles.newChatBtnCollapsed]} onPress={onOpenSearch}>
          <MaterialIcons name="search" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      )}

      <View style={[styles.divider, isCollapsed && styles.dividerCollapsed]} />

      <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}>
        {isDesktop && (
          <View style={styles.navSection}>
            {!isCollapsed && <Text style={[Typography.labelMd, styles.sectionLabel]}>SCREENS</Text>}
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.name;
              return (
                <Pressable
                  key={tab.name}
                  onPress={() => onTabPress?.(tab.name)}
                  style={({ pressed }) => [
                    styles.navItem,
                    isCollapsed && styles.centeredNavItem,
                    isActive && !isCollapsed && styles.navItemActive,
                    isActive && isCollapsed && styles.navItemActiveCollapsed,
                    pressed && !isActive && styles.navItemPressed,
                  ]}
                >
                  <MaterialIcons name={tab.icon} size={24} color={isActive ? colors.primary : colors.onSurfaceVariant} />
                  {!isCollapsed && <Text style={[Typography.labelLg, isActive ? styles.navTextActive : styles.navText]}>{tab.label}</Text>}
                </Pressable>
              );
            })}
            <View style={[styles.divider, isCollapsed && styles.dividerCollapsed]} />
          </View>
        )}

        {!isCollapsed && (
          <View style={styles.sectionRow}>
            <Text style={[Typography.labelMd, styles.sectionLabel]}>RECENT</Text>
            <Pressable onPress={fetchHistory} hitSlop={8}>
              <MaterialIcons name="refresh" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        )}

        {!isCollapsed && loadingHistory && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={colors.auroraPurple} />
          </View>
        )}

        {!isCollapsed && !loadingHistory && history.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="chat-bubble-outline" size={32} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, marginTop: Spacing.sm, textAlign: 'center' }]}>No chat history yet</Text>
          </View>
        )}

        {!isCollapsed &&
          !loadingHistory &&
          history.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.chatCard, pressed && styles.chatCardPressed]}
              onPress={() => {
                onSelectSession?.(item.id);
                onTabPress?.('request');
                onClose();
              }}
            >
              <View style={[styles.chatIcon, { backgroundColor: `${item.iconColor}20` }]}>
                <MaterialIcons name={item.icon} size={20} color={item.iconColor} />
              </View>
              <View style={styles.chatContent}>
                <View style={styles.chatCardTop}>
                  <Text style={[Typography.labelLg, styles.chatTitle]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[Typography.labelMd, styles.chatTime]}>{item.time}</Text>
                </View>
                <Text style={[Typography.bodyMd, styles.chatPreview]} numberOfLines={2}>
                  {item.preview}
                </Text>
              </View>
            </Pressable>
          ))}
      </ScrollView>

      <View style={[styles.divider, isCollapsed && styles.dividerCollapsed]} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          onPress={() => setSettingsVisible(true)}
          style={({ pressed }) => [styles.navItem, isCollapsed && styles.centeredNavItem, pressed && styles.navItemPressed]}
        >
          <MaterialIcons name="settings" size={24} color={colors.onSurfaceVariant} />
          {!isCollapsed && <Text style={[Typography.labelLg, styles.navText]}>Settings</Text>}
        </Pressable>
      </View>

      <SettingsModal visible={isSettingsVisible} onClose={() => setSettingsVisible(false)} />
    </>
  );

  if (isDesktop) {
    return (
      <View style={[styles.desktopSidebar, { paddingTop: insets.top, width: isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : DESKTOP_SIDEBAR_WIDTH }]}>
        {sidebarContent}
      </View>
    );
  }

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
      <View style={[styles.drawer, { paddingTop: insets.top }]}>{sidebarContent}</View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(23, 28, 32, 0.45)',
      zIndex: 99,
    },
    drawer: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.surfaceContainerLowest,
      zIndex: 100,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 4, height: 0 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
        },
        android: { elevation: 16 },
      }),
    },
    desktopSidebar: {
      width: DESKTOP_SIDEBAR_WIDTH,
      backgroundColor: colors.surfaceContainerLowest,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.outlineVariant,
      zIndex: 10,
    },
    drawerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerHigh,
    },
    searchFieldContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerHigh,
      marginHorizontal: Spacing.xl,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderRadius: Radii.full,
      gap: Spacing.sm,
    },
    searchPlaceholder: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
    },
    newChatBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginHorizontal: Spacing.xl,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderRadius: Radii.full,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: `${colors.primaryFixed}30`,
    },
    newChatBtnCollapsed: {
      width: 44,
      height: 44,
      borderRadius: 22,
      paddingHorizontal: 0,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
    },
    newChatText: {
      color: colors.primary,
    },
    searchChatBtn: {
      marginTop: Spacing.sm,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    centeredHeader: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 0,
    },
    centeredNavItem: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 0,
      paddingVertical: Spacing.md,
      width: 48,
      height: 48,
      borderRadius: 24,
      alignSelf: 'center',
    },
    divider: {
      marginHorizontal: Spacing.xl,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.outlineVariant,
      marginVertical: Spacing.md,
    },
    dividerCollapsed: {
      marginHorizontal: 22,
      height: 1.5,
      backgroundColor: colors.outline,
      opacity: 0.6,
    },
    footer: {
      paddingTop: Spacing.xs,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
    },
    sectionLabel: {
      color: colors.onSurfaceVariant,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    loadingState: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: Spacing.xxl,
      paddingHorizontal: Spacing.xl,
    },
    navSection: {
      marginBottom: Spacing.sm,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
    },
    navItemActive: {
      backgroundColor: `${colors.primaryFixed}4D`,
      borderRightWidth: 3,
      borderRightColor: colors.primary,
    },
    navItemActiveCollapsed: {
      backgroundColor: `${colors.primaryFixed}4D`,
    },
    navItemPressed: {
      backgroundColor: colors.surfaceContainerLow,
    },
    navText: {
      color: colors.onSurfaceVariant,
    },
    navTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    historyList: {
      flex: 1,
    },
    chatCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
    },
    chatCardPressed: {
      backgroundColor: colors.surfaceContainerLow,
    },
    chatIcon: {
      width: 40,
      height: 40,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 2,
    },
    chatContent: {
      flex: 1,
    },
    chatCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    chatTitle: {
      color: colors.onSurface,
      flex: 1,
      marginRight: Spacing.sm,
    },
    chatTime: {
      color: colors.onSurfaceVariant,
      flexShrink: 0,
    },
    chatPreview: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 18,
    },
  });
}
