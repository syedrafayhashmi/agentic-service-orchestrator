import React, { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { StyleSheet, View, TextInput, Pressable, Text, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Spacing, Radii, Shadows } from '@/constants/theme';
import { useSpeechToText } from '@/hooks/useSpeechToText';

export interface AIPromptBarRef {
  /** Stop recording immediately (e.g. when navigating away) */
  stopRecording: () => void;
}

interface AIPromptBarProps {
  placeholder?: string;
  onSubmit?: (text: string) => void;
  disabled?: boolean;
  /** Show mic + add buttons (chat mode) */
  showExtras?: boolean;
}

export const AIPromptBar = forwardRef<AIPromptBarRef, AIPromptBarProps>(function AIPromptBar(
  {
    placeholder = 'Describe what you need...',
    onSubmit,
    disabled = false,
    showExtras = false,
  },
  ref,
) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');

  const {
    isListening,
    transcript,
    error: speechError,
    startListening,
    stopListening,
    isAvailable: speechAvailable,
  } = useSpeechToText();

  const previousText = useRef('');
  const wasListening = useRef(isListening);

  // Expose stopRecording to parent via ref
  useImperativeHandle(ref, () => ({
    stopRecording: () => {
      if (isListening) stopListening();
    },
  }));

  // Stop recording and clean up when the component unmounts (e.g. back navigation)
  useEffect(() => {
    return () => {
      if (isListening) stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live transcript → update input text while listening
  useEffect(() => {
    if (isListening && transcript) {
      const space = previousText.current && previousText.current.trim().length > 0 ? ' ' : '';
      setText(previousText.current + space + transcript);
    }
  }, [transcript, isListening]);

  // Auto-submit when listening stops and speech was captured
  useEffect(() => {
    if (!isListening && wasListening.current) {
      if (!disabled && text.trim() && onSubmit && transcript.trim()) {
        onSubmit(text.trim());
        setText('');
        previousText.current = '';
      }
    }
    wasListening.current = isListening;
  }, [isListening, text, disabled, onSubmit, transcript]);

  const handleMicPress = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      previousText.current = text;
      startListening();
    }
  }, [isListening, startListening, stopListening, text]);

  const handleSubmit = useCallback(() => {
    if (!disabled && text.trim() && onSubmit) {
      onSubmit(text.trim());
      setText('');
    }
  }, [disabled, text, onSubmit]);

  return (
    <View style={styles.wrapper}>
      {/* Aurora glow behind */}
      <View style={styles.glowLayer} />

      {/* Main input container */}
      <View style={styles.container}>
        {showExtras && (
          <Pressable style={styles.extraBtn}>
            <MaterialIcons name="add" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
        )}

        <TextInput
          style={[Typography.bodyLg, styles.input]}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceVariant + '99'}
          value={text}
          onChangeText={setText}
          editable={!disabled}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
        />

        <Pressable
          style={[
            styles.micBtn,
            isListening && styles.micBtnActive,
            !speechAvailable && styles.micBtnDisabled,
          ]}
          onPress={speechAvailable ? handleMicPress : undefined}
          accessibilityLabel={
            speechAvailable
              ? isListening
                ? 'Stop recording'
                : 'Start voice input'
              : 'Voice input not available'
          }
        >
          <MaterialIcons
            name={isListening ? 'mic' : 'mic-none'}
            size={22}
            color={
              isListening
                ? colors.error
                : speechAvailable
                ? colors.onSurface
                : colors.onSurfaceVariant + '66'
            }
          />
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
        >
          <MaterialIcons name="arrow-upward" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>

      {/* Error hint shown when mic is tapped in unsupported environment */}
      {speechError && !isListening && (
        <Text style={styles.speechErrorText}>{speechError}</Text>
      )}
    </View>
  );
});

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrapper: {
      position: 'relative',
      width: '100%',
      maxWidth: 800,
      alignSelf: 'center',
    },
    glowLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: Radii.full,
      backgroundColor: colors.auroraBlue,
      opacity: 0.08,
      transform: [{ scaleX: 1.02 }, { scaleY: 1.15 }],
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: Radii.full,
      paddingVertical: Spacing.sm,
      paddingLeft: Spacing.xl,
      paddingRight: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.surfaceContainerHigh,
      ...Shadows.card,
    },
    input: {
      flex: 1,
      color: colors.onSurface,
      paddingVertical: Spacing.sm,
      ...Platform.select({
        web: {
          outlineStyle: 'none',
        } as any,
      }),
    },
    extraBtn: {
      padding: Spacing.sm,
      marginRight: Spacing.xs,
      marginLeft: -Spacing.base,
    },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    micBtnActive: {
      borderColor: colors.error,
      backgroundColor: colors.error + '20',
    },
    micBtnDisabled: {
      opacity: 0.4,
    },
    sendBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.cardSm,
    },
    sendBtnDisabled: {
      opacity: 0.6,
    },
    speechErrorText: {
      marginTop: Spacing.xs,
      textAlign: 'center',
      fontSize: 11,
      color: colors.error,
      paddingHorizontal: Spacing.xl,
    },
  });
