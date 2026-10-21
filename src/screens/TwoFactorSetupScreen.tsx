import { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useToast } from '../contexts/ToastContext';
import { enableTwoFactor, setupTwoFactor } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import { getErrorMessage } from '../utils/networkErrors';

export default function TwoFactorSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const { showSuccess, showError } = useToast();

  const loadSetupSecret = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await setupTwoFactor();
      setSecret(result.secret);
      setOtpauthUrl(result.otpauthUrl || result.secret);
    } catch (error: any) {
      const message = getErrorMessage(error, 'Unable to start 2FA setup');
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadSetupSecret();
  }, [loadSetupSecret]);

  const handleConfirm = async () => {
    if (!code || code.length !== 6) {
      showError('Please enter the 6-digit code from your authenticator app.');
      return;
    }

    setLoading(true);
    try {
      await enableTwoFactor(code);
      setSetupComplete(true);
      showSuccess('Two-step verification is now enabled.');
    } catch (error: any) {
      showError(getErrorMessage(error, 'Unable to verify code'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    await Clipboard.setStringAsync(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Set up two-step verification</Text>
        <Text style={styles.description}>Scan this secret in Google Authenticator or another authenticator app to enable one-time codes for sign-in.</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!setupComplete ? (
          <View style={styles.card}>
            <Text style={styles.label}>Secret</Text>
            <View style={styles.qrWrap}>
              <QRCode value={otpauthUrl || secret || 'secret'} size={180} backgroundColor="#ffffff" color="#0f172a" />
            </View>
            <View style={styles.secretRow}>
              <Text style={styles.secret}>{secret || 'Loading secret…'}</Text>
              <Pressable onPress={handleCopySecret} style={styles.copyButton}>
                <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
              </Pressable>
            </View>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter 6-digit code"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              keyboardType="number-pad"
              maxLength={6}
            />
            <PrimaryButton title={loading ? 'Verifying…' : 'Confirm code'} onPress={handleConfirm} disabled={loading || code.length !== 6} />
            {error ? <PrimaryButton title="Retry" onPress={loadSetupSecret} disabled={loading} compact style={styles.retryButton} /> : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.successTitle}>2FA is enabled</Text>
            <Text style={styles.successText}>You will be asked for a code from your authenticator app every time you sign in.</Text>
            <PrimaryButton title="Back to profile" onPress={() => navigation.goBack()} compact />
          </View>
        )}

        <View style={styles.bottomButtonRow}>
          <PrimaryButton title="Back" onPress={() => navigation.goBack()} compact />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090b15',
  },
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  heading: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  description: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 18,
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  secret: {
    color: '#fbbf24',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  copyButton: {
    borderRadius: 999,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#020617',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: '#f8fafc',
    marginBottom: 12,
  },
  successTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  successText: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  retryButton: {
    marginTop: 10,
  },
  bottomButtonRow: {
    alignItems: 'center',
    marginTop: 24,
  },
});
