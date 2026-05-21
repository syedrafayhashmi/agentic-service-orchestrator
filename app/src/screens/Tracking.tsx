import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { ServiceHeader } from '@/components/ServiceHeader';
import { Typography, Spacing, Radii, Shadows, Layout } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { createCalendarEvent } from '@/lib/calendarApi';
import { fetchSessionHistory, Provider, SessionHistoryItem } from '@/lib/chatApi';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

const API_BASE_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const MAX_SESSION_SCAN = 12;

type SessionSummary = {
  session_id: string;
  user_message?: string | null;
  assistant_message?: string | null;
  created_at?: string | null;
};

type TrackingTimelineItem = {
  id: string;
  title: string;
  time?: string;
};

type CompletedExecution = {
  sessionId: string;
  requestTitle: string;
  latestAssistantPreview?: string;
  completedAt?: string;
  provider?: Provider;
  bookingStatus?: string;
  confirmedDate?: string;
  confirmedTime?: string;
  summary?: string;
  notes?: string;
  timeline: TrackingTimelineItem[];
};

type CalendarState = 'idle' | 'loading' | 'done' | 'error';

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
};

const formatDateTime = (value?: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const normalizeRequestTitle = (raw?: string): string => {
  const text = (raw ?? '').trim();
  if (!text) return 'Service request';
  const withoutGreeting = text.replace(/^(hi|hello|hey)[,!\s]*/i, '');
  const withoutLead = withoutGreeting.replace(/^i\s+(need|want|would like)\s+/i, '');
  const normalized = withoutLead.charAt(0).toUpperCase() + withoutLead.slice(1);
  return normalized.length > 100 ? `${normalized.slice(0, 100).trim()}...` : normalized;
};

const normalizeStatus = (status?: string): string => {
  if (!status) return 'Completed';
  const value = status.toLowerCase();
  if (value.includes('confirm') || value.includes('book')) return 'Booked';
  if (value.includes('reject')) return 'Not Confirmed';
  if (value.includes('follow')) return 'Needs Follow-up';
  return 'Completed';
};

const normalizeAssistantUpdate = (text?: string): string | undefined => {
  if (!text) return undefined;
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/here are some recommended providers:?.*$/i, '')
    .trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= 160) return cleaned;
  return `${cleaned.slice(0, 160).trim()}...`;
};

const retellEventTitle = (eventType?: string, fallback?: string): string => {
  if (eventType === 'call_started') return 'Call started';
  if (eventType === 'transcript_updated') return 'Conversation in progress';
  if (eventType === 'call_ended') return 'Call ended';
  if (eventType === 'call_analyzed') return 'Call analyzed and finalized';
  return fallback?.trim() || 'Retell update';
};

const buildCalendarDateTime = (confirmedDate?: string, confirmedTime?: string): string | null => {
  if (!confirmedDate) return null;
  if (confirmedTime) return `${confirmedDate}T${confirmedTime}:00`;
  return `${confirmedDate}T10:00:00`;
};

const parseCompletedExecution = (summary: SessionSummary, messages: SessionHistoryItem[]): CompletedExecution | null => {
  let provider: Provider | undefined;
  let bookingStatus: string | undefined;
  let confirmedDate: string | undefined;
  let confirmedTime: string | undefined;
  let summaryText: string | undefined;
  let notes: string | undefined;
  let completedAt: string | undefined;
  let hasAnalyzedEvent = false;
  let hasEndedEvent = false;
  let hasBookingCard = false;
  let hasRetellEvent = false;
  const timeline: TrackingTimelineItem[] = [];

  messages.forEach((message) => {
    if (message.kind === 'chat' && message.role === 'assistant') {
      message.cards?.forEach((card) => {
        const cardRecord = asRecord(card);
        if (!cardRecord) return;

        const type = asText(cardRecord.type);
        const data = asRecord(cardRecord.data);
        if (!type || !data) return;

        if (type === 'provider') {
          const name = asText(data.name);
          if (name) {
            provider = {
              name,
              address: asText(data.address),
              phone_number: asText(data.phone_number),
              rating: typeof data.rating === 'number' ? data.rating : undefined,
              reviews_summary: asText(data.reviews_summary),
            };
          }
        }

        if (type === 'booking') {
          hasBookingCard = true;
          bookingStatus = asText(data.label) ?? bookingStatus ?? 'CONFIRMED';
          summaryText = asText(data.time) ?? summaryText;
          completedAt = message.created_at ?? completedAt;
        }
      });
    }

    if (message.kind !== 'retell-event') return;
    hasRetellEvent = true;

    let eventType: string | undefined;
    message.cards?.forEach((card) => {
      const cardRecord = asRecord(card);
      if (!cardRecord) return;

      const type = asText(cardRecord.type);
      const data = asRecord(cardRecord.data);
      if (!type || !data) return;

      if (type === 'retell_event') {
        eventType = asText(data.event_type);
      }

      if (type === 'booking_status') {
        bookingStatus = asText(data.status) ?? bookingStatus;
        confirmedDate = asText(data.confirmed_date) ?? confirmedDate;
        confirmedTime = asText(data.confirmed_time) ?? confirmedTime;
        summaryText = asText(data.short_call_summary) ?? summaryText;
        notes = asText(data.provider_notes) ?? notes;
        completedAt = message.created_at ?? completedAt;
      }
    });

    timeline.push({
      id: message.id,
      title: retellEventTitle(eventType, message.text),
      time: message.created_at ?? undefined,
    });

    if (eventType === 'call_analyzed') {
      hasAnalyzedEvent = true;
      completedAt = message.created_at ?? completedAt;
    }
    if (eventType === 'call_ended') {
      hasEndedEvent = true;
      completedAt = message.created_at ?? completedAt;
    }
  });

  const isCompleted = hasAnalyzedEvent || hasEndedEvent || hasBookingCard || Boolean(bookingStatus);
  if (!isCompleted || (!hasRetellEvent && !hasBookingCard)) {
    return null;
  }

  return {
    sessionId: summary.session_id,
    requestTitle: asText(summary.user_message) ?? 'Service request',
    latestAssistantPreview: asText(summary.assistant_message),
    completedAt,
    provider,
    bookingStatus,
    confirmedDate,
    confirmedTime,
    summary: summaryText,
    notes,
    timeline,
  };
};

interface TrackingScreenProps {
  onMenuPress?: () => void;
  isSidebarOpen?: boolean;
  onOpenSession?: (sessionId: string) => void;
}

export function TrackingScreen({ onMenuPress, isSidebarOpen, onOpenSession }: TrackingScreenProps) {
  const { colors } = useTheme();
  const st = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execution, setExecution] = useState<CompletedExecution | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [calendarState, setCalendarState] = useState<CalendarState>('idle');

  const bookingDateTime = useMemo(
    () => buildCalendarDateTime(execution?.confirmedDate, execution?.confirmedTime),
    [execution?.confirmedDate, execution?.confirmedTime]
  );
  const normalizedStatus = useMemo(() => normalizeStatus(execution?.bookingStatus), [execution?.bookingStatus]);
  const friendlyRequestTitle = useMemo(() => normalizeRequestTitle(execution?.requestTitle), [execution?.requestTitle]);
  const assistantUpdate = useMemo(
    () => normalizeAssistantUpdate(execution?.latestAssistantPreview),
    [execution?.latestAssistantPreview]
  );
  const scheduledLabel = useMemo(() => {
    if (execution?.confirmedDate || execution?.confirmedTime) {
      return [execution.confirmedDate, execution.confirmedTime].filter(Boolean).join(' ');
    }
    return execution?.summary;
  }, [execution?.confirmedDate, execution?.confirmedTime, execution?.summary]);

  useEffect(() => {
    setCalendarState('idle');
  }, [execution?.sessionId]);

  const fetchSessionSummaries = useCallback(async (): Promise<SessionSummary[]> => {
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();

    if (!authSession?.access_token) {
      return [];
    }

    const response = await fetch(`${API_BASE_URL}/api/history`, {
      headers: { Authorization: `Bearer ${authSession.access_token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `History request failed (${response.status})`);
    }

    return response.json() as Promise<SessionSummary[]>;
  }, []);

  const loadLatestCompletedExecution = useCallback(async () => {
    if (!session) {
      setExecution(null);
      setScannedCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const summaries = await fetchSessionSummaries();
      const recent = summaries.slice(0, MAX_SESSION_SCAN);
      setScannedCount(recent.length);

      let latestCompleted: CompletedExecution | null = null;

      for (const row of recent) {
        try {
          const history = await fetchSessionHistory(row.session_id);
          const parsed = parseCompletedExecution(row, history.messages);
          if (parsed) {
            latestCompleted = parsed;
            break;
          }
        } catch {
          // Skip unreadable session and keep scanning.
        }
      }

      setExecution(latestCompleted);
    } catch (e) {
      setExecution(null);
      setError(e instanceof Error ? e.message : 'Failed to load tracking data.');
    } finally {
      setLoading(false);
    }
  }, [fetchSessionSummaries, session]);

  useEffect(() => {
    void loadLatestCompletedExecution();
  }, [loadLatestCompletedExecution]);

  const handleAddToCalendar = useCallback(async () => {
    if (!execution || !bookingDateTime || calendarState === 'loading' || calendarState === 'done') return;
    setCalendarState('loading');
    try {
      await createCalendarEvent(execution.requestTitle, bookingDateTime);
      setCalendarState('done');
    } catch {
      setCalendarState('error');
    }
  }, [bookingDateTime, calendarState, execution]);

  const handleCallProvider = useCallback(async () => {
    const phone = execution?.provider?.phone_number;
    if (!phone) return;
    const telUrl = `tel:${phone}`;
    const supported = await Linking.canOpenURL(telUrl);
    if (supported) {
      await Linking.openURL(telUrl);
    }
  }, [execution?.provider?.phone_number]);

  return (
    <View style={st.root}>
      <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
      <ScrollView
        contentContainerStyle={[st.content, { paddingTop: insets.top + Layout.headerHeight + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={st.headerCard}>
          <View style={st.statusIcon}>
            <MaterialIcons name={execution ? 'check-circle' : 'history'} size={28} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.headlineMd, { color: colors.onSurface }]}>Latest Completed Execution</Text>
            <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              {execution?.completedAt
                ? `Completed ${formatDateTime(execution.completedAt)}`
                : loading
                ? 'Loading your recent execution history...'
                : 'Showing the newest session with finalized execution data.'}
            </Text>
          </View>
          <Pressable style={st.refreshBtn} onPress={loadLatestCompletedExecution} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="refresh" size={18} color={colors.primary} />
            )}
          </Pressable>
        </View>

        {error && (
          <View style={st.errorCard}>
            <MaterialIcons name="error-outline" size={18} color={colors.error} />
            <Text style={[Typography.bodyMd, { color: colors.error, flex: 1 }]}>{error}</Text>
          </View>
        )}

        {!loading && !execution && !error && (
          <View style={st.emptyCard}>
            <Text style={[Typography.labelLg, { color: colors.onSurface }]}>No completed execution found yet.</Text>
            <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              Scanned {scannedCount} recent session{scannedCount === 1 ? '' : 's'}. Complete a provider call flow first,
              then this page will auto-populate with real tracking details.
            </Text>
          </View>
        )}

        {execution && (
          <>
            <View style={st.card}>
              <Text style={[Typography.labelLg, st.sectionTitle]}>Execution Summary</Text>
              <View style={st.summaryHeaderRow}>
                <Text style={[Typography.bodyLg, { color: colors.onSurface, flex: 1 }]}>{friendlyRequestTitle}</Text>
                <View style={st.statusPill}>
                  <Text style={[Typography.labelMd, { color: colors.primary }]}>{normalizedStatus}</Text>
                </View>
              </View>
              {!!assistantUpdate && (
                <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>{assistantUpdate}</Text>
              )}
              <View style={st.metaRow}>
                {!!scheduledLabel && (
                  <View style={st.metaChip}>
                    <MaterialIcons name="schedule" size={14} color={colors.onSurfaceVariant} />
                    <Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>Scheduled: {scheduledLabel}</Text>
                  </View>
                )}
              </View>
            </View>

            {(execution.provider || execution.confirmedDate || execution.summary || execution.notes) && (
              <View style={st.card}>
                <Text style={[Typography.labelLg, st.sectionTitle]}>Booking Details</Text>
                {execution.provider?.name && (
                  <View style={st.infoRow}>
                    <MaterialIcons name="engineering" size={16} color={colors.primary} />
                    <Text style={[Typography.bodyMd, { color: colors.onSurface, flex: 1 }]}>{execution.provider.name}</Text>
                  </View>
                )}
                {execution.provider?.address && (
                  <View style={st.infoRow}>
                    <MaterialIcons name="location-on" size={16} color={colors.primary} />
                    <Text style={[Typography.bodyMd, { color: colors.onSurface, flex: 1 }]}>{execution.provider.address}</Text>
                  </View>
                )}
                {execution.provider?.phone_number && (
                  <View style={st.infoRow}>
                    <MaterialIcons name="phone" size={16} color={colors.primary} />
                    <Text style={[Typography.bodyMd, { color: colors.onSurface, flex: 1 }]}>{execution.provider.phone_number}</Text>
                  </View>
                )}
                {(execution.confirmedDate || execution.confirmedTime) && (
                  <View style={st.infoRow}>
                    <MaterialIcons name="schedule" size={16} color={colors.primary} />
                    <Text style={[Typography.bodyMd, { color: colors.onSurface, flex: 1 }]}>
                      {[execution.confirmedDate, execution.confirmedTime].filter(Boolean).join(' ')}
                    </Text>
                  </View>
                )}
                {!!execution.summary && (
                  <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, marginTop: Spacing.sm }]}>
                    Booking time: {execution.summary}
                  </Text>
                )}
                {!!execution.notes && (
                  <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, marginTop: Spacing.xs }]}>
                    Notes: {execution.notes}
                  </Text>
                )}
              </View>
            )}

            {execution.timeline.length > 0 && (
              <View style={st.card}>
                <Text style={[Typography.labelLg, st.sectionTitle]}>Execution Timeline</Text>
                {execution.timeline.map((item) => (
                  <View key={item.id} style={st.timelineRow}>
                    <MaterialIcons name="task-alt" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[Typography.bodyMd, { color: colors.onSurface }]}>{item.title}</Text>
                      {item.time && (
                        <Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>
                          {formatDateTime(item.time)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={st.actionsRow}>
              <Pressable style={st.actionBtn} onPress={() => onOpenSession?.(execution.sessionId)}>
                <MaterialIcons name="chat" size={16} color={colors.primary} />
                <Text style={[Typography.labelLg, { color: colors.primary }]}>Open Chat</Text>
              </Pressable>

              {!!execution.provider?.phone_number && (
                <Pressable style={st.actionBtn} onPress={handleCallProvider}>
                  <MaterialIcons name="call" size={16} color={colors.primary} />
                  <Text style={[Typography.labelLg, { color: colors.primary }]}>Call Provider</Text>
                </Pressable>
              )}

              {!!bookingDateTime && (
                <Pressable
                  style={st.actionBtn}
                  onPress={calendarState === 'idle' || calendarState === 'error' ? handleAddToCalendar : undefined}
                  disabled={calendarState === 'loading' || calendarState === 'done'}
                >
                  {calendarState === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialIcons
                      name={calendarState === 'done' ? 'check-circle' : calendarState === 'error' ? 'error-outline' : 'event'}
                      size={16}
                      color={colors.primary}
                    />
                  )}
                  <Text style={[Typography.labelLg, { color: colors.primary }]}>
                    {calendarState === 'done' ? 'Added to Calendar' : calendarState === 'error' ? 'Try Calendar Again' : 'Add to Calendar'}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    content: {
      paddingHorizontal: Spacing.marginMobile,
      paddingBottom: Spacing.xxl,
      alignItems: 'center',
      gap: Spacing.base,
    },
    headerCard: {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: Radii.lg,
      padding: Spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      ...Shadows.card,
    },
    statusIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    refreshBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerLowest,
    },
    errorCard: {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.errorContainer,
      backgroundColor: colors.errorContainer + '66',
      padding: Spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    emptyCard: {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLowest,
      padding: Spacing.xl,
      gap: Spacing.sm,
    },
    card: {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLowest,
      padding: Spacing.xl,
      gap: Spacing.sm,
      ...Shadows.cardSm,
    },
    sectionTitle: {
      color: colors.primary,
      marginBottom: Spacing.xs,
    },
    summaryHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    statusPill: {
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.primary + '66',
      backgroundColor: colors.primary + '12',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: Spacing.base,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    actionsRow: {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      gap: Spacing.sm,
    },
    actionBtn: {
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primary + '14',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
    },
  });
