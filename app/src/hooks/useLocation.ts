import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

export function useLocation() {
  const [gpsAddress, setGpsAddress] = useState<string>('');

  useEffect(() => {
    let active = true;

    const resolve = async () => {
      try {
        if (Platform.OS === 'web') {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              if (!active) return;
              const { latitude: lat, longitude: lon } = pos.coords;
              try {
                const res = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
                  { headers: { 'User-Agent': 'AgenticServiceOrchestrator/1.0' } }
                );
                const data = await res.json();
                if (!active) return;
                if (data?.address) {
                  const city = data.address.city || data.address.town || data.address.village || '';
                  const country = data.address.country || '';
                  setGpsAddress([city, country].filter(Boolean).join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
                }
              } catch {
                if (active) setGpsAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
              }
            },
            () => {},
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        } else {
          const existing = await Location.getForegroundPermissionsAsync();
          let status = existing.status;
          if (status !== 'granted' && existing.canAskAgain) {
            const result = await Location.requestForegroundPermissionsAsync();
            status = result.status;
          }
          if (status !== 'granted' || !active) return;

          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!active) return;

          try {
            const geocoded = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
            if (geocoded?.[0] && active) {
              const { city, subregion, country } = geocoded[0];
              setGpsAddress([city || subregion, country].filter(Boolean).join(', '));
            }
          } catch {
            if (active) setGpsAddress(`${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
          }
        }
      } catch {
        // location is optional — fail silently
      }
    };

    resolve();
    return () => { active = false; };
  }, []);

  return gpsAddress;
}
