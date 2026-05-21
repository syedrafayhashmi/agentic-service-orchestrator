import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

// ─── Safe lazy import ────────────────────────────────────────────────────────
// expo-speech-recognition requires a custom dev-build on iOS/Android.
// In Expo Go the native module won't exist, so we catch that at module load
// time and fall back to no-ops.

let SpeechModule: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule | null = null;
let useSpeechEvent: typeof import('expo-speech-recognition').useSpeechRecognitionEvent | null = null;
let moduleAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-speech-recognition');
  SpeechModule = mod.ExpoSpeechRecognitionModule;
  useSpeechEvent = mod.useSpeechRecognitionEvent;
  if (SpeechModule && typeof SpeechModule.start === 'function') {
    moduleAvailable = true;
  }
} catch {
  moduleAvailable = false;
}

// No-op stub – always called to satisfy React's Rules of Hooks
function useNoopEvent(_name: string, _cb: (...args: any[]) => void) {}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Set to true when stop() is called deliberately so we can suppress
  // the spurious 'network' error Chrome fires after stopping a continuous session.
  const intendedStop = useRef(false);

  const bindStart  = moduleAvailable && useSpeechEvent ? useSpeechEvent : useNoopEvent;
  const bindEnd    = moduleAvailable && useSpeechEvent ? useSpeechEvent : useNoopEvent;
  const bindResult = moduleAvailable && useSpeechEvent ? useSpeechEvent : useNoopEvent;
  const bindError  = moduleAvailable && useSpeechEvent ? useSpeechEvent : useNoopEvent;

  bindStart('start', () => {
    setIsListening(true);
    setError(null);
  });

  bindEnd('end', () => {
    setIsListening(false);
    // Reset the flag after the session fully ends
    intendedStop.current = false;
  });

  bindResult('result', (event: any) => {
    if (event?.results?.length > 0) {
      const current = event.results[0].transcript;
      if (current) setTranscript(current);
    }
  });

  bindError('error', (event: any) => {
    const code: string = event?.error ?? '';

    // ── Intentional stop: Chrome fires 'network' when stopping a continuous
    //    session mid-stream. Suppress it entirely — the 'end' event still fires.
    if (intendedStop.current) {
      console.log('[useSpeechToText] suppressed error after intentional stop:', code);
      return;
    }

    // ── Network blip (not intentional): restart silently
    if (code === 'network') {
      console.warn('[useSpeechToText] network error – restarting session');
      setTimeout(() => {
        if (!intendedStop.current && SpeechModule) {
          SpeechModule.start({
            lang: 'en-US',
            interimResults: true,
            maxAlternatives: 1,
            ...(Platform.OS === 'web' ? { continuous: true } : {}),
          });
        }
      }, 300);
      return;
    }

    // ── Silence / cancelled: not real errors
    if (code === 'no-speech' || code === 'aborted') {
      setIsListening(false);
      return;
    }

    // ── All other errors: surface a friendly message
    const friendly =
      code === 'not-allowed'
        ? 'Microphone access was denied. Please allow microphone in your browser settings.'
        : code === 'audio-capture'
        ? 'Could not access the microphone.'
        : code === 'service-not-allowed'
        ? 'Speech recognition is not allowed in this browser/context.'
        : event?.message || `Speech error: ${code}`;

    console.error('[useSpeechToText] error:', code, event?.message);
    setError(friendly);
    setIsListening(false);
  });

  // ─── Start ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!moduleAvailable || !SpeechModule) {
      const msg =
        Platform.OS === 'web'
          ? 'Speech recognition is not supported in this browser.'
          : 'Speech recognition requires a custom development build. Expo Go is not supported.';
      setError(msg);
      console.warn('[useSpeechToText]', msg);
      return;
    }

    try {
      setTranscript('');
      setError(null);
      intendedStop.current = false;

      const perm = await SpeechModule.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Microphone permission denied');
        return;
      }

      SpeechModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        // continuous on web keeps the session alive between phrases and avoids
        // network errors from repeated start/stop cycles
        ...(Platform.OS === 'web' ? { continuous: true } : {}),
      });
    } catch (err: any) {
      console.error('[useSpeechToText] Failed to start:', err);
      setError(err.message || 'Failed to start speech recognition');
      setIsListening(false);
    }
  }, []);

  // ─── Stop ──────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (!moduleAvailable || !SpeechModule) return;
    intendedStop.current = true;
    SpeechModule.stop();
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    isAvailable: moduleAvailable,
  };
}
