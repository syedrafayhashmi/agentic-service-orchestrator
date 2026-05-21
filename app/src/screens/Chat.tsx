/**
 * Chat Screen — live backend conversation with provider search and booking responses.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ServiceHeader } from '@/components/ServiceHeader';
import { AIPromptBar } from '@/components/AIPromptBar';
import { Typography, Spacing, Radii, Shadows, Layout } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { ChatApiResponse, Provider, createRetellOutboundCall, fetchSessionHistory, SessionHistoryItem } from '@/lib/chatApi';
import { useAgentStore } from '@/store/useAgentStore';
import { useAuthStore } from '@/store/useAuthStore';

interface ChatScreenProps {
  onBack?: () => void;
  onMenuPress?: () => void;
  isSidebarOpen?: boolean;
  initialMessage?: string;
  sessionId?: string;
  userLocation?: string;
  onNavigateToExecution?: () => void;
}

type ChatRole = 'user' | 'assistant';

type CardData =
  | { type: 'provider'; data: Provider }
  | { type: 'booking'; data: { label: string; time: string; dateTime?: string } }
  | { type: 'scan'; data: Record<string, string> }
  | { type: 'clarifying'; data: { questions: string[] } };

interface ChatMsg {
  id: string;
  type: ChatRole;
  text: string;
  cards?: CardData[];
  isStreaming?: boolean;
}

const SUGGESTIONS = ['Book a plumber nearby', 'Find AC repair in Lahore', 'Call provider to confirm booking'];

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const parseHistoryCards = (cards: SessionHistoryItem['cards']): CardData[] => {
  if (!Array.isArray(cards)) {
    return [];
  }

  const parsed: CardData[] = [];

  cards.forEach((card) => {
    const record = asRecord(card);
    if (!record) return;

    const type = typeof record.type === 'string' ? record.type : '';
    const data = asRecord(record.data);
    if (!data) return;

    if (type === 'provider' && typeof data.name === 'string' && data.name.trim()) {
      parsed.push({
        type: 'provider',
        data: {
          name: data.name,
          address: typeof data.address === 'string' ? data.address : undefined,
          phone_number: typeof data.phone_number === 'string' ? data.phone_number : undefined,
          rating: typeof data.rating === 'number' ? data.rating : undefined,
          reviews_summary: typeof data.reviews_summary === 'string' ? data.reviews_summary : undefined,
        },
      });
      return;
    }

    if (type === 'booking') {
      parsed.push({
        type: 'booking',
        data: {
          label: typeof data.label === 'string' && data.label.trim() ? data.label : 'Booking update',
          time: typeof data.time === 'string' && data.time.trim() ? data.time : 'Confirmed',
        },
      });
      return;
    }

    if (type === 'booking_status') {
      const status = typeof data.status === 'string' ? data.status : 'Booking update';
      const date = typeof data.confirmed_date === 'string' ? data.confirmed_date : '';
      const time = typeof data.confirmed_time === 'string' ? data.confirmed_time : '';
      const details = [date, time].filter(Boolean).join(' ');

      parsed.push({
        type: 'booking',
        data: {
          label: status,
          time: details || 'Provider status received',
        },
      });
      return;
    }

    if (type === 'clarifying') {
      const questions = Array.isArray(data.questions)
        ? data.questions.filter((question): question is string => typeof question === 'string' && question.trim().length > 0)
        : [];
      if (questions.length) {
        parsed.push({ type: 'clarifying', data: { questions } });
      }
    }
  });

  return parsed;
};

function ScanCard({ d, colors, styles }: { d: Record<string, string>; colors: any; styles: any }) {
  const pct = parseInt(d.progress || '0', 10);
  return (
    <View style={styles.scanCard}>
      <View style={styles.scanHdr}><View style={styles.scanTitleRow}><MaterialIcons name="radar" size={16} color={colors.secondary} /><Text style={[Typography.labelMd, styles.scanTitle]}>{d.title}</Text></View><View style={styles.scanDot} /></View>
      <Text style={[Typography.bodyMd, { color: colors.onSurface }]}>{d.status}</Text>
      <View style={styles.pTrack}><View style={[styles.pFill, { width: `${pct}%` }]} /></View>
      <View style={styles.scanTags}><View style={styles.scanTag}><Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>{d.tag1}</Text></View><View style={styles.scanTag}><Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>{d.tag2}</Text></View></View>
    </View>
  );
}

function ProviderCard({ d, onCallPress, isCalling, colors, styles }: { d: Provider; onCallPress?: () => void; isCalling?: boolean; colors: any; styles: any }) {
  return (
    <View style={styles.provCard}>
      <View style={styles.provAvatar}><MaterialIcons name="handyman" size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.labelLg, { color: colors.onSurface }]}>{d.name}</Text>
        <Text style={[Typography.labelMd, { color: colors.outline }]}>{d.address || 'Nearby provider'}</Text>
        {!!d.phone_number && <Text style={[Typography.labelMd, { color: colors.outline }]}>{d.phone_number}</Text>}
        {!!d.rating && <Text style={[Typography.labelMd, { color: colors.outline }]}>{d.rating.toFixed(1)} rating</Text>}
        {!!d.reviews_summary && <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>{d.reviews_summary}</Text>}
        {d.phone_number && (
          <Pressable onPress={onCallPress} disabled={isCalling} style={[styles.callBtn, isCalling && styles.callBtnDisabled]}>
            <MaterialIcons name="call" size={16} color={colors.onPrimary} />
            <Text style={[Typography.labelMd, { color: colors.onPrimary }]}>{isCalling ? 'Calling...' : 'Call to confirm'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function BookingCard({ d, colors, styles }: { d: { label: string; time: string; dateTime?: string }; colors: any; styles: any }) {
  return (
    <View style={styles.bookCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <MaterialIcons name="event-available" size={18} color={colors.onPrimary} />
        <Text style={[Typography.labelLg, { color: colors.onPrimary }]}>{d.label}</Text>
      </View>
      <Text style={[Typography.bodyMd, { color: colors.onPrimary }]}>{d.time}</Text>
    </View>
  );
}
const LOADING_STATES = ['Thinking...', 'Gathering answers...', 'Searching providers...', 'Organizing information...'];

function LoadingBubble() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % LOADING_STATES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.aiRow}>
      <View style={styles.aiHdr}>
        <View style={styles.aiAv}>
          <MaterialIcons name="smart-toy" size={14} color={colors.onPrimary} />
        </View>
        <Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>Service AI</Text>
      </View>
      <View style={[styles.aiBubble, { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[Typography.bodyLg, { color: colors.onSurface, flexShrink: 1 }]}>{LOADING_STATES[step]}</Text>
      </View>
    </View>
  );
}
export function ChatScreen({ onBack, onMenuPress, isSidebarOpen, initialMessage, sessionId: propSessionId, userLocation, onNavigateToExecution }: ChatScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuthStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [callingProvider, setCallingProvider] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMsg>>(null);
  const didSendInitial = useRef(false);
  const lastStreamIndex = useRef(0);
  const hasNavigatedRef = useRef(false);
  const hasFinalizedRef = useRef(false);
  // Use provided sessionId (history) or generate a new one
  const sessionId = useMemo(
    () => propSessionId ?? `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    [propSessionId]
  );
  const { startStream, events, finalResult, isStreaming, clearStream } = useAgentStore();

  useEffect(() => {
    setMessages([]);
    setStreamingText('');
    lastStreamIndex.current = 0;
    hasFinalizedRef.current = false;
  }, [sessionId]);

  const searchStatus = useMemo(() => {
    if (!isStreaming) return null;
    let status: string | null = null;

    for (const event of events) {
      if (event.type === 'tool_start' && event.tool === 'run_google_agent') {
        status = status ?? 'Searching nearby providers...';
      }
      if (event.type === 'tool_end' && event.tool === 'run_google_agent') {
        status = null;
      }
      if (event.type === 'sub_step') {
        if (event.step === 'search_start') {
          status = event.query ? `Searching: ${event.query}...` : 'Searching nearby providers...';
        }
        if (event.step === 'reviews_start') {
          status = 'Reading reviews...';
        }
        if (event.step === 'search_done' || event.step === 'search_error' || event.step === 'reviews_done' || event.step === 'reviews_error') {
          status = null;
        }
      }
    }

    return status;
  }, [events, isStreaming]);

  const suggestionChips = useMemo(() => {
    if (isHistoryLoading) return [];

    const lastAssistantMessage = [...messages].reverse().find((message) => message.type === 'assistant')?.text ?? '';
    const lastUserMessage = [...messages].reverse().find((message) => message.type === 'user')?.text ?? '';
    const contextText = `${lastAssistantMessage} ${lastUserMessage} ${userLocation ?? ''}`.toLowerCase();

    const suggestionSets = [
      {
        match: /(plumb|pipe|leak|tap|bathroom)/,
        items: ['Find a plumber nearby', 'Compare plumbing providers', 'Call a plumber to confirm'],
      },
      {
        match: /(ac|hvac|cool|air conditioner|repair)/,
        items: ['Book AC repair', 'Find HVAC providers nearby', 'Call provider to confirm'],
      },
      {
        match: /(clean|cleaning|housekeeping)/,
        items: ['Book a cleaner nearby', 'Find housekeeping services', 'Compare cleaning options'],
      },
      {
        match: /(electric|wire|power|switch|socket)/,
        items: ['Find an electrician nearby', 'Compare electrical services', 'Call provider to confirm'],
      },
      {
        match: /(move|shif|relocat|mover)/,
        items: ['Book movers nearby', 'Find relocation help', 'Compare moving services'],
      },
    ] as const;

    for (const set of suggestionSets) {
      if (set.match.test(contextText)) {
        return set.items;
      }
    }

    if (userLocation) {
      return [
        `Find nearby services in ${userLocation}`,
        'Show top rated providers',
        'Help me book a service',
      ];
    }

    return [
      'Find a service nearby',
      'Book a provider',
      'Help me compare options',
    ];
  }, [isHistoryLoading, messages, userLocation]);

  useEffect(() => {
    if (!isStreaming) {
      lastStreamIndex.current = 0;
      setStreamingText('');
      return;
    }

    if (events.length <= lastStreamIndex.current) {
      return;
    }

    let nextText = '';
    for (let i = lastStreamIndex.current; i < events.length; i += 1) {
      const event = events[i];
      if (event.type === 'token' && event.content) {
        nextText += event.content;
      }
    }

    if (nextText) {
      setStreamingText((prev) => prev + nextText);
    }

    lastStreamIndex.current = events.length;
  }, [events, isStreaming]);

  const hydrateHistory = useCallback((items: SessionHistoryItem[]) => {
    const hydrated = items.map((item) => {
      const cards = parseHistoryCards(item.cards);
      return {
        id: item.id,
        type: item.role === 'user' ? 'user' as const : 'assistant' as const,
        text: item.text,
        cards: cards.length ? cards : undefined,
      };
    });

    setMessages(hydrated);
  }, []);

  const appendAssistantCards = useCallback((response: ChatApiResponse) => {
    const cards: CardData[] = [];
    if (response.recommended_providers?.length) {
      response.recommended_providers.forEach((provider) => {
        cards.push({ type: 'provider', data: provider });
      });
    }
    if (response.booking_confirmation) {
      const raw = response.booking_confirmation as Record<string, unknown>;
      const confirmedDate = raw.confirmed_date as string | undefined;
      const confirmedTime = raw.confirmed_time as string | undefined;
      const dateTime = confirmedDate && confirmedTime ? `${confirmedDate}T${confirmedTime}:00` : undefined;
      cards.push({
        type: 'booking',
        data: {
          label: String(raw.label ?? 'Booking update'),
          time: String(raw.time ?? response.message ?? 'Confirmed'),
          dateTime,
        },
      });
    }
    if (response.clarifying_questions?.length) {
      cards.push({
        type: 'clarifying',
        data: { questions: response.clarifying_questions.map((question) => question.question) },
      });
    }
    return cards;
  }, []);

  const extractedDetails = useMemo(() => {
    const details = finalResult?.parameters?.extracted_details;
    return details && typeof details === 'object' ? (details as Record<string, unknown>) : {};
  }, [finalResult]);

  const asText = useCallback((value: unknown): string | undefined => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return undefined;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const userMessage: ChatMsg = { id: makeId(), type: 'user', text };
    setMessages((current) => [...current, userMessage]);
    hasNavigatedRef.current = false;
    
    // We use the streaming store
    await startStream(text, sessionId, userLocation);
    
  }, [sessionId, startStream, userLocation, onNavigateToExecution]);

  // Effect to handle stream completion if we didn't navigate away
  useEffect(() => {
    if (!searchStatus) return;
    if (!onNavigateToExecution || hasNavigatedRef.current) return;
    onNavigateToExecution();
    hasNavigatedRef.current = true;
  }, [onNavigateToExecution, searchStatus]);

  useEffect(() => {
    if (finalResult && !hasFinalizedRef.current) {
      const finalText = finalResult.message || 'Response received.';
      const assistantMessage: ChatMsg = {
        id: makeId(),
        type: 'assistant',
        text: finalText,
        cards: appendAssistantCards(finalResult),
      };
      setMessages((current) => {
        const last = current[current.length - 1];
        if (last?.type === 'assistant' && last.text === finalText) {
          return current;
        }
        return [...current, assistantMessage];
      });
      setStreamingText('');
      hasFinalizedRef.current = true;
      return;
    }

    if (!finalResult) {
      hasFinalizedRef.current = false;
    }
  }, [finalResult, appendAssistantCards]);

  useEffect(() => {
    if (finalResult && !isStreaming) {
      clearStream();
      setStreamingText('');
    }
  }, [finalResult, isStreaming, clearStream]);

  const callProvider = useCallback(async (provider: Provider) => {
    if (!provider.phone_number) {
      return;
    }

    setCallingProvider(provider.name);
    try {
      const response = await createRetellOutboundCall({
        session_id: sessionId,
        to_number: provider.phone_number,
        user_id: session?.user?.id,
        provider_name: provider.name,
        booking_message: `Please call ${provider.name} to confirm the booking for this service request.`,
        customer_name: asText(session?.user?.user_metadata?.full_name),
        service_type: asText(extractedDetails.service_type) ?? asText(extractedDetails.service),
        location:
          asText(profile?.address) ??
          asText(extractedDetails.location) ??
          asText(extractedDetails.area) ??
          asText(extractedDetails.destination) ??
          userLocation,
        preferred_date: asText(extractedDetails.preferred_date) ?? asText(extractedDetails.date),
        preferred_time: asText(extractedDetails.preferred_time) ?? asText(extractedDetails.time),
        alternative_times:
          asText(extractedDetails.alternative_times) ??
          asText(extractedDetails.alternative_time) ??
          asText(extractedDetails.alternatives),
        booking_id: sessionId,
      });

      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          type: 'assistant',
          text: [
            `${response.message} ${response.call_id ? `Call ID: ${response.call_id}.` : ''}`.trim(),
            response.dynamic_variables_preview
              ? `Retell payload:\n${JSON.stringify(response.dynamic_variables_preview, null, 2)}`
              : null,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          type: 'assistant',
          text: error instanceof Error ? error.message : 'Unable to start the Retell call right now.',
        },
      ]);
    } finally {
      setCallingProvider(null);
    }
  }, [asText, extractedDetails, profile?.address, session?.user?.id, session?.user?.user_metadata?.full_name, sessionId, userLocation]);

  useEffect(() => {
    void (async () => {
      if (!session) {
        setMessages([]);
        setIsHistoryLoading(false);
        return;
      }
      setIsHistoryLoading(true);
      try {
        const history = await fetchSessionHistory(sessionId);
        if (history.messages.length > 0) {
          hydrateHistory(history.messages);
        }
      } catch {
        // History is optional on first load.
      } finally {
        setIsHistoryLoading(false);
      }
    })();
  }, [hydrateHistory, session, sessionId]);

  useEffect(() => {
    if (initialMessage && !didSendInitial.current) {
      didSendInitial.current = true;
      void sendMessage(initialMessage);
    }
  }, [initialMessage, sendMessage]);

  const renderItem = ({ item }: { item: ChatMsg }) => {
    if (item.type === 'user') return (
      <View style={styles.userRow}><View style={styles.userBubble}><Text style={[Typography.bodyLg, { color: colors.onSurface }]}>{item.text}</Text></View></View>
    );
    return (
      <View style={styles.aiRow}>
        <View style={styles.aiHdr}><View style={styles.aiAv}><MaterialIcons name="smart-toy" size={14} color={colors.onPrimary} /></View><Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>Service AI</Text></View>
        <View style={styles.aiBubble}>
          {item.isStreaming ? (
            <View style={styles.streamingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>{item.text}</Text>
            </View>
          ) : (
            <Text style={[Typography.bodyLg, { color: colors.onSurface }]}>{item.text}</Text>
          )}
        </View>
        {item.cards?.map((c, i) => (
          <View key={i} style={styles.cardSlot}>
            {c.type === 'scan' && <ScanCard d={c.data} colors={colors} styles={styles} />}
            {c.type === 'provider' && (
              <ProviderCard
                d={c.data}
                onCallPress={() => callProvider(c.data)}
                isCalling={callingProvider === c.data.name}
                colors={colors}
                styles={styles}
              />
            )}
            {c.type === 'booking' && <BookingCard d={c.data} colors={colors} styles={styles} />}
            {c.type === 'clarifying' && (
              <View style={styles.clarifyCard}>
                {c.data.questions.map((question) => (
                  <Text key={question} style={[Typography.bodyMd, { color: colors.onSurface }]}>{question}</Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const showLoader = isHistoryLoading && messages.length === 0;

  const showStreamingBubble = isStreaming && !hasFinalizedRef.current;

  const displayMessages = useMemo(() => {
    if (!showStreamingBubble) {
      return messages;
    }

    const trimmed = streamingText.trim();
    const looksLikeJson =
      trimmed.startsWith('{') ||
      trimmed.startsWith('[') ||
      trimmed.includes('"intent_resolved"') ||
      trimmed.includes('"clarifying_questions"');

    const looksLikeGreeting =
      trimmed.length < 80 &&
      /^(hello|hi|hey)\b/i.test(trimmed) &&
      /help you today|assist you today/i.test(trimmed);

    const bubbleText = !trimmed || looksLikeJson || looksLikeGreeting ? 'Generating response...' : streamingText;

    return [...messages, { id: 'streaming', type: 'assistant' as const, text: bubbleText, isStreaming: true }];
  }, [messages, showStreamingBubble, streamingText]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (showLoader) return;
    scrollToBottom(isStreaming);
  }, [displayMessages, isStreaming, scrollToBottom, showLoader]);

  return (
    <View style={styles.root}>
      <ServiceHeader onMenu={onBack} onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
      {showLoader && (
        <View style={[
          styles.loadingShell,
          {
            marginTop: insets.top + Layout.headerHeight + Spacing.lg,
            backgroundColor: colors.surfaceContainerLow,
            borderColor: colors.outlineVariant,
          },
        ]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      <FlatList
        ref={listRef}
        data={displayMessages}
        renderItem={renderItem}
        keyExtractor={m => m.id}
        onContentSizeChange={() => scrollToBottom(isStreaming)}
        contentContainerStyle={{ paddingTop: insets.top + Layout.headerHeight + Spacing.base, paddingBottom: 88 + insets.bottom, paddingHorizontal: Spacing.marginMobile }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!showLoader ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.headlineMd, { color: colors.onSurface }]}>Ask for anything local.</Text>
            <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>Try one of the suggestions below or type your own request.</Text>
          </View>
        ) : null}
        ListFooterComponent={
          <>
            {isSending && <LoadingBubble />}
            {!showLoader && suggestionChips.length > 0 && (
              <View style={styles.sugRow}>{suggestionChips.map((t) => <Pressable key={t} style={styles.sugChip} onPress={() => sendMessage(t)}><Text style={[Typography.labelMd, { color: colors.primary }]}>{t}</Text></Pressable>)}</View>
            )}
          </>
        }
      />
      <View style={styles.floatIn}>
        <AIPromptBar placeholder="Ask me anything..." showExtras disabled={isStreaming} onSubmit={sendMessage} />
        {searchStatus && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[Typography.labelMd, { color: colors.onSurfaceVariant }]}>{searchStatus}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  chatContainer: { flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', position: 'relative' },
  userRow: { alignItems: 'flex-end', marginBottom: Platform.OS === 'web' ? 0 : Spacing.xl },
  userBubble: { backgroundColor: colors.surfaceContainerHigh, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderRadius: Radii.lg, borderTopRightRadius: Radii.sm, maxWidth: '85%' },
  aiRow: { alignItems: 'flex-start', marginBottom: Platform.OS === 'web' ? 2 : Spacing.xl, gap: Spacing.sm },
  aiHdr: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  aiAv: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  aiBubble: { backgroundColor: colors.surfaceContainerLowest, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderRadius: Radii.lg, borderTopLeftRadius: Radii.sm, maxWidth: '85%', borderWidth: 1, borderColor: colors.outlineVariant, ...Shadows.cardSm },
  streamingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardSlot: { width: '85%', maxWidth: 320 },
  scanCard: { backgroundColor: colors.surfaceContainerLow, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: Radii.md, padding: Spacing.base, gap: Spacing.sm },
  scanHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  scanTitle: { color: colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 },
  scanDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
  pTrack: { height: 4, backgroundColor: colors.surfaceVariant, borderRadius: 2, overflow: 'hidden' },
  pFill: { height: '100%', backgroundColor: colors.secondary, borderRadius: 2 },
  scanTags: { flexDirection: 'row', gap: Spacing.sm },
  scanTag: { backgroundColor: colors.surfaceVariant, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radii.sm },
  provCard: { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: Radii.md, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  provAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainerHigh },
  callBtn: { marginTop: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: colors.primary, borderRadius: Radii.full, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, alignSelf: 'flex-start' },
  callBtnDisabled: { opacity: 0.6 },
  bookCard: { backgroundColor: colors.primary, borderRadius: Radii.md, padding: Spacing.md, gap: Spacing.xs },
  clarifyCard: { backgroundColor: colors.surfaceContainerLow, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: Radii.md, padding: Spacing.md, gap: Spacing.sm },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
  sugRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', marginTop: Spacing.xxl },
  sugChip: { backgroundColor: colors.chipBlueBg, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radii.full },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  floatIn: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.marginMobile, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, backgroundColor: colors.surface + 'F0', alignItems: 'center' },
  loadingShell: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
});
