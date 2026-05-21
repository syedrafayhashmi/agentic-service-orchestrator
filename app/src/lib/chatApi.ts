import { Platform } from 'react-native';
import { supabase } from './supabase';

export type ClarifyingQuestion = {
  question: string;
  options?: string[] | null;
  type: string;
};

export type Provider = {
  name: string;
  address?: string;
  phone_number?: string;
  rating?: number;
  reviews_summary?: string;
};

export type BookingConfirmation = Record<string, unknown>;

export type ChatApiResponse = {
  intent_resolved: boolean;
  message?: string | null;
  clarifying_questions?: ClarifyingQuestion[] | null;
  recommended_providers?: Provider[] | null;
  booking_confirmation?: BookingConfirmation | null;
  fallback_used?: boolean;
  session_id?: string | null;
};

export type RetellCallResponse = {
  success: boolean;
  message: string;
  call_id?: string | null;
  call_status?: string | null;
  agent_id?: string | null;
  dynamic_variables_preview?: Record<string, string> | null;
};

export type SessionHistoryItem = {
  id: string;
  kind: 'chat' | 'retell-event';
  role: 'user' | 'assistant' | 'system';
  text: string;
  created_at?: string | null;
  cards?: Array<Record<string, unknown>> | null;
};

export type SessionHistoryResponse = {
  session_id: string;
  messages: SessionHistoryItem[];
};

export type ChatApiRequest = {
  session_id: string;
  message: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
};

function normalizeApiBase(url?: string): string {
  const fallback = 'http://localhost:8000';
  if (!url) return fallback;
  const trimmed = url.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

const API_BASE_URL = normalizeApiBase(
  process.env.EXPO_PUBLIC_BACKEND_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
);

export type StreamProgressCallback = (status: string) => void;

function parseSseLine(
  line: string,
  onProgress?: StreamProgressCallback
): ChatApiResponse | Error | null {
  if (!line.startsWith('data: ')) return null;
  try {
    const event = JSON.parse(line.slice(6));
    if (event.type === 'tool_start' && onProgress) {
      onProgress('Searching nearby providers...');
    } else if (event.type === 'sub_step') {
      if (event.step === 'search_start' && onProgress) onProgress(`Searching: ${event.query ?? ''}...`);
      if (event.step === 'reviews_start' && onProgress) onProgress('Reading reviews...');
    } else if (event.type === 'complete') {
      return event.data as ChatApiResponse;
    } else if (event.type === 'error') {
      return new Error(event.message ?? 'Stream error');
    }
  } catch {
    // skip malformed lines
  }
  return null;
}

function streamViaNativeXHR(
  url: string,
  payload: object,
  onProgress?: StreamProgressCallback
): Promise<ChatApiResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 120000;

    let consumed = 0;
    let buffer = '';
    let resolved = false;

    const processChunk = (text: string) => {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const result = parseSseLine(line, onProgress);
        if (result instanceof Error) { if (!resolved) { resolved = true; reject(result); } return; }
        if (result && !resolved) { resolved = true; resolve(result); }
      }
    };

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      processChunk(newText);
    };

    xhr.onload = () => {
      // flush remaining buffer after connection closes
      const remaining = xhr.responseText.slice(consumed);
      processChunk(remaining + '\n');
      if (!resolved) reject(new Error('Stream ended without a complete event'));
    };

    xhr.onerror = () => { if (!resolved) reject(new Error('Network error')); };
    xhr.ontimeout = () => { if (!resolved) reject(new Error('Request timed out')); };

    xhr.send(JSON.stringify(payload));
  });
}

export async function streamChatMessage(
  payload: ChatApiRequest,
  onProgress?: StreamProgressCallback
): Promise<ChatApiResponse> {
  const base = API_BASE_URL.replace(/\/$/, '');
  const url = `${base}/api/chat/stream`;

  if (Platform.OS !== 'web') {
    return streamViaNativeXHR(url, payload, onProgress);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Chat stream failed (${response.status})`;
    try { message = JSON.parse(text)?.detail ?? message; } catch { if (text) message = text; }
    throw new Error(message);
  }

  if (!response.body) throw new Error('No readable stream from server');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const result = parseSseLine(line, onProgress);
      if (result instanceof Error) throw result;
      if (result) return result;
    }
  }

  throw new Error('Stream ended without a complete event');
}

export async function sendChatMessage(payload: ChatApiRequest): Promise<ChatApiResponse> {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Chat request failed with status ${response.status}`);
  }

  return response.json();
}

export async function createRetellOutboundCall(payload: {
  session_id: string;
  to_number: string;
  user_id?: string;
  provider_name?: string;
  booking_message?: string;
  customer_name?: string;
  service_type?: string;
  location?: string;
  preferred_date?: string;
  preferred_time?: string;
  alternative_times?: string;
  booking_id?: string;
  dynamic_variables?: Record<string, unknown>;
}): Promise<RetellCallResponse> {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/calls/retell`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed?.detail === 'string') {
        message = parsed.detail;
      }
    } catch {
      // keep raw text
    }
    throw new Error(message || `Retell call request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchSessionHistory(sessionId: string): Promise<SessionHistoryResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/history/${sessionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `History request failed with status ${response.status}`);
  }

  return response.json();
}
