import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Typography, Spacing, Radii, Shadows } from '@/constants/theme';

WebBrowser.maybeCompleteAuthSession();

interface LoginModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LoginModal({ visible, onClose }: LoginModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');

  const showUnderDevelopment = () => {
    alert('Under development feature');
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    try {
      // Create a deep link back to our app
      const redirectUrl = Linking.createURL('/');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
          ...(provider === 'google' && {
            scopes: 'https://www.googleapis.com/auth/calendar',
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          }),
        },
      });

      if (error) throw error;

      if (Platform.OS !== 'web' && data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        
        if (res.type === 'success' && res.url) {
          const parsedUrl = Linking.parse(res.url);
          
          // The tokens or code can be in query parameters or hash
          let access_token = parsedUrl.queryParams?.access_token as string | undefined;
          let refresh_token = parsedUrl.queryParams?.refresh_token as string | undefined;
          let code = parsedUrl.queryParams?.code as string | undefined;

          // If not in query params, check the URL hash
          if (!access_token && !code && res.url.includes('#')) {
            const hash = res.url.split('#')[1];
            // Simple parsing for hash since URLSearchParams might not be available in all RN envs
            const hashParams = hash.split('&').reduce((acc, curr) => {
              const [key, value] = curr.split('=');
              if (key && value) acc[key] = decodeURIComponent(value);
              return acc;
            }, {} as Record<string, string>);
            
            access_token = hashParams.access_token;
            refresh_token = hashParams.refresh_token;
          }

          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          } else if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }

          onClose();
        }
      } else if (Platform.OS === 'web') {
        // On web, the redirect happens automatically so we don't need to do anything else here
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  const modalContent = (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      
      <View style={styles.container}>
        {/* Close Button */}
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <MaterialIcons name="close" size={20} color={colors.onSurface} />
        </Pressable>

        {/* Header Content */}
        <Text style={[Typography.headlineMd, styles.title]}>Log in or sign up</Text>
        <Text style={[Typography.bodyLg, styles.subtitle]}>
          You will get smarter responses and can upload files, images, and more.
        </Text>

        {/* Social Buttons */}
        <Pressable style={styles.socialBtn} onPress={() => handleOAuthLogin('google')}>
          <FontAwesome5 name="google" size={16} color="#DB4437" style={styles.socialIcon} />
          <Text style={[Typography.labelLg, styles.socialText]}>Continue with Google</Text>
        </Pressable>

        <Pressable style={styles.socialBtn} onPress={showUnderDevelopment}>
          <FontAwesome5 name="apple" size={18} color="#000" style={styles.socialIcon} />
          <Text style={[Typography.labelLg, styles.socialText]}>Continue with Apple</Text>
        </Pressable>

        <Pressable style={styles.socialBtn} onPress={showUnderDevelopment}>
          <MaterialIcons name="phone" size={18} color="#000" style={styles.socialIcon} />
          <Text style={[Typography.labelLg, styles.socialText]}>Continue with phone</Text>
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={[Typography.labelMd, styles.dividerText]}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email Input */}
        <TextInput
          style={styles.emailInput}
          placeholder="Email address"
          placeholderTextColor={colors.onSurfaceVariant}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Continue Button */}
        <Pressable style={styles.continueBtn} onPress={showUnderDevelopment}>
          <Text style={[Typography.labelLg, styles.continueBtnText]}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View 
        style={[StyleSheet.absoluteFill, { zIndex: 9999, position: 'fixed' as any }]} 
        pointerEvents="auto"
      >
        {modalContent}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {modalContent}
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: Radii.lg,
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
    position: 'relative',
    ...Shadows.floating,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.xs,
  },
  title: {
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: Spacing.sm,
    color: colors.onSurface,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    marginBottom: Spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
  },
  socialIcon: {
    marginRight: Spacing.md,
  },
  socialText: {
    color: colors.onSurface,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    color: colors.onSurfaceVariant,
  },
  emailInput: {
    ...Typography.bodyLg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
    color: colors.onSurface,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  continueBtn: {
    backgroundColor: '#000',
    paddingVertical: Spacing.md,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
