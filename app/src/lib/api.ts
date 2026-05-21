import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

/**
 * Send a chat message to the backend with JWT authentication.
 * Automatically includes the current user's JWT token in the Authorization header.
 */
export async function sendChatMessage(
  message: string,
  sessionId: string
): Promise<{
  intent_resolved: boolean;
  clarifying_questions?: string[];
  message: string;
  recommended_providers?: any[];
  booking_confirmation?: any;
  fallback_used?: boolean;
}> {
  try {
    // Get the current session (includes JWT token)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.access_token) {
      throw new Error('No authentication token. User may not be logged in.');
    }

    // Send request with JWT token in Authorization header
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message,
        session_id: sessionId,
      }),
    });

    // Handle errors
    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail?.message || errorData.detail || errorDetail;
      } catch {
        // If response body isn't JSON, use status text
        errorDetail = response.statusText;
      }

      // Map specific error codes to user-friendly messages
      if (response.status === 403) {
        throw new Error('Your profile is incomplete. Please complete onboarding.');
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (response.status === 429) {
        throw new Error('Too many requests. Please try again in a moment.');
      } else {
        throw new Error(`Chat error: ${errorDetail}`);
      }
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to send message: Unknown error');
  }
}

/**
 * Get the current user's JWT token.
 * Useful for debugging or manual API calls.
 */
export async function getJWTToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Verify that the user has a complete profile.
 * Sends a test request to check profile validation.
 */
export async function verifyProfileCompletion(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getJWTToken()}`,
      },
      body: JSON.stringify({
        message: 'test',
        session_id: 'verify-profile',
      }),
    });

    // 403 means profile is incomplete
    if (response.status === 403) {
      return false;
    }

    // 200 or any other success means profile is complete
    return response.ok;
  } catch (error) {
    console.error('Profile verification error:', error);
    return false;
  }
}
