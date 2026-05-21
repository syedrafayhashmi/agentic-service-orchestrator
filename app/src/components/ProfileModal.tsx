import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDHuJaxR0M3q08NBFOI0mCgclsGoNs7KqV5CMu7JHpl-x03ViD7cfBd0dWq7yrsyfpyeWFLVM4WeOTMXPDkE1dJTdpcla9DnZ5QgvIyx-BLjnf-MH7RrXQ2AnqrlJGwYvChbAA6LLBTMH6i7jwSRNhBcmpHFjCQRS5cUFFOZq5YSN60nwteAe42RvvANFMOBoO0IshqVOt87aMi7bJ0RQKx2wJ0Bntx_1SwLVLmbMDyztm2jZP7s4vOwUwe3AFhxC4MwI56Q2hCxto';

export function ProfileModal({ visible, onClose }: ProfileModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { session, profile, setProfile } = useAuthStore();

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [exactLocation, setExactLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);

  // UI state
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [addressAutoFilled, setAddressAutoFilled] = useState(false);

  // Helper: Convert YYYY-MM-DD -> DD/MM/YYYY
  const formatIsoToDob = (isoString?: string) => {
    if (!isoString) return '';
    const parts = isoString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoString;
  };

  // Sync state with current store profile when modal opens
  useEffect(() => {
    if (visible && profile) {
      setFullName(profile.full_name || '');
      setPhoneNumber(profile.phone_number || '');
      setAddress(profile.address || '');
      setDob(formatIsoToDob(profile.dob));
      setAddressAutoFilled(false);
      setErrorMessage('');
      setShowSuccess(false);
      if (profile.exact_location) {
        setExactLocation({
          latitude: profile.exact_location.latitude,
          longitude: profile.exact_location.longitude,
          accuracy: profile.exact_location.accuracy,
        });
      } else {
        setExactLocation(null);
      }
    }
  }, [visible, profile]);

  if (!session) return null;

  const email = session.user.email;
  const avatarUrl = profile?.avatar_url || session.user.user_metadata?.avatar_url || DEFAULT_AVATAR;

  // Track changes to enable Update button
  const hasChanges = () => {
    const originalFullName = profile?.full_name || '';
    const originalPhone = profile?.phone_number || '';
    const originalAddress = profile?.address || '';
    const originalDob = formatIsoToDob(profile?.dob) || '';
    const originalLocation = profile?.exact_location || null;

    const latDiff = exactLocation?.latitude !== originalLocation?.latitude;
    const lonDiff = exactLocation?.longitude !== originalLocation?.longitude;

    return (
      fullName.trim() !== originalFullName ||
      phoneNumber.trim() !== originalPhone ||
      address.trim() !== originalAddress ||
      dob !== originalDob ||
      latDiff ||
      lonDiff
    );
  };

  // DOB validation helper
  const formatDob = (text: string) => {
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

  // Location service
  const requestLocation = () => {
    setIsLocating(true);
    setErrorMessage('');

    const onSuccess = async (position: GeolocationPosition) => {
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy),
      };
      setExactLocation(coords);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=16`
        );
        const data = await res.json();
        if (data?.display_name) {
          const parts = data.display_name.split(',').slice(0, 4).join(',').trim();
          setAddress(parts);
          setAddressAutoFilled(true);
        }
      } catch {
        // Fallback silently if Nominatim fails
      }
      setIsLocating(false);
    };

    const onError = () => {
      setErrorMessage('Could not acquire GPS coordinates. Please allow location permissions.');
      setIsLocating(false);
    };

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 8000,
      });
    } else {
      // Simulation
      setTimeout(() => {
        setExactLocation({
          latitude: 37.7749 + (Math.random() - 0.5) * 0.02,
          longitude: -122.4194 + (Math.random() - 0.5) * 0.02,
          accuracy: 15,
        });
        setIsLocating(false);
      }, 1500);
    }
  };

  // Submit profile update
  const handleUpdate = async () => {
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!address.trim()) {
      setErrorMessage('Please enter your address.');
      return;
    }
    if (!exactLocation) {
      setErrorMessage('GPS location is strictly required.');
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.replace(/[^0-9]/g, '').length < 7) {
      setErrorMessage('Please enter a valid phone number.');
      return;
    }
    if (!isDobValid(dob)) {
      setErrorMessage('Please enter a valid date of birth (DD/MM/YYYY, 13+).');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const dobParts = dob.split('/');
      const isoDob = `${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`;

      const payload = {
        id: session.user.id,
        full_name: fullName.trim(),
        address: address.trim(),
        phone_number: phoneNumber.trim(),
        dob: isoDob,
        exact_location: exactLocation,
        avatar_url: profile?.avatar_url || session.user.user_metadata?.avatar_url || '',
      };

      const { error } = await supabase.from('profiles').upsert(payload);
      if (error) throw error;

      setProfile(payload);
      setShowSuccess(true);

      // Transition success back after 1.5 seconds and close the modal
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onClose();
  };

  const modalContent = (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={[styles.container, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <MaterialIcons name="close" size={20} color={colors.onSurface} />
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          <Text style={[Typography.headlineMd, styles.name, { color: colors.onSurface }]}>Edit Profile</Text>
          {email && <Text style={[Typography.bodyLg, styles.email, { color: colors.onSurfaceVariant }]}>{email}</Text>}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        {/* Scrollable Fields */}
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
          style={styles.scrollArea}
        >
          {/* Error Message */}
          {!!errorMessage && (
            <View style={[styles.errorBox, { backgroundColor: colors.errorContainer, borderColor: colors.error + '44' }]}>
              <MaterialIcons name="error-outline" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
            </View>
          )}

          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Full Name</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <MaterialIcons name="person" size={18} color={colors.onSurfaceVariant} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.onSurface }]}
                placeholder="Full Name"
                placeholderTextColor={colors.onSurfaceVariant}
                value={fullName}
                onChangeText={(t) => { setFullName(t); setErrorMessage(''); }}
                autoCapitalize="words"
              />
            </View>
          </View>

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
            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <MaterialIcons name="home" size={18} color={colors.onSurfaceVariant} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.onSurface }]}
                placeholder="123 Main St, City, Country"
                placeholderTextColor={colors.onSurfaceVariant}
                value={address}
                onChangeText={(t) => { setAddress(t); setAddressAutoFilled(false); setErrorMessage(''); }}
                autoCapitalize="words"
              />
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
            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <MaterialIcons name="cake" size={18} color={colors.onSurfaceVariant} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.onSurface }]}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.onSurfaceVariant}
                value={dob}
                onChangeText={(t) => { setDob(formatDob(t)); setErrorMessage(''); }}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <Text style={[styles.fieldHint, { color: colors.onSurfaceVariant }]}>Must be 13 years or older</Text>
          </View>

          {/* Exact Location indicator & refresh button */}
          <View style={styles.locationContainer}>
            {exactLocation ? (
              <View style={[styles.locationBadge, { backgroundColor: colors.primaryContainer + '22', borderColor: colors.primary + '44' }]}>
                <MaterialIcons name="gps-fixed" size={14} color={colors.primary} />
                <Text style={[styles.locationBadgeText, { color: colors.primary }]}>
                  GPS Captured: {exactLocation.latitude.toFixed(4)}, {exactLocation.longitude.toFixed(4)}
                </Text>
              </View>
            ) : (
              <View style={[styles.locationBadge, { backgroundColor: colors.errorContainer + '22', borderColor: colors.error + '44' }]}>
                <MaterialIcons name="gps-off" size={14} color={colors.error} />
                <Text style={[styles.locationBadgeText, { color: colors.error }]}>GPS Location Missing</Text>
              </View>
            )}

            <Pressable
              style={[styles.locationRetryBtn, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}
              onPress={requestLocation}
              disabled={isLocating}
            >
              <MaterialIcons name="my-location" size={18} color={colors.primary} />
              <Text style={[styles.locationRetryText, { color: colors.primary }]}>
                {isLocating ? 'Locating…' : 'Recapture GPS Coordinates'}
              </Text>
              {isLocating && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 'auto' }} />}
            </Pressable>
          </View>
        </ScrollView>

        <View style={[styles.divider, { backgroundColor: colors.outlineVariant, marginVertical: Spacing.md }]} />

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Pressable style={styles.logoutBtn} onPress={handleLogout} disabled={isSaving}>
            <MaterialIcons name="logout" size={20} color={colors.error} />
            <Text style={[styles.logoutText, { color: colors.error }]}>Log out</Text>
          </Pressable>

          <Pressable
            style={[
              styles.submitBtn,
              { backgroundColor: colors.primary },
              !hasChanges() && !isSaving && !showSuccess && styles.btnDisabled,
            ]}
            onPress={handleUpdate}
            disabled={(!hasChanges() || isSaving) && !showSuccess}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : showSuccess ? (
              <View style={styles.btnRow}>
                <MaterialIcons name="check-circle" size={18} color="#FFF" style={{ marginRight: Spacing.sm }} />
                <Text style={styles.submitBtnText}>Updated!</Text>
              </View>
            ) : (
              <View style={styles.btnRow}>
                <MaterialIcons name="save" size={18} color="#FFF" style={{ marginRight: Spacing.sm }} />
                <Text style={styles.submitBtnText}>Update Profile</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {modalContent}
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  container: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii.lg,
    padding: Spacing.xl,
    position: 'relative',
    borderWidth: 1,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.16)',
      } as any,
      default: {
        elevation: 12,
      },
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.xs,
    zIndex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: Spacing.md,
    backgroundColor: colors.surfaceContainerHigh,
  },
  name: {
    fontWeight: '700',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  email: {
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
  },
  scrollArea: {
    maxHeight: 320,
    width: '100%',
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
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    ...Typography.labelLg,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
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
    height: 48,
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
  locationContainer: {
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    gap: Spacing.xs,
  },
  locationBadgeText: {
    ...Typography.labelMd,
    fontWeight: '600',
  },
  locationRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radii.md,
    height: 44,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  locationRetryText: {
    ...Typography.labelLg,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  logoutText: {
    marginLeft: Spacing.sm,
    fontWeight: '600',
    ...Typography.labelLg,
  },
  submitBtn: {
    height: 46,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    ...Typography.labelLg,
    color: '#FFF',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
