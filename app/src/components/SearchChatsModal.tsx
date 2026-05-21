import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Shadows } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface SearchChatsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
}

export interface SearchChatHistoryItem {
  id: string;
  title: string;
  group: string;
}

function getGroupLabel(isoStr: string): string {
  if (!isoStr) return 'Older';
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Previous 7 Days';
  return 'Older';
}

export function SearchChatsModal({ visible, onClose, onSelectChat, onNewChat }: SearchChatsModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [chats, setChats] = useState<SearchChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    
    setSearchQuery('');

    let active = true;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (active) setChats([]);
          return;
        }
        const res = await fetch(`${API_BASE_URL}/api/history`, {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows: any[] = await res.json();
        if (!active) return;
        
        const items = rows.map((row) => {
          const title = row.user_message
            ? (row.user_message.length > 50 ? row.user_message.slice(0, 50) + '…' : row.user_message)
            : 'Untitled Session';
          return {
            id: row.session_id,
            title,
            group: getGroupLabel(row.created_at),
          };
        });
        setChats(items);
      } catch (e) {
        console.warn('Failed to load search chat history:', e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchHistory();
    return () => {
      active = false;
    };
  }, [visible]);

  const filteredChats = chats.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const groupedChats = filteredChats.reduce((acc, chat) => {
    if (!acc[chat.group]) acc[chat.group] = [];
    acc[chat.group].push(chat);
    return acc;
  }, {} as Record<string, typeof chats>);

  // ── Shared chat list content ─────────────────────────────────────────────
  const chatList = (
    <>
      <Pressable
        style={({ pressed }) => [styles.newChatRow, pressed && styles.rowPressed]}
        onPress={() => { onNewChat?.(); onClose(); }}
      >
        <MaterialIcons name="edit" size={18} color={colors.onSurface} />
        <Text style={[Typography.labelLg, styles.newChatText]}>New chat</Text>
      </Pressable>

      {loading && (
        <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {!loading && chats.length === 0 && (
        <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
          <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>No sessions found.</Text>
        </View>
      )}

      {Object.entries(groupedChats).map(([group, groupChats]) => (
        <View key={group} style={styles.groupSection}>
          <Text style={[Typography.labelMd, styles.groupLabel]}>{group}</Text>
          {groupChats.map(chat => (
            <Pressable
              key={chat.id}
              style={({ pressed }) => [styles.chatRow, pressed && styles.rowPressed]}
              onPress={() => { onSelectChat?.(chat.id); onClose(); }}
            >
              <MaterialIcons name="chat-bubble-outline" size={18} color={colors.onSurfaceVariant} />
              <Text style={[Typography.bodyLg, styles.chatTitle]} numberOfLines={1}>
                {chat.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </>
  );

  // ── Web: compact centered dialog ─────────────────────────────────────────
  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            zIndex: 9999,
            position: 'fixed' as any,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
        pointerEvents="auto"
      >
        {/* Dim backdrop */}
        <Pressable style={[StyleSheet.absoluteFill, styles.webBackdrop]} onPress={onClose} />

        {/* Dialog card */}
        <View style={styles.webDialog}>
          {/* Search row */}
          <View style={styles.headerRow}>
            <View style={styles.searchCapsule}>
              <Pressable onPress={onClose} style={styles.backBtn}>
                <MaterialIcons name="arrow-back" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for chats"
                placeholderTextColor={colors.onSurfaceVariant}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} style={styles.iconBtn}>
                  <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
                </Pressable>
              )}
            </View>
          </View>

          <ScrollView
            style={styles.webListContainer}
            showsVerticalScrollIndicator={false}
          >
            {chatList}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Mobile: full-screen sheet ────────────────────────────────────────────
  const mobileContent = (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.searchCapsule}>
            <Pressable onPress={onClose} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
            <TextInput
              style={styles.searchInput}
              placeholder="Search for chats"
              placeholderTextColor={colors.onSurfaceVariant}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} style={styles.iconBtn}>
                <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
          {chatList}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {mobileContent}
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  // ── Mobile (full-screen sheet) ─────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.surface,
  },
  listContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },

  // ── Shared ─────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    marginRight: Spacing.sm,
    padding: Spacing.xs,
  },
  searchCapsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyLg,
    color: colors.onSurface,
    paddingVertical: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  iconBtn: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: Radii.md,
    marginBottom: Spacing.lg,
  },
  newChatText: {
    color: colors.onSurface,
  },
  groupSection: {
    marginBottom: Spacing.xl,
  },
  groupLabel: {
    color: colors.onSurfaceVariant,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
  },
  chatTitle: {
    color: colors.onSurface,
    flex: 1,
  },
  rowPressed: {
    backgroundColor: colors.surfaceContainerHigh,
  },

  // ── Web-only ───────────────────────────────────────────────────────────────
  webBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  webDialog: {
    width: '100%',
    maxWidth: 480,
    maxHeight: 520,
    backgroundColor: colors.surface,
    borderRadius: Radii.lg,
    overflow: 'hidden',
    ...Shadows.floating,
    zIndex: 1,
  },
  webListContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 400,
  },
});
