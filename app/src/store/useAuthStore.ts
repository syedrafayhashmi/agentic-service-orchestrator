import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  phone_number?: string;
  address?: string;
  dob?: string;
  exact_location?: Record<string, any>;
}

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
}));
