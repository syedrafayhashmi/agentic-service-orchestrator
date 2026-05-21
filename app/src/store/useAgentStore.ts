import { create } from 'zustand';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export interface StreamEvent {
  type: 'token' | 'tool_start' | 'tool_end' | 'sub_step' | 'complete' | 'error';
  content?: string;
  tool?: string;
  input?: any;
  data?: any;
  message?: string;
  // sub_step specific
  step?: 'search_start' | 'search_done' | 'search_error' | 'reviews_start' | 'reviews_done' | 'reviews_error';
  query?: string;
  count?: number;
  places?: any[];
  place_id?: string;
  review_count?: number;
  error?: string;
}

interface AgentStore {
  isStreaming: boolean;
  events: StreamEvent[];
  finalResult: any | null;
  startStream: (message: string, sessionId: string, userLocation?: string, onNavigateToExecution?: () => void) => Promise<void>;
  clearStream: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  isStreaming: false,
  events: [],
  finalResult: null,

  clearStream: () => set({ isStreaming: false, events: [], finalResult: null }),

  startStream: async (message, sessionId, userLocation, onNavigateToExecution) => {
    set({ isStreaming: true, events: [], finalResult: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message, session_id: sessionId, metadata: userLocation ? { location: userLocation } : undefined }),
      });

      // If the backend returned a non-2xx response, parse it as JSON error
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Request failed (${response.status})`;
        try {
          const parsed = JSON.parse(errorText);
          errorMessage = parsed?.detail || parsed?.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        console.error('Stream response error:', errorMessage);
        set((state) => ({
          events: [...state.events, { type: 'error', message: errorMessage }],
          finalResult: { intent_resolved: false, message: errorMessage },
        }));
        return;
      }

      const processLine = (line: string): void => {
        if (!line.startsWith('data: ')) return;
        try {
          const data = JSON.parse(line.slice(6)) as StreamEvent;

          set((state) => ({ events: [...state.events, data] }));

          if (data.type === 'complete') {
            set({ finalResult: data.data });
          }

          if (data.type === 'error') {
            console.error('Stream event error:', data.message);
            set({ finalResult: { intent_resolved: false, message: data.message || 'An error occurred.' } });
          }
        } catch (e) {
          console.error('Failed to parse SSE line:', line, e);
        }
        return;
      };

      if (Platform.OS !== 'web') {
        // XHR fires onprogress incrementally on React Native — real SSE streaming
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API_BASE_URL}/api/chat/stream`, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          if (session?.access_token) xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
          xhr.timeout = 120000;

          let consumed = 0;
          let buffer = '';

          const processChunk = (text: string) => {
            buffer += text;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              processLine(line);
            }
          };

          xhr.onprogress = () => {
            const newText = xhr.responseText.slice(consumed);
            consumed = xhr.responseText.length;
            processChunk(newText);
          };

          xhr.onload = () => {
            processChunk(xhr.responseText.slice(consumed) + '\n');
            resolve();
          };

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.ontimeout = () => reject(new Error('Request timed out'));
          xhr.send(JSON.stringify({ message, session_id: sessionId, metadata: userLocation ? { location: userLocation } : undefined }));
        });
      } else {
        if (!response.body) throw new Error('No readable stream');
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let buffer = '';

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              processLine(line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      set((state) => ({
        events: [...state.events, { type: 'error', message: errorMessage }],
        finalResult: { intent_resolved: false, message: 'Connection error. Please try again.' },
      }));
    } finally {
      set({ isStreaming: false });
    }
  },
}));
