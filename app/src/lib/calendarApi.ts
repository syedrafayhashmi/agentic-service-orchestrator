import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function saveGoogleTokens(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
): Promise<void> {
  await supabase.from('user_google_tokens').upsert(
    {
      user_id: userId,
      access_token: accessToken,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

export async function createCalendarEvent(
  title: string,
  dateTime: string,
): Promise<{ id: string; htmlLink: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated. Please sign in.');
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const response = await fetch(`${API_BASE_URL}/api/calendar/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, date_time: dateTime, time_zone: timeZone }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? `Calendar API error: ${response.status}`);
  }

  return response.json();
}
