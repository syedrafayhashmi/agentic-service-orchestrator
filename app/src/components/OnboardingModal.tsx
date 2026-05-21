/**
 * OnboardingModal — Profile completion interceptor
 * Collects: Address (auto-filled from GPS or manual), Phone, DOB, and Precise Location
 * Blocks access to the app until all fields are submitted.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

interface OnboardingModalProps {
  visible: boolean;
}

type OnboardingStep = 'location_permission' | 'profile_form';

export function OnboardingModal({ visible }: OnboardingModalProps) {
  const { colors } = useTheme();
  const { session, setProfile } = useAuthStore();

  // Step management
  const [step, setStep] = useState<OnboardingStep>('location_permission');

  // Form fields
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dob, setDob] = useState('');
  const [exactLocation, setExactLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);

  // UI state
  const [isLocating, setIsLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [addressAutoFilled, setAddressAutoFilled] = useState(false);

  // Prefill fields from session/profile/oauth metadata when modal opens
  useEffect(() => {
    if (!visible || !session) return;
    const profile = useAuthStore.getState().profile;
    const meta = session.user?.user_metadata || {};

    if (profile) {
      if (profile.phone_number) setPhoneNumber(profile.phone_number);
      if (profile.dob) setDob(profile.dob);
      if (profile.address) {
        setAddress(profile.address);
        setAddressAutoFilled(true);
      }
      if (profile.exact_location && profile.exact_location.latitude && profile.exact_location.longitude) {
        setExactLocation({
          latitude: profile.exact_location.latitude,
          longitude: profile.exact_location.longitude,
          accuracy: profile.exact_location.accuracy,
        });
        setStep('profile_form');
        return;
      }
    } else {
      // Try to use OAuth-provided metadata
      if (meta?.phone || meta?.phone_number) setPhoneNumber(meta.phone || meta.phone_number);
      const rawDob = meta?.birthday || meta?.dob;
      if (rawDob) {
        // Normalize YYYY-MM-DD -> DD/MM/YYYY if needed
        if (rawDob.includes('-')) {
          const parts = rawDob.split('-');
          if (parts.length >= 3) setDob(`${parts[2]}/${parts[1]}/${parts[0]}`);
        } else {
          setDob(rawDob);
        }
      }
    }

    // If browser has already granted geolocation permission, skip the dialog and fetch automatically
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'granted') {
          requestLocation();
        }
      }).catch(() => {});
    }
  }, [visible, session]);

  // Radar pulse animation
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const radarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 600, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(radarAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  if (!visible || !session) return null;

  // ── Location Permission Step ───────────────────────────────────────────────
  const requestLocation = () => {
    setIsLocating(true);
    setLocationDenied(false);

    const onSuccess = async (position: GeolocationPosition) => {
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy),
      };
      setExactLocation(coords);

      // Try reverse geocoding to auto-fill address
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=16`
        );
        const data = await res.json();
        if (data?.display_name) {
          // Trim to a reasonable address length
          const parts = data.display_name.split(',').slice(0, 4).join(',').trim();
          setAddress(parts);
          setAddressAutoFilled(true);
        }
      } catch {
        // Reverse geocoding failed — user can enter manually
      }

      setIsLocating(false);
      setStep('profile_form');
    };

    const onError = () => {
      setLocationDenied(true);
      setIsLocating(false);
    };

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 8000,
      });
    } else {
      simulateLocation();
    }
  };

  const simulateLocation = () => {
    setIsLocating(true);
    setTimeout(() => {
      setExactLocation({
        latitude: 37.7749 + (Math.random() - 0.5) * 0.02,
        longitude: -122.4194 + (Math.random() - 0.5) * 0.02,
        accuracy: 15,
      });
      setIsLocating(false);
      setStep('profile_form');
    }, 1800);
  };

  // ── DOB validation helper ──────────────────────────────────────────────────
  const formatDob = (text: string) => {
    // Auto-format as DD/MM/YYYY
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
  };

  const isDobValid = (val: string) => {
    const parts = val.split('/');
    if (parts.length !== 3) return false;
    const [dd, mm, yyyy] = parts.map(Number);
    if (!dd || !mm || !yyyy) return false;
    if (dd < 1 || dd > 31) return false;
    if (mm < 1 || mm > 12) return false;
    if (yyyy < 1900 || yyyy > new Date().getFullYear() - 13) return false;
    return true;
  };

  // ── Submit profile ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!address.trim()) {
      setErrorMessage('Please enter your address.');
      return;
    }
    if (!exactLocation) {
      setErrorMessage('GPS location is strictly required to proceed.');
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.replace(/[^0-9]/g, '').length < 7) {
      setErrorMessage('Please enter a valid phone number.');
      return;
    }
    if (!isDobValid(dob)) {
      setErrorMessage('Please enter a valid date of birth (DD/MM/YYYY, must be 13+).');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const user = session.user;
      
      // Convert DD/MM/YYYY to YYYY-MM-DD for Postgres date compatibility
      const dobParts = dob.split('/');
      const isoDob = `${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`;

      const payload = {
        id: user.id,
        address: address.trim(),
        phone_number: phoneNumber.trim(),
        dob: isoDob,
        exact_location: exactLocation ?? undefined,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Service User',
        avatar_url: user.user_metadata?.avatar_url || '',
        // updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('profiles').upsert(payload);
      if (error) throw error;

      setProfile(payload);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ─── Location permission step UI ──────────────────────────────────────────
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const radarRotate = radarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const renderLocationStep = () => (
    <View style={styles.stepContainer}>
      {/* Animated Location Icon */}
      <View style={styles.locationIconArea}>
        <Animated.View style={[styles.pulseDot, {
          transform: [{ scale: pulseScale }],
          opacity: pulseOpacity,
          backgroundColor: colors.primaryContainer,
        }]} />
        <Animated.View style={[styles.radarSweep, {
          borderColor: colors.primary,
          transform: [{ rotate: radarRotate }],
        }]} />
        <View style={[styles.locationPinCircle, { backgroundColor: colors.primaryContainer }]}>
          <MaterialIcons name="location-on" size={40} color={colors.primary} />
        </View>
      </View>

      <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Allow Location Access</Text>
      <Text style={[styles.stepSubtitle, { color: colors.onSurfaceVariant }]}>
        We'll use your GPS to auto-fill your address and enable agent-based local service discovery. Your location is only stored for service routing.
      </Text>

      {locationDenied && (
        <View style={[styles.infoBox, { backgroundColor: colors.errorContainer, borderColor: colors.error }]}>
          <MaterialIcons name="error-outline" size={16} color={colors.error} />
          <Text style={[styles.infoBoxText, { color: colors.error }]}>
            Location access is strictly required to use the app. Please enable it in your browser/device settings and try again.
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.primaryBtn, { backgroundColor: colors.primary }, isLocating && styles.btnDisabled]}
        onPress={requestLocation}
        disabled={isLocating}
      >
        {isLocating ? (
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={[styles.primaryBtnText, { marginLeft: Spacing.sm }]}>Acquiring signal…</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <MaterialIcons name="my-location" size={18} color="#FFF" style={{ marginRight: Spacing.sm }} />
            <Text style={styles.primaryBtnText}>Allow Location</Text>
          </View>
        )}
      </Pressable>
    </View>
  );

  // ─── Profile form step UI ──────────────────────────────────────────────────
  const renderProfileForm = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.formHeader}>
        <View style={[styles.headerIconCircle, { backgroundColor: colors.primaryContainer + '33' }]}>
          <MaterialIcons name="person-add" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Complete Your Profile</Text>
        <Text style={[styles.stepSubtitle, { color: colors.onSurfaceVariant }]}>
          These details help us dispatch agents and personalize your experience.
        </Text>
      </View>

      {/* Location status badge */}
      {exactLocation && (
        <View style={[styles.locationBadge, { backgroundColor: colors.primaryContainer + '22', borderColor: colors.primary + '44' }]}>
          <MaterialIcons name="gps-fixed" size={14} color={colors.primary} />
          <Text style={[styles.locationBadgeText, { color: colors.primary }]}>
            GPS captured · {exactLocation.latitude.toFixed(4)}, {exactLocation.longitude.toFixed(4)}
          </Text>
        </View>
      )}

      {/* Error */}
      {!!errorMessage && (
        <View style={[styles.errorBox, { backgroundColor: colors.errorContainer, borderColor: colors.error + '44' }]}>
          <MaterialIcons name="error-outline" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
        </View>
      )}

      {/* Address */}
      <View style={styles.fieldGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Address</Text>
          {addressAutoFilled && (
            <View style={[styles.autoBadge, { backgroundColor: colors.primaryContainer + '33' }]}>
              <MaterialIcons name="auto-awesome" size={12} color={colors.primary} />
              <Text style={[styles.autoBadgeText, { color: colors.primary }]}>Auto-filled</Text>
            </View>
          )}
        </View>
        <View style={[
          styles.inputWrapper,
          { backgroundColor: colors.surface, borderColor: addressAutoFilled ? colors.primary + '66' : colors.outlineVariant },
        ]}>
          <MaterialIcons name="home" size={18} color={colors.onSurfaceVariant} style={styles.inputIcon} />
          <TextInput
            style={[styles.textInput, { color: colors.onSurface }]}
            placeholder="123 Main St, City, Country"
            placeholderTextColor={colors.onSurfaceVariant}
            value={address}
            onChangeText={(t) => { setAddress(t); setAddressAutoFilled(false); setErrorMessage(''); }}
            autoCapitalize="words"
            multiline={false}
          />
          {addressAutoFilled && (
            <Pressable onPress={() => { setAddress(''); setAddressAutoFilled(false); }}>
              <MaterialIcons name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Phone */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Phone Number</Text>
        <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
          <MaterialIcons name="phone" size={18} color={colors.onSurfaceVariant} style={styles.inputIcon} />
          <TextInput
            style={[styles.textInput, { color: colors.onSurface }]}
            placeholder="+1 (555) 000-0000"
            placeholderTextColor={colors.onSurfaceVariant}
            value={phoneNumber}
            onChangeText={(t) => { setPhoneNumber(t); setErrorMessage(''); }}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      {/* Date of Birth */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Date of Birth</Text>
        <View style={[
          styles.inputWrapper,
          { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
          isDobValid(dob) && { borderColor: colors.primary + '66' },
        ]}>
          <MaterialIcons name="cake" size={18} color={colors.onSurfaceVariant} style={styles.inputIcon} />
          <TextInput
            style={[styles.textInput, { color: colors.onSurface }]}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={colors.onSurfaceVariant}
            value={dob}
            onChangeText={(t) => {
              setDob(formatDob(t));
              setErrorMessage('');
            }}
            keyboardType="numeric"
            maxLength={10}
          />
          {isDobValid(dob) && (
            <MaterialIcons name="check-circle" size={18} color={colors.primary} />
          )}
        </View>
        <Text style={[styles.fieldHint, { color: colors.onSurfaceVariant }]}>
          Must be 13 years or older
        </Text>
      </View>

      {/* Recapture location if skipped */}
      {!exactLocation && (
        <Pressable
          style={[styles.locationRetryBtn, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}
          onPress={requestLocation}
          disabled={isLocating}
        >
          <MaterialIcons name="gps-not-fixed" size={18} color={colors.primary} />
          <Text style={[styles.locationRetryText, { color: colors.primary }]}>
            {isLocating ? 'Locating…' : 'Capture GPS Location (optional)'}
          </Text>
          {isLocating && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 'auto' }} />}
        </Pressable>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.logoutBtn} onPress={handleLogout} disabled={isSaving}>
          <Text style={[styles.logoutText, { color: colors.onSurfaceVariant }]}>Sign Out</Text>
        </Pressable>

        <Pressable
          style={[styles.submitBtn, { backgroundColor: colors.primary }, isSaving && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <View style={styles.btnRow}>
              <Text style={styles.primaryBtnText}>Complete Setup</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: Spacing.sm }} />
            </View>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );

  // ─── Modal wrapper ─────────────────────────────────────────────────────────
  const modalContent = (
    <View style={styles.overlay}>
      <View style={[
        styles.container,
        { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant },
        step === 'profile_form' && styles.containerTall,
      ]}>
        {step === 'location_permission' && renderLocationStep()}
        {step === 'profile_form' && renderProfileForm()}
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 99999, position: 'fixed' as any }]} pointerEvents="auto">
        {modalContent}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      {modalContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  container: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    ...Platform.select({
      web: { boxShadow: '0px 16px 40px rgba(0, 0, 0, 0.25)' } as any,
      default: { elevation: 16 },
    }),
  },
  containerTall: {
    maxHeight: '88%',
  },
  stepContainer: {
    alignItems: 'center',
  },
  // Location step
  locationIconArea: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  pulseDot: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  radarSweep: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.3,
  },
  locationPinCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    ...Typography.headlineMd,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    ...Typography.bodyMd,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: Radii.default,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
    width: '100%',
  },
  infoBoxText: {
    ...Typography.labelMd,
    flex: 1,
    lineHeight: 18,
  },
  primaryBtn: {
    height: 50,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: Spacing.md,
  },
  primaryBtnText: {
    ...Typography.labelLg,
    color: '#FFF',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    paddingVertical: Spacing.sm,
  },
  skipText: {
    ...Typography.bodyMd,
    textDecorationLine: 'underline',
  },
  // Profile form
  formHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    alignSelf: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  locationBadgeText: {
    ...Typography.labelMd,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.default,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  errorText: {
    ...Typography.labelMd,
    flex: 1,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  fieldLabel: {
    ...Typography.labelLg,
    fontWeight: '600',
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  autoBadgeText: {
    ...Typography.labelMd,
    fontWeight: '600',
    fontSize: 11,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.lg,
    height: 50,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  textInput: {
    flex: 1,
    ...Typography.bodyMd,
    ...Platform.select({ web: { outlineStyle: 'none' } as any }),
  },
  fieldHint: {
    ...Typography.labelMd,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  locationRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radii.md,
    height: 48,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  locationRetryText: {
    ...Typography.labelLg,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  logoutBtn: {
    height: 48,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    ...Typography.labelLg,
    fontWeight: '500',
  },
  submitBtn: {
    height: 50,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
