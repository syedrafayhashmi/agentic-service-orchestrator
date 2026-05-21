/**
 * Root Layout — font loading and providers.
 * Wraps the entire app with SafeAreaProvider and loads Hanken Grotesk.
 */
import React, { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { saveGoogleTokens } from '@/lib/calendarApi';
import { useAuthStore } from '@/store/useAuthStore';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from '@expo-google-fonts/hanken-grotesk';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';

import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

// Keep splash screen while loading fonts
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      useAuthStore.getState().setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useAuthStore.getState().setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        if (session.provider_token && session.user.app_metadata?.provider === 'google') {
          saveGoogleTokens(session.user.id, session.provider_token, session.provider_refresh_token ?? null);
        }
      } else {
        useAuthStore.getState().setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <RootAppContent onLayoutRootView={onLayoutRootView} />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function RootAppContent({ onLayoutRootView }: { onLayoutRootView: () => void }) {
  const { theme, colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]} onLayout={onLayoutRootView}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

async function fetchProfile(userId: string) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (data) useAuthStore.getState().setProfile(data);
}
