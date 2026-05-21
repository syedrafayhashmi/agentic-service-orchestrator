// URL polyfill not strictly needed on web where URL is globally available
if (typeof process !== 'undefined' && process.env.EXPO_OS !== 'web') {
  require('react-native-url-polyfill/auto');
}
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing required environment variable: EXPO_PUBLIC_SUPABASE_URL'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing required environment variable: EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

// Safe storage for SSR (Server-Side Rendering) on Web
const ExpoStorage = {
  getItem: (key: string) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Create a single supabase client for interacting with your database
