import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { ServiceHeader } from '@/components/ServiceHeader';
import { Chip } from '@/components/Chip';
import { Typography, Spacing, Radii, Shadows, Layout } from '@/constants/theme';
import { streamChatMessage } from '@/lib/chatApi';
import { useTheme } from '@/contexts/ThemeContext';

const debugLog = (...args: any[]) => console.log('[Discovery]', ...args);

const FILTERS = ['HVAC Repair', 'Plumbing', 'Electrical', 'Cleaning'];

const TECH_AVATARS = [
  'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
];

interface RecommendedTech {
  name: string;
  address?: string;
  phone_number?: string;
  rating?: number;
  reviews_summary?: string;
  reasoning?: string;
}

interface DiscoveryScreenProps {
  onMenuPress?: () => void;
  isSidebarOpen?: boolean;
}

export function DiscoveryScreen({ onMenuPress, isSidebarOpen }: DiscoveryScreenProps) {
  const { colors } = useTheme();
  const st = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('HVAC Repair');
  const [gpsAddress, setGpsAddress] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(true);
  const [cache, setCache] = useState<Record<string, RecommendedTech[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Generating AI recommendations...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Request GPS permission and coordinates
  const requestLocation = async (active = true) => {
    debugLog('requestLocation called, platform:', Platform.OS);
    setIsRequestingLocation(true);

    if (Platform.OS === 'web') {
      if (!navigator.geolocation) {
        debugLog('Geolocation not supported');
        if (active) { setPermissionStatus('denied'); setIsRequestingLocation(false); }
        return;
      }

      const handleWebPosition = async (position: GeolocationPosition) => {
        if (!active) return;
        debugLog('Web geolocation granted, coords:', position.coords.latitude, position.coords.longitude);
        setPermissionStatus('granted');

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
            { headers: { 'User-Agent': 'AgenticServiceOrchestrator/1.0' } }
          );
          const data = await response.json();
          if (active && data && data.address) {
            const city = data.address.city || data.address.town || data.address.village || data.address.suburb || '';
            const country = data.address.country || '';
            const road = data.address.road || '';
            const addressParts = [road, city, country].filter(Boolean);
            const readableAddress = addressParts.join(', ');
            debugLog('Web reverse geocode result:', readableAddress);
            setGpsAddress(readableAddress || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
          } else if (active) {
            setGpsAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
          }
        } catch (osmErr) {
          debugLog('Nominatim reverse geocode failed:', osmErr);
          if (active) setGpsAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        } finally {
          if (active) setIsRequestingLocation(false);
        }
      };

      const handleWebError = (error: GeolocationPositionError) => {
        if (!active) return;
        debugLog('Web geolocation error, code:', error.code, 'message:', error.message);
        setPermissionStatus('denied');
        setIsRequestingLocation(false);
      };

      // Low accuracy (wifi/IP) is fast and works on all browsers. High accuracy (GPS) times out on desktop.
      navigator.geolocation.getCurrentPosition(
        handleWebPosition,
        handleWebError,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      try {
        debugLog('Checking existing permission...');
        const existing = await Location.getForegroundPermissionsAsync();
        debugLog('Existing permission status:', existing.status, 'canAskAgain:', existing.canAskAgain);

        let status = existing.status;
        if (status !== 'granted' && existing.canAskAgain) {
          debugLog('Requesting foreground permission...');
          const result = await Location.requestForegroundPermissionsAsync();
          status = result.status;
          debugLog('Permission result:', status);
        }

        if (!active) return;
        setPermissionStatus(status);

        if (status !== 'granted') {
          debugLog('Permission not granted, status:', status);
          setIsRequestingLocation(false);
          return;
        }

        debugLog('Getting current position...');
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        debugLog('Got position:', loc.coords.latitude, loc.coords.longitude);

        let readableAddress = '';
        try {
          const geocoded = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          debugLog('Expo reverse geocode result:', geocoded?.[0]);
          if (geocoded && geocoded.length > 0) {
            const first = geocoded[0];
            const city = first.city || first.subregion || first.district || '';
            const country = first.country || '';
            const street = first.street || '';
            const addressParts = [street, city, country].filter(Boolean);
            readableAddress = addressParts.join(', ');
          }
        } catch (e) {
          debugLog('Expo reverse geocode failed, trying Nominatim:', e);
        }

        if (!readableAddress) {
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${loc.coords.latitude}&lon=${loc.coords.longitude}`,
              { headers: { 'User-Agent': 'AgenticServiceOrchestrator/1.0' } }
            );
            const data = await response.json();
            if (data && data.address) {
              const city = data.address.city || data.address.town || data.address.village || data.address.suburb || '';
              const country = data.address.country || '';
              const road = data.address.road || '';
              const addressParts = [road, city, country].filter(Boolean);
              readableAddress = addressParts.join(', ');
              debugLog('Nominatim result:', readableAddress);
            }
          } catch (osmErr) {
            debugLog('Nominatim also failed:', osmErr);
          }
        }

        if (!readableAddress) {
          readableAddress = `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
        }

        debugLog('Final address:', readableAddress);
        if (active) setGpsAddress(readableAddress);
      } catch (err) {
        debugLog('Error in mobile location flow:', err);
        if (active) setPermissionStatus('denied');
      } finally {
        if (active) setIsRequestingLocation(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    requestLocation(active);
    return () => {
      active = false;
    };
  }, []);

  // Debounce search query input changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Fetch recommendations based on GPS address, query, or category
  useEffect(() => {
    if (!gpsAddress.trim()) return;

    const queryTerm = debouncedSearchQuery.trim() || activeFilter;
    const cacheKey = `${gpsAddress}_${queryTerm}`;

    if (cache[cacheKey]) {
      debugLog('Cache hit for key:', cacheKey);
      return;
    }

    let active = true;
    const fetchTechs = async () => {
      debugLog('Fetching recommendations for:', queryTerm, 'at:', gpsAddress);
      setLoading(true);
      setLoadingStatus('Generating AI recommendations...');
      setErrorMsg(null);
      try {
        const prompt = `Recommend 3 providers for: "${queryTerm}" in the location: "${gpsAddress}". This is for general discovery, so the time is any time.`;
        const res = await streamChatMessage(
          {
            session_id: `discovery-${gpsAddress.replace(/[^a-zA-Z0-9]/g, '-')}-${queryTerm.replace(/[^a-zA-Z0-9]/g, '-')}`,
            message: prompt,
          },
          (status) => { if (active) setLoadingStatus(status); }
        );
        debugLog('Chat API response:', JSON.stringify(res).slice(0, 200));

        if (!active) return;

        const providers: RecommendedTech[] = (res.recommended_providers || []).map((p: any) => ({
          name: p.name,
          address: p.address,
          phone_number: p.phone_number,
          rating: p.rating || 4.5,
          reviews_summary: p.reviews_summary || 'No reviews summary available.',
          reasoning: p.reasoning || `Highly rated provider recommended for ${queryTerm} in your area.`,
        }));

        // Do not use a fallback. Save empty array if none found.
        setCache(prev => ({ ...prev, [cacheKey]: providers }));
      } catch (err) {
        if (!active) return;
        debugLog('Discovery fetch failed:', err);
        setErrorMsg('Failed to load recommended providers. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTechs();
    return () => {
      active = false;
    };
  }, [gpsAddress, debouncedSearchQuery, activeFilter]);

  const handleCategoryPress = (category: string) => {
    setActiveFilter(category);
    setSearchQuery('');
  };

  const handleBookNow = (phoneNumber?: string) => {
    if (!phoneNumber) return;
    const url = `tel:${phoneNumber}`;
    Linking.openURL(url).catch(err => {
      console.warn('Failed to open dialer URL:', err);
    });
  };

  // Show loading while permission dialog is pending
  if (isRequestingLocation) {
    return (
      <View style={st.root}>
        <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
        <View style={st.loadingContainerFull}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[Typography.bodyMd, st.loadingTextFull]}>Requesting location access...</Text>
        </View>
      </View>
    );
  }

  // Deny service if location permission is not granted
  if (permissionStatus !== 'granted') {
    const handleEnableLocation = () => {
      if (Platform.OS !== 'web') {
        debugLog('Opening app settings for location permission');
        Linking.openSettings();
      } else {
        requestLocation(true);
      }
    };

    return (
      <View style={st.root}>
        <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
        <View style={st.deniedContainer}>
          <View style={st.deniedCard}>
            <View style={st.deniedIconBg}>
              <MaterialIcons name="location-off" size={48} color={colors.error} />
            </View>
            <Text style={[Typography.headlineMd, st.deniedTitle]}>Location Access Required</Text>
            <Text style={[Typography.bodyMd, st.deniedMessage]}>
              To search and book local services in real time, you must grant location permission. Please enable location access in your settings.
            </Text>
            <Pressable
              style={({ pressed }) => [st.retryBtn, pressed && { opacity: 0.8 }]}
              onPress={handleEnableLocation}
            >
              <Text style={[Typography.labelLg, { color: colors.white }]}>Open Settings</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Show a full screen loading spinner while the GPS location is resolving
  if (!gpsAddress) {
    return (
      <View style={st.root}>
        <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
        <View style={st.loadingContainerFull}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[Typography.bodyMd, st.loadingTextFull]}>Retrieving your location...</Text>
        </View>
      </View>
    );
  }

  const queryTerm = debouncedSearchQuery.trim() || activeFilter;
  const cacheKey = `${gpsAddress}_${queryTerm}`;
  const currentTechs = cache[cacheKey] || [];
  const heroTech = currentTechs[0];
  const standardTechs = currentTechs.slice(1);

  return (
    <View style={st.root}>
      <ServiceHeader onMenuPress={onMenuPress} isSidebarOpen={isSidebarOpen} />
      <ScrollView contentContainerStyle={[st.content, { paddingTop: insets.top + Layout.headerHeight + Spacing.base }]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={[Typography.headlineLgMobile, st.heading]}>Discover Technicians</Text>
        <Text style={[Typography.bodyMd, st.subhead]}>AI-matched professionals for your specific needs.</Text>

        {/* Search bar */}
        <View style={st.searchBar}>
          <MaterialIcons name="search" size={22} color={colors.outline} />
          <TextInput
            style={[Typography.bodyMd, st.searchInput]}
            placeholder="What do you need help with?"
            placeholderTextColor={colors.outline}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {loading && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>

        {/* GPS location badge */}
        <View style={st.locationRow}>
          <MaterialIcons
            name="gps-fixed"
            size={16}
            color={colors.primary}
          />
          <Text style={[Typography.labelMd, st.locationText]} numberOfLines={1}>
            Near: {gpsAddress}
          </Text>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll} contentContainerStyle={st.filterRow}>
          {FILTERS.map(f => (
            <Chip
              key={f}
              label={f}
              active={f === activeFilter && searchQuery === ''}
              onPress={() => handleCategoryPress(f)}
            />
          ))}
        </ScrollView>

        {loading && currentTechs.length === 0 ? (
          <View style={st.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[Typography.bodyMd, st.loadingText]}>{loadingStatus}</Text>
          </View>
        ) : errorMsg ? (
          <View style={st.errorContainer}>
            <MaterialIcons name="error-outline" size={36} color={colors.error} />
            <Text style={[Typography.bodyMd, st.errorText]}>{errorMsg}</Text>
          </View>
        ) : currentTechs.length === 0 ? (
          <View style={st.emptyContainer}>
            <MaterialIcons name="search-off" size={36} color={colors.outline} />
            <Text style={[Typography.bodyMd, st.emptyText]}>No providers found in this area for "{queryTerm}".</Text>
          </View>
        ) : (
          <>
            {/* Hero Card */}
            {heroTech && (
              <View style={st.heroCard}>
                <View style={st.heroBadge}>
                  <MaterialIcons name="auto-awesome" size={14} color={colors.auroraPurple} />
                  <Text style={[Typography.labelMd, { fontWeight: '700', color: colors.textPrimary }]}>Top Match</Text>
                </View>
                <View style={st.heroTop}>
                  <Image source={{ uri: TECH_AVATARS[0] }} style={st.heroImg} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.headlineMd, { color: colors.textPrimary }]}>{heroTech.name}</Text>
                    <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]} numberOfLines={2}>
                      {heroTech.address || 'Local Professional'}
                    </Text>
                  </View>
                </View>
                <View style={st.ratingRow}>
                  <MaterialIcons name="star" size={18} color={colors.auroraBlue} />
                  <Text style={[Typography.labelLg, { color: colors.textPrimary }]}>{heroTech.rating?.toFixed(1)}</Text>
                </View>
                <View style={st.reasonBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs }}>
                    <MaterialIcons name="psychology" size={16} color={colors.auroraPurple} />
                    <Text style={[Typography.labelMd, { fontWeight: '700', color: colors.textPrimary }]}>AI Reasoning</Text>
                  </View>
                  <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, fontSize: 13 }]}>{heroTech.reasoning}</Text>
                </View>
                <View style={st.heroBottom}>
                  <View style={st.badgesRow}>
                    <View style={st.badge}>
                      <Text style={[Typography.labelMd, { color: colors.onSurface, fontSize: 11 }]}>Verified</Text>
                    </View>
                    <View style={st.badge}>
                      <Text style={[Typography.labelMd, { color: colors.onSurface, fontSize: 11 }]}>Premium</Text>
                    </View>
                  </View>
                  <Pressable style={st.bookBtn} onPress={() => handleBookNow(heroTech.phone_number)}>
                    <Text style={[Typography.labelLg, { color: colors.white }]}>Book Now</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Standard Cards */}
            {standardTechs.map((t, idx) => (
              <View key={t.name} style={st.techCard}>
                <View style={st.techTop}>
                  <Image source={{ uri: TECH_AVATARS[(idx + 1) % TECH_AVATARS.length] }} style={st.techImg} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.labelLg, { color: colors.textPrimary }]}>{t.name}</Text>
                    <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, fontSize: 13 }]} numberOfLines={2}>
                      {t.address || 'Local Professional'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialIcons name="star" size={14} color={colors.auroraBlue} />
                      <Text style={[Typography.labelMd, { color: colors.textPrimary }]}>{t.rating?.toFixed(1)}</Text>
                    </View>
                  </View>
                </View>
                <View style={st.matchBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <MaterialIcons name="psychology" size={14} color={colors.auroraPurple} />
                    <Text style={[Typography.labelMd, { fontWeight: '600', color: colors.auroraPurple }]}>AI Reasoning</Text>
                  </View>
                  <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant, fontSize: 12 }]}>{t.reasoning}</Text>
                </View>
                <Pressable style={st.viewBtn} onPress={() => handleBookNow(t.phone_number)}>
                  <Text style={[Typography.labelLg, { color: colors.onSurface }]}>Book Now</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {/* Insights */}
        <View style={st.insightCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm }}>
            <View style={st.insightIcon}><MaterialIcons name="insights" size={24} color={colors.auroraBlue} /></View>
            <Text style={[Typography.headlineMd, { color: colors.textPrimary }]}>Market Insights</Text>
          </View>
          <Text style={[Typography.bodyMd, { color: colors.onSurfaceVariant }]}>
            Demand for {queryTerm.toLowerCase()} services in your area is currently optimal. Using our direct booking connects you instantly with the top matches.
          </Text>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function createStyles(colors: any) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceContainerLow },
  content: { paddingHorizontal: Spacing.marginMobile, paddingBottom: Spacing.xxl },
  heading: { color: colors.textPrimary, marginBottom: Spacing.xs },
  subhead: { color: colors.onSurfaceVariant, marginBottom: Spacing.base },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLowest, borderRadius: Radii.full, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, ...Shadows.card, borderWidth: 1, borderColor: colors.surfaceBorder + '33', marginBottom: Spacing.sm },
  searchInput: { flex: 1, marginLeft: Spacing.sm, color: colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  locationText: { marginLeft: Spacing.xs, color: colors.onSurfaceVariant },
  filterScroll: { marginBottom: Spacing.xl },
  filterRow: { gap: Spacing.sm },
  heroCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: Radii.xl, padding: Spacing.xl, ...Shadows.card, marginBottom: Spacing.xl, borderWidth: 2, borderColor: colors.auroraBlue + '30' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface + 'CC', paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radii.full, alignSelf: 'flex-end', marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.surfaceBorder + '33' },
  heroTop: { flexDirection: 'row', gap: Spacing.base, marginBottom: Spacing.md },
  heroImg: { width: 96, height: 96, borderRadius: Radii.lg },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.md },
  reasonBox: { backgroundColor: colors.surfaceBright, borderRadius: Radii.md, padding: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: colors.surfaceBorder + '1A' },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgesRow: { flexDirection: 'row', gap: Spacing.sm },
  badge: { backgroundColor: colors.surfaceContainerHigh, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radii.sm },
  bookBtn: { backgroundColor: colors.primaryContainer, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radii.full, ...Shadows.cardSm },
  techCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: Radii.lg, padding: Spacing.lg, ...Shadows.card, borderWidth: 1, borderColor: colors.surfaceContainer, marginBottom: Spacing.base },
  techTop: { flexDirection: 'row', gap: Spacing.base, marginBottom: Spacing.base },
  techImg: { width: 64, height: 64, borderRadius: 32 },
  matchBox: { backgroundColor: colors.surfaceBright, borderRadius: Radii.default, padding: Spacing.md, marginBottom: Spacing.base, borderWidth: 1, borderColor: colors.surfaceBorder + '1A' },
  viewBtn: { borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: Radii.full, paddingVertical: Spacing.sm, alignItems: 'center' },
  insightCard: { backgroundColor: colors.surfaceContainerLow, borderRadius: Radii.xl, padding: Spacing.xl, borderWidth: 1, borderColor: colors.surfaceBorder + '1A' },
  insightIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center', ...Shadows.cardSm },
  loadingContainer: { paddingVertical: Spacing.xxl, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: Spacing.md, color: colors.onSurfaceVariant },
  loadingContainerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainerLow },
  loadingTextFull: { marginTop: Spacing.md, color: colors.textPrimary, fontWeight: '600' },
  deniedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, backgroundColor: colors.surfaceContainerLow },
  deniedCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: Radii.xl, padding: Spacing.xl, alignItems: 'center', width: '100%', maxWidth: 400, ...Shadows.card, borderWidth: 1, borderColor: colors.surfaceBorder + '22' },
  deniedIconBg: { backgroundColor: colors.error + '10', padding: Spacing.lg, borderRadius: Radii.full, marginBottom: Spacing.md },
  deniedTitle: { color: colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center', fontWeight: 'bold' },
  deniedMessage: { color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 20 },
  retryBtn: { backgroundColor: colors.primary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl, borderRadius: Radii.full, width: '100%', alignItems: 'center', ...Shadows.cardSm },
  errorContainer: { paddingVertical: Spacing.xxl, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: colors.error, textAlign: 'center', paddingHorizontal: Spacing.xl },
  emptyContainer: { paddingVertical: Spacing.xxl, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { color: colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },
}); }
