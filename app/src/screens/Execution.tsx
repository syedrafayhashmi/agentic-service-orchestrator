/**
 * Execution Log Screen — execution_log_gemini_variant
 * Granular timeline of automated task steps + provider card reveal.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { ServiceHeader } from '@/components/ServiceHeader';
import {
  Typography,
  Spacing,
  Radii,
  Shadows,
  Layout,
} from '@/constants/theme';
import { useAgentStore, StreamEvent } from '@/store/useAgentStore';
import { SessionHistoryItem, createRetellOutboundCall, fetchSessionHistory } from '@/lib/chatApi';
import { createCalendarEvent } from '@/lib/calendarApi';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/contexts/ThemeContext';

const BOOK_NOW_CALL_NUMBER = '+4917677834094';
const RETELL_POLL_INTERVAL_MS = 4000;
const RETELL_POLL_TIMEOUT_MS = 180000;

type BookingOutcome = {
  status?: string;
  confirmedDate?: string;
  confirmedTime?: string;
  summary?: string;
  notes?: string;
};

type RetellProgress = {
  callId?: string;
  stage: 'idle' | 'queued' | 'in_progress' | 'ended' | 'analyzed';
  done: boolean;
  message?: string;
  booking?: BookingOutcome;
  hasStarted: boolean;
  hasTranscript: boolean;
  hasEnded: boolean;
  hasAnalyzed: boolean;
};

const INITIAL_RETELL_PROGRESS: RetellProgress = {
  stage: 'idle',
  done: false,
  hasStarted: false,
  hasTranscript: false,
  hasEnded: false,
  hasAnalyzed: false,
};

function toText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseRetellProgress(items: SessionHistoryItem[], requestedCallId?: string | null): RetellProgress {
  let callId = requestedCallId ?? undefined;

  if (!callId) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item.kind !== 'retell-event') continue;
      for (const card of item.cards ?? []) {
        const type = (card as Record<string, unknown>)?.type;
        if (type !== 'retell_event') continue;
        const data = (card as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        const discovered = toText(data?.call_id);
        if (discovered) {
          callId = discovered;
          break;
        }
      }
      if (callId) break;
    }
  }

  let hasStarted = false;
  let hasTranscript = false;
  let hasEnded = false;
  let hasAnalyzed = false;
  let booking: BookingOutcome | undefined;

  for (const item of items) {
    if (item.kind !== 'retell-event') continue;

    let eventType: string | undefined;
    let eventCallId: string | undefined;

    for (const card of item.cards ?? []) {
      const type = (card as Record<string, unknown>)?.type;
      const data = (card as Record<string, unknown>)?.data as Record<string, unknown> | undefined;

      if (type === 'retell_event') {
        eventType = toText(data?.event_type);
        eventCallId = toText(data?.call_id);
      }

      if (type === 'booking_status') {
        booking = {
          status: toText(data?.status),
          confirmedDate: toText(data?.confirmed_date),
          confirmedTime: toText(data?.confirmed_time),
          summary: toText(data?.short_call_summary),
          notes: toText(data?.provider_notes),
        };
      }
    }

    if (callId && eventCallId && eventCallId !== callId) continue;

    if (eventType === 'call_started') hasStarted = true;
    if (eventType === 'transcript_updated') hasTranscript = true;
    if (eventType === 'call_ended') hasEnded = true;
    if (eventType === 'call_analyzed') hasAnalyzed = true;
  }

  let stage: RetellProgress['stage'] = 'idle';
  if (hasAnalyzed) stage = 'analyzed';
  else if (hasEnded) stage = 'ended';
  else if (hasStarted || hasTranscript) stage = 'in_progress';
  else if (callId) stage = 'queued';

  let message: string | undefined;
  if (hasAnalyzed) {
    const statusText = booking?.status ? `Booking status: ${booking.status}` : 'Call analyzed';
    const when = [booking?.confirmedDate, booking?.confirmedTime].filter(Boolean).join(' ');
    const detail = when || booking?.summary || booking?.notes || 'Call summary captured.';
    message = `${statusText}. ${detail}`;
  } else if (hasEnded) {
    message = 'Call ended. Waiting for final analysis...';
  } else if (hasTranscript) {
    message = 'Call in progress. Capturing transcript updates...';
  } else if (hasStarted) {
    message = 'Call connected. Listening for updates...';
  } else if (callId) {
    message = 'Call initiated. Waiting for provider response...';
  }

  return {
    callId,
    stage,
    done: stage === 'analyzed',
    message,
    booking,
    hasStarted,
    hasTranscript,
    hasEnded,
    hasAnalyzed,
  };
}

function buildRetellSteps(progress: RetellProgress, colors: any): Step[] {
  if (progress.stage === 'idle') return [];

  const steps: Step[] = [];

  steps.push({
    id: 'retell-start',
    icon: 'call',
    title: 'Outbound call initiated',
    subtitle: progress.callId ? `Call ID: ${progress.callId}` : undefined,
    status: progress.hasStarted || progress.hasTranscript || progress.hasEnded || progress.hasAnalyzed ? 'done' : 'active',
    accent: colors.primary,
  });

  steps.push({
    id: 'retell-live',
    icon: 'record-voice-over',
    title: progress.hasTranscript ? 'Conversation in progress' : 'Waiting for live conversation',
    status: progress.hasEnded || progress.hasAnalyzed ? 'done' : progress.hasStarted || progress.hasTranscript ? 'active' : 'pending',
    accent: colors.auroraBlue,
  });

  steps.push({
    id: 'retell-end',
    icon: 'call-end',
    title: 'Call ended',
    status: progress.hasEnded || progress.hasAnalyzed ? 'done' : 'pending',
    accent: colors.auroraPurple,
  });

  steps.push({
    id: 'retell-analysis',
    icon: 'summarize',
    title: 'Analyzing call summary',
    status: progress.hasAnalyzed ? 'done' : progress.hasEnded ? 'active' : 'pending',
    accent: colors.secondary,
  });

  if (progress.hasAnalyzed && progress.booking?.status) {
    const when = [progress.booking.confirmedDate, progress.booking.confirmedTime].filter(Boolean).join(' ');
    steps.push({
      id: 'retell-booking',
      icon: progress.booking.status === 'CONFIRMED' ? 'event-available' : 'event-busy',
      title: `Booking ${progress.booking.status}`,
      subtitle: when || progress.booking.summary || progress.booking.notes,
      status: 'done',
      accent: progress.booking.status === 'CONFIRMED' ? '#2E7D32' : '#E57373',
    });
  }

  return steps;
}

// ─── Pulsing dot ─────────────────────────────────────────────────────────────
function PulsingDot() {
  const { colors } = useTheme();
  const st = React.useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.8, { duration: 1200 }), -1, true);
    opacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);
  }, []);

  const pingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={st.pulseWrap}>
      <Animated.View style={[st.ping, pingStyle]} />
      <View style={st.activeDotOuter}>
        <View style={st.activeDotInner} />
      </View>
    </View>
  );
}

// ─── Step model ───────────────────────────────────────────────────────────────
interface Step {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
  status: 'done' | 'active' | 'pending';
  accent?: string;
}

// ─── Provider card ────────────────────────────────────────────────────────────
function ProviderCard({
  provider,
  onBookNowPress,
  isCalling,
  bookingStatus,
  confirmedDate,
  confirmedTime,
  onAddToCalendar,
  calState,
}: {
  provider: any;
  onBookNowPress?: () => void;
  isCalling?: boolean;
  bookingStatus?: string | null;
  confirmedDate?: string | null;
  confirmedTime?: string | null;
  onAddToCalendar?: () => void;
  calState?: 'idle' | 'loading' | 'done' | 'error';
}) {
  const { colors } = useTheme();
  const st = React.useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 120 });
    opacity.value = withTiming(1, { duration: 400 });
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const rating = provider?.rating ?? 0;
  const stars = Math.round(rating);
  const isBooked = bookingStatus === 'CONFIRMED';
  const confirmedWhen = [confirmedDate, confirmedTime].filter(Boolean).join(' ');

  return (
    <Animated.View style={[st.providerCard, style]}>
      {/* Header row */}
      <View style={st.providerHeader}>
        <View style={st.providerIconBadge}>
          <MaterialIcons name="verified" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.labelLg, { color: colors.textPrimary }]} numberOfLines={1}>
            {provider?.name ?? 'Unknown Provider'}
          </Text>
          <View style={st.starsRow}>
            {Array.from({ length: 5 }).map((_, i) => (
              <MaterialIcons
                key={i}
                name={i < stars ? 'star' : 'star-border'}
                size={13}
                color={i < stars ? '#F5A623' : colors.onSurfaceVariant}
              />
            ))}
            <Text style={[Typography.labelMd, { color: colors.onSurfaceVariant, marginLeft: 4 }]}>
              {rating.toFixed(1)}
            </Text>
          </View>
        </View>
        <View style={[st.selectedBadge, isBooked && st.bookedBadge]}>
          <Text style={[Typography.labelMd, { color: isBooked ? '#1B5E20' : colors.primary, fontSize: 10 }]}>
            {isBooked ? 'BOOKED' : 'TOP PICK'}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View style={st.providerDetails}>
        {provider?.address && (
          <View style={st.detailRow}>
            <MaterialIcons name="location-on" size={14} color={colors.onSurfaceVariant} />
            <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, flex: 1 }]} numberOfLines={2}>
              {provider.address}
            </Text>
          </View>
        )}
        {provider?.phone_number && (
          <View style={st.detailRow}>
            <MaterialIcons name="phone" size={14} color={colors.onSurfaceVariant} />
            <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              {provider.phone_number}
            </Text>
          </View>
        )}
        {provider?.reviews_summary && (
          <View style={st.reviewBox}>
            <MaterialIcons name="format-quote" size={14} color={colors.auroraPurple} />
            <Text style={[Typography.bodyMd, { color: colors.textPrimary, flex: 1, fontSize: 12, fontStyle: 'italic' }]}>
              {provider.reviews_summary}
            </Text>
          </View>
        )}
        {isBooked && (
          <View style={st.detailRow}>
            <MaterialIcons name="check-circle" size={14} color="#2E7D32" />
            <Text style={[Typography.bodyMd, { color: '#2E7D32' }]}>
              Confirmed booking{confirmedWhen ? `: ${confirmedWhen}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* CTA */}
      <Pressable onPress={onBookNowPress} disabled={isCalling || isBooked} style={[st.bookBtn, (isCalling || isBooked) && st.bookBtnDisabled, isBooked && st.bookedBtn]}>
        <MaterialIcons name={isBooked ? 'check' : 'calendar-today'} size={16} color="#fff" />
        <Text style={[Typography.labelLg, { color: '#fff' }]}>
          {isBooked ? 'Booked' : isCalling ? 'Calling...' : 'Book Now'}
        </Text>
      </Pressable>
      {onAddToCalendar && (
        <Pressable
          onPress={calState === 'error' ? onAddToCalendar : calState === 'idle' ? onAddToCalendar : undefined}
          disabled={calState === 'loading' || calState === 'done'}
          style={[st.calBtn, (calState === 'loading' || calState === 'done') && st.calBtnDisabled]}
        >
          {calState === 'loading' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons
              name={calState === 'done' ? 'check-circle' : calState === 'error' ? 'error-outline' : 'event'}
              size={16}
              color={colors.primary}
            />
          )}
          <Text style={[Typography.labelLg, { color: colors.primary }]}>
            {calState === 'done' ? 'Added to Calendar' : calState === 'error' ? 'Try Again' : 'Add to Calendar'}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Step row ─────────────────────────────────────────────────────────────────
function StepRow({
  step,
  isLast,
  index,
}: {
  step: Step;
  isLast: boolean;
  index: number;
}) {
  const { colors } = useTheme();
  const st = React.useMemo(() => createStyles(colors), [colors]);
  const accent = step.accent ?? colors.primary;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={st.stepRow}
    >
      {/* Left — dot + line */}
      <View style={st.dotCol}>
        {step.status === 'active' ? (
          <PulsingDot />
        ) : (
          <View
            style={[
              st.dot,
              step.status === 'done'
                ? { borderColor: accent, backgroundColor: accent + '22' }
                : { borderColor: colors.surfaceBorder + '55' },
            ]}
          >
            {step.status === 'done' && (
              <MaterialIcons name="check" size={10} color={accent} />
            )}
          </View>
        )}
        {!isLast && <View style={st.line} />}
      </View>

      {/* Right — content */}
      <View
        style={[
          st.stepContent,
          step.status === 'active' && {
            backgroundColor: colors.surface,
            borderRadius: Radii.md,
            padding: Spacing.base,
            marginTop: -Spacing.xs,
            borderWidth: 1,
            borderColor: accent + '33',
            ...Shadows.cardSm,
          },
          step.status === 'pending' && { opacity: 0.45 },
        ]}
      >
        <View style={st.stepHeader}>
          <View style={st.stepIconTitle}>
            <View style={[st.iconBubble, { backgroundColor: accent + '18' }]}>
              <MaterialIcons name={step.icon} size={14} color={accent} />
            </View>
            <Text style={[Typography.labelLg, { color: colors.textPrimary }]}>
              {step.title}
            </Text>
            {step.status === 'active' && (
              <ActivityIndicator size="small" color={accent} style={{ marginLeft: 4 }} />
            )}
          </View>
          {step.status === 'done' && (
            <MaterialIcons name="check-circle" size={16} color={accent} />
          )}
        </View>
        {step.subtitle ? (
          <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
            {step.subtitle}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build the ordered step list from the raw SSE event stream */
function buildSteps(events: StreamEvent[], finalResult: any, isStreaming: boolean, colors: any): Step[] {
  const steps: Step[] = [];

  if (events.length === 0 && !finalResult) return steps;

  // 1. Init
  steps.push({
    id: 'init',
    icon: 'smart-toy',
    title: 'Initialize Agent',
    subtitle: 'Processing your request…',
    status: 'done',
  });

  // Analyse events
  let searchCount: number | null = null;
  let reviewsChecked = 0;
  let reviewingName: string | null = null;

  // Names indexed by place_id so reviews_start can resolve a name
  const placeNames: Record<string, string> = {};

  for (const ev of events) {
    if (ev.type === 'sub_step') {
      switch (ev.step) {
        case 'search_start': {
          // Mark any existing search_start as done if a new one appears (shouldn't happen but safe)
          const existing = steps.find(s => s.id === 'search');
          if (!existing) {
            steps.push({
              id: 'search',
              icon: 'manage-search',
              title: `Searching Google Maps…`,
              subtitle: ev.query ? `"${ev.query}"` : undefined,
              status: 'active',
              accent: colors.auroraBlue,
            });
          }
          break;
        }
        case 'search_done': {
          const s = steps.find(s => s.id === 'search');
          if (s) {
            searchCount = ev.count ?? 0;
            s.status = 'done';
            s.title = `Found ${searchCount} provider${searchCount !== 1 ? 's' : ''} nearby`;
            s.subtitle = undefined;
          }
          // Index place names
          (ev.places ?? []).forEach((p: any) => {
            if (p.place_id && p.name) placeNames[p.place_id] = p.name;
          });
          break;
        }
        case 'search_error': {
          const s = steps.find(s => s.id === 'search');
          if (s) { s.status = 'done'; s.title = 'Search failed'; s.accent = '#E57373'; }
          break;
        }
        case 'reviews_start': {
          reviewingName = ev.place_id ? (placeNames[ev.place_id] ?? ev.place_id) : null;
          const stepId = `review-${ev.place_id}`;
          if (!steps.find(s => s.id === stepId)) {
            steps.push({
              id: stepId,
              icon: 'rate-review',
              title: `Checking reviews${reviewingName ? ` for ${reviewingName}` : ''}…`,
              status: 'active',
              accent: colors.auroraPurple,
            });
          }
          break;
        }
        case 'reviews_done': {
          reviewsChecked++;
          const stepId = `review-${ev.place_id}`;
          const s = steps.find(s => s.id === stepId);
          const name = ev.place_id ? (placeNames[ev.place_id] ?? ev.place_id) : '';
          if (s) {
            s.status = 'done';
            s.title = name ? `Reviewed ${name}` : 'Reviews checked';
            s.subtitle = `${ev.review_count ?? 0} review${(ev.review_count ?? 0) !== 1 ? 's' : ''} analysed`;
          }
          break;
        }
        case 'reviews_error': {
          const stepId = `review-${ev.place_id}`;
          const s = steps.find(s => s.id === stepId);
          if (s) { s.status = 'done'; s.title = 'Reviews unavailable'; s.accent = '#E57373'; }
          break;
        }
      }
    }

    if (ev.type === 'tool_start' && ev.tool === 'run_google_agent') {
      // If there's no search step yet, add a generic "searching" placeholder
      if (!steps.find(s => s.id === 'search')) {
        steps.push({
          id: 'search',
          icon: 'manage-search',
          title: 'Searching Google Maps…',
          status: 'active',
          accent: colors.auroraBlue,
        });
      }
    }

    if (ev.type === 'token') {
      // Show AI reasoning only if there are no search steps yet (early thinking)
      const hasSearch = steps.some(s => s.id === 'search');
      if (!hasSearch) {
        const r = steps.find(s => s.id === 'reasoning');
        if (!r) {
          steps.push({ id: 'reasoning', icon: 'psychology', title: 'AI Reasoning', status: 'active', accent: colors.secondary });
        }
      } else {
        // Kill reasoning once search starts
        const r = steps.find(s => s.id === 'reasoning');
        if (r) r.status = 'done';
      }
    }
  }

  // Final step
  if (finalResult) {
    // Settle any still-active steps
    steps.forEach(s => { if (s.status === 'active') s.status = 'done'; });

    const providers: any[] = finalResult.recommended_providers ?? [];
    steps.push({
      id: 'complete',
      icon: 'task-alt',
      title: providers.length > 0
        ? `Selected best match — ${providers[0].name}`
        : (finalResult.intent_resolved ? 'Request handled' : 'Could not complete'),
      status: 'done',
      accent: providers.length > 0 ? colors.primary : '#E57373',
    });
  } else if (isStreaming) {
    // Ensure at least one active step if nothing qualifies
    const hasActive = steps.some(s => s.status === 'active');
    if (!hasActive && steps.length > 1) {
      steps.push({ id: 'thinking', icon: 'hourglass-top', title: 'Processing…', status: 'active' });
    }
  }

  return steps;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
interface ExecutionScreenProps {
  onMenuPress?: () => void;
  isSidebarOpen?: boolean;
  onNavigateToChat?: () => void;
}

export function ExecutionScreen({ onMenuPress, isSidebarOpen, onNavigateToChat }: ExecutionScreenProps) {
  const { colors } = useTheme();
  const st = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { events, isStreaming, finalResult } = useAgentStore();
  const { session, profile } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const fallbackSessionIdRef = useRef(`execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const retellPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retellPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [activeRetellCallId, setActiveRetellCallId] = useState<string | null>(null);
  const [retellProgress, setRetellProgress] = useState<RetellProgress>(INITIAL_RETELL_PROGRESS);
  const [calState, setCalState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const topProvider = finalResult?.recommended_providers?.[0] ?? null;
  const sessionId = finalResult?.session_id ?? fallbackSessionIdRef.current;
  const extractedDetails = useMemo(
    () => (finalResult?.parameters?.extracted_details ?? {}) as Record<string, unknown>,
    [finalResult?.parameters?.extracted_details]
  );

  const stopRetellPolling = useCallback(() => {
    if (retellPollIntervalRef.current) {
      clearInterval(retellPollIntervalRef.current);
      retellPollIntervalRef.current = null;
    }
    if (retellPollTimeoutRef.current) {
      clearTimeout(retellPollTimeoutRef.current);
      retellPollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopRetellPolling();
    setActiveRetellCallId(null);
    setRetellProgress(INITIAL_RETELL_PROGRESS);
    setCallStatus(null);
  }, [sessionId, stopRetellPolling]);

  const startRetellPolling = useCallback((callId?: string | null) => {
    stopRetellPolling();

    const run = async () => {
      try {
        const history = await fetchSessionHistory(sessionId);
        const progress = parseRetellProgress(history.messages, callId ?? activeRetellCallId);
        setRetellProgress(progress);
        if (progress.callId && progress.callId !== activeRetellCallId) {
          setActiveRetellCallId(progress.callId);
        }
        if (progress.message) setCallStatus(progress.message);
        if (progress.done) stopRetellPolling();
      } catch {
        // Keep previous status message if polling fails.
      }
    };

    void run();
    retellPollIntervalRef.current = setInterval(() => {
      void run();
    }, RETELL_POLL_INTERVAL_MS);
    retellPollTimeoutRef.current = setTimeout(() => {
      stopRetellPolling();
    }, RETELL_POLL_TIMEOUT_MS);
  }, [activeRetellCallId, sessionId, stopRetellPolling]);

  useEffect(() => {
    void (async () => {
      try {
        const history = await fetchSessionHistory(sessionId);
        const progress = parseRetellProgress(history.messages, activeRetellCallId);
        setRetellProgress(progress);
        if (progress.callId && progress.callId !== activeRetellCallId) {
          setActiveRetellCallId(progress.callId);
        }
        if (progress.message) setCallStatus(progress.message);
        if (progress.stage === 'in_progress' || progress.stage === 'ended' || progress.stage === 'queued') {
          startRetellPolling(progress.callId);
        }
      } catch {
        // No prior call progress.
      }
    })();
  }, [activeRetellCallId, sessionId, startRetellPolling]);

  const steps = useMemo(() => {
    const base = buildSteps(events, finalResult, isStreaming, colors);
    const retell = buildRetellSteps(retellProgress, colors);
    return [...base, ...retell];
  }, [colors, events, finalResult, isStreaming, retellProgress]);

  // Auto-scroll to bottom as steps come in
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [steps.length]);

  useEffect(() => {
    return () => {
      stopRetellPolling();
    };
  }, [stopRetellPolling]);

  const bookingConfirmation = finalResult?.booking_confirmation as Record<string, unknown> | null | undefined;
  const confirmedDate = bookingConfirmation?.confirmed_date as string | undefined;
  const confirmedTime = bookingConfirmation?.confirmed_time as string | undefined;
  const bookingLabel = bookingConfirmation?.label as string | undefined;

  const bookingDateTime = React.useMemo(() => {
    if (confirmedDate && confirmedTime) return `${confirmedDate}T${confirmedTime}:00`;
    // Default to tomorrow at 10:00 AM when no time was specified
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 19);
  }, [confirmedDate, confirmedTime]);

  const handleAddToCalendar = useCallback(async () => {
    if (!bookingDateTime || calState === 'loading' || calState === 'done') return;
    setCalState('loading');
    try {
      await createCalendarEvent(bookingLabel ?? topProvider?.name ?? 'Service Booking', bookingDateTime);
      setCalState('done');
    } catch {
      setCalState('error');
    }
  }, [bookingDateTime, bookingLabel, calState, topProvider?.name]);

  const handleBookNow = useCallback(async () => {
    if (isCalling) return;

    setIsCalling(true);
    setCallStatus(null);
    try {
      const response = await createRetellOutboundCall({
        session_id: sessionId,
        to_number: BOOK_NOW_CALL_NUMBER,
        user_id: session?.user?.id,
        provider_name: topProvider?.name,
        booking_message: topProvider?.name
          ? `Please call ${topProvider.name} to confirm the booking for this service request.`
          : 'Please call to confirm the booking for this service request.',
        customer_name: toText(session?.user?.user_metadata?.full_name),
        service_type: toText(extractedDetails.service_type) ?? toText(extractedDetails.service),
        location:
          toText(profile?.address) ??
          toText(extractedDetails.location) ??
          toText(extractedDetails.area) ??
          toText(extractedDetails.destination),
        preferred_date: toText(extractedDetails.preferred_date) ?? toText(extractedDetails.date),
        preferred_time: toText(extractedDetails.preferred_time) ?? toText(extractedDetails.time),
        alternative_times:
          toText(extractedDetails.alternative_times) ??
          toText(extractedDetails.alternative_time) ??
          toText(extractedDetails.alternatives),
        booking_id: sessionId,
      });
      setCallStatus(
        [
          response.message || `Outbound call started to ${BOOK_NOW_CALL_NUMBER}.`,
          response.dynamic_variables_preview
            ? `Retell payload:\n${JSON.stringify(response.dynamic_variables_preview, null, 2)}`
            : null,
        ]
          .filter(Boolean)
          .join('\n\n')
      );
      setActiveRetellCallId(response.call_id ?? null);
      setRetellProgress({
        callId: response.call_id ?? undefined,
        stage: 'queued',
        done: false,
        hasStarted: false,
        hasTranscript: false,
        hasEnded: false,
        hasAnalyzed: false,
      });
      startRetellPolling(response.call_id);
    } catch (error) {
      setCallStatus(error instanceof Error ? error.message : 'Unable to start the call right now.');
    } finally {
      setIsCalling(false);
    }
  }, [extractedDetails, isCalling, profile?.address, session?.user?.id, session?.user?.user_metadata?.full_name, sessionId, startRetellPolling, topProvider?.name]);
  const taskLabel = finalResult?.parameters?.extracted_details
    ? Object.values(finalResult.parameters.extracted_details).filter(Boolean).join(' · ')
    : 'Automated Task';

  return (
    <View style={st.root}>
      <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          st.content,
          { paddingTop: insets.top + Layout.headerHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <Text style={[Typography.displayLg, { color: colors.textPrimary, textAlign: 'center' }]}>
            Execution
          </Text>
          <Text style={[Typography.displayLg, { color: colors.auroraPurple, textAlign: 'center' }]}>
            Sequence
          </Text>
          <Text
            style={[
              Typography.bodyLg,
              { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            {`Monitoring automated task progression for\n'${taskLabel}'.`}
          </Text>
        </View>

        {/* ── Timeline ── */}
        <View style={st.timelineCard}>
          <View style={st.gradBg} />
          <View style={st.timeline}>
            {steps.length === 0 ? (
              <View style={st.emptyState}>
                <ActivityIndicator color={colors.auroraPurple} />
                <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, marginTop: Spacing.sm }]}>
                  Waiting for tasks…
                </Text>
              </View>
            ) : (
              steps.map((step, i) => (
                <StepRow key={step.id} step={step} isLast={i === steps.length - 1} index={i} />
              ))
            )}
          </View>
        </View>

        {/* ── Provider card (revealed when done) ── */}
        {topProvider && (
          <View style={{ width: '100%', maxWidth: 600, marginTop: Spacing.xxl }}>
            <View style={st.sectionLabel}>
              <MaterialIcons name="emoji-events" size={16} color={colors.primary} />
              <Text style={[Typography.labelLg, { color: colors.primary }]}>Recommended Provider</Text>
            </View>
            <ProviderCard
              provider={topProvider}
              onBookNowPress={handleBookNow}
              isCalling={isCalling}
              bookingStatus={retellProgress.booking?.status ?? null}
              confirmedDate={retellProgress.booking?.confirmedDate ?? null}
              confirmedTime={retellProgress.booking?.confirmedTime ?? null}
              onAddToCalendar={session && topProvider ? handleAddToCalendar : undefined}
              calState={calState}
            />
            {callStatus ? (
              <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, marginTop: Spacing.sm }]}>
                {callStatus}
              </Text>
            ) : null}
          </View>
        )}

        {/* ── Actions ── */}
        <View style={st.actions}>
          <Pressable style={st.cancelBtn} onPress={onNavigateToChat}>
            <Text style={[Typography.labelLg, { color: colors.onSurfaceVariant }]}>Cancel Task</Text>
          </Pressable>
          <Pressable style={st.interveneBtn} onPress={onNavigateToChat}>
            <MaterialIcons name="chat" size={18} color={colors.primary} />
            <Text style={[Typography.labelLg, { color: colors.primary }]}>Intervene</Text>
          </Pressable>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function createStyles(colors: any) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: Spacing.marginMobile,
    alignItems: 'center',
    paddingBottom: Spacing.xxl,
  },
  header: { marginBottom: Spacing.xxxl, width: '100%', maxWidth: 600 },

  // Timeline card
  timelineCard: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: Radii.lg,
    ...Shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceBorder + '1A',
    padding: Spacing.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  gradBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.auroraBlue,
    opacity: 0.02,
  },
  timeline: { gap: Spacing.xxl },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl },

  // Step row
  stepRow: { flexDirection: 'row', gap: Spacing.base, minHeight: 32 },
  dotCol: { alignItems: 'center', width: 24 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    marginTop: Spacing.xs,
    marginBottom: -Spacing.lg,
  },

  // Pulsing dot
  pulseWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  ping: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.auroraPurple,
  },
  activeDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.auroraPurple,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.auroraPurple },

  // Step content
  stepContent: { flex: 1, paddingBottom: Spacing.xs },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepIconTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  iconBubble: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section label
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  // Provider card
  providerCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    ...Shadows.card,
    overflow: 'hidden',
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder + '1A',
  },
  providerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 1 },
  selectedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.primary + '18',
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: colors.primary + '44',
  },
  bookedBadge: {
    backgroundColor: '#C8E6C9',
    borderColor: '#66BB6A',
  },
  providerDetails: { padding: Spacing.xl, gap: Spacing.md },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  reviewBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: colors.surfaceContainer,
    borderRadius: Radii.default,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    margin: Spacing.xl,
    marginTop: 0,
    paddingVertical: Spacing.base,
    borderRadius: Radii.full,
    backgroundColor: colors.primary,
  },
  bookBtnDisabled: { opacity: 0.65 },
  bookedBtn: { backgroundColor: '#2E7D32' },
  calBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.base,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
  },
  calBtnDisabled: { opacity: 0.65 },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'flex-end',
    width: '100%',
    maxWidth: 600,
    marginTop: Spacing.xxl,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder + '4D',
  },
  interveneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.surfaceBorder + '1A',
    ...Shadows.cardSm,
  },
}); }
