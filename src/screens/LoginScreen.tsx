import { useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { login, resendLoginOtp, verifyLoginOtp } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { signIn, setBankAccounts, setTransactions, setPortfolio } = useAuth();
  const { showSuccess, showError } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingLoginEmail, setPendingLoginEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendingOtp, setResendingOtp] = useState(false);
  const otpAttemptInFlight = useRef(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const data = await login(identifier, password);
      if (data.requiresOtp) {
        setPendingLoginEmail(data.email);
        setCode('');
        showSuccess('A 6-digit sign-in verification code was sent to your email.');
        return;
      }
      showError('The connected server did not start OTP verification. Please update the backend and try again.');
    } catch (error: any) {
      showError(error.message || 'Unable to login');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (data: any) => {
    try {
      const [cachedWallet, cachedBank, cachedPortfolio] = await Promise.all([
        AsyncStorage.getItem('cachedWallet'),
        AsyncStorage.getItem('cachedBankAccounts'),
        AsyncStorage.getItem('cachedPortfolio'),
      ]);
      const initialLoginData = {
        wallet: data.wallet || (cachedWallet ? JSON.parse(cachedWallet) : null),
        bankAccounts: data.bankAccounts || (cachedBank ? JSON.parse(cachedBank) : null),
        portfolio: data.portfolio || (cachedPortfolio ? JSON.parse(cachedPortfolio) : null),
        ts: Date.now(),
      };
      await AsyncStorage.setItem('initialLoginData', JSON.stringify(initialLoginData));
    } catch (error: any) {
      console.warn('Unable to save initial login data', error?.message || error);
    }

    await signIn(data.user, data.token);
    setTransactions(data.wallet?.transactions || []);
    setBankAccounts(data.bankAccounts || []);
    setPortfolio(data.portfolio || null);
    setPendingLoginEmail(null);
    setCode('');
  };

  const verifyLoginCode = async (otp: string) => {
    if (!pendingLoginEmail || otp.length !== 6 || otpAttemptInFlight.current) return;

    otpAttemptInFlight.current = true;
    setLoading(true);
    try {
      const data = await verifyLoginOtp(pendingLoginEmail, otp);
      await completeLogin(data);
    } catch (error: any) {
      showError(error.message || 'Unable to verify code');
      setCode('');
    } finally {
      otpAttemptInFlight.current = false;
      setLoading(false);
    }
  };

  const handleLoginOtpChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6) void verifyLoginCode(cleaned);
  };

  const handleResendLoginOtp = async () => {
    if (!pendingLoginEmail || resendingOtp || !identifier || !password) return;
    setResendingOtp(true);
    try {
      await resendLoginOtp(identifier, password);
      showSuccess('A new sign-in code was sent to your registered email.');
      setCode('');
    } catch (error: any) {
      showError(error.message || 'Unable to resend the sign-in code');
    } finally {
      setResendingOtp(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.description}>Sign in to continue managing your wallet and investments.</Text>

          <SectionCard title="Sign in">
            {!pendingLoginEmail ? (
              <>
                <TextInput
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="Email or phone"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <View style={styles.passwordField}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!isPasswordVisible}
                    style={styles.passwordInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                    onPress={() => setIsPasswordVisible((visible) => !visible)}
                    style={styles.passwordToggle}
                  >
                    <MaterialCommunityIcons name={isPasswordVisible ? 'eye-off' : 'eye'} size={22} color="#94a3b8" />
                  </Pressable>
                </View>
                <Text onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotLink}>Forgot password?</Text>
                <PrimaryButton title={loading ? 'Logging in…' : 'Login'} onPress={handleLogin} disabled={loading || !identifier || !password} loading={loading} compact />
              </>
            ) : (
              <>
                <Text style={styles.verificationHint}>Enter the 6-digit sign-in code sent to your registered email.</Text>
                <View style={styles.otpRow}>
                  <TextInput
                    value={code}
                    onChangeText={handleLoginOtpChange}
                    placeholder="6-digit OTP"
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, styles.otpInput]}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleResendLoginOtp}
                    disabled={resendingOtp || loading}
                    style={({ pressed }) => [styles.resendButton, (pressed || resendingOtp || loading) && styles.resendButtonDisabled]}
                  >
                    <Text style={styles.resendButtonText}>{resendingOtp ? 'Sending…' : 'Resend code'}</Text>
                  </Pressable>
                </View>
                {loading ? <Text style={styles.verificationHint}>Verifying code…</Text> : null}
                <Text onPress={() => setPendingLoginEmail(null)} style={styles.forgotLink}>Back to login</Text>
              </>
            )}
          </SectionCard>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>No account?</Text>
            <Text onPress={() => navigation.navigate('Signup')} style={styles.footerLink}>Sign up</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090b15',
  },
  screen: {
    flex: 1,
  },
  container: {
    padding: 24,
  },
  heading: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  description: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  passwordField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    color: '#f8fafc',
    padding: 16,
  },
  passwordToggle: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  forgotLink: {
    color: '#fbbf24',
    textAlign: 'right',
    marginBottom: 14,
    fontWeight: '700',
  },
  verificationHint: {
    color: '#f8fafc',
    marginBottom: 12,
    fontSize: 14,
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  otpInput: {
    flex: 1,
    marginBottom: 0,
  },
  resendButton: {
    marginLeft: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  resendButtonDisabled: {
    opacity: 0.55,
  },
  resendButtonText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  footerRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 12,
  },
  footerText: {
    color: '#94a3b8',
    marginRight: 8,
  },
  footerLink: {
    color: '#fbbf24',
    fontWeight: '700',
  },
});
