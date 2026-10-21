import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchUserProfile, login, verifyTwoFactor } from '../data/api';
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

  const handleLogin = async () => {
    setLoading(true);
    try {
      const data = await login(identifier, password);
      if (data.requires2fa) {
        setPendingLoginEmail(data.email);
        setCode('');
        return;
      }

      // prefer server payload but fall back to previously cached values if server omitted them
      try {
        const [cachedWallet, cachedBank, cachedPortfolio] = await Promise.all([
          AsyncStorage.getItem('cachedWallet'),
          AsyncStorage.getItem('cachedBankAccounts'),
          AsyncStorage.getItem('cachedPortfolio'),
        ]);

        const merged = {
          wallet: data.wallet || (cachedWallet ? JSON.parse(cachedWallet) : null),
          bankAccounts: data.bankAccounts || (cachedBank ? JSON.parse(cachedBank) : null),
          portfolio: data.portfolio || (cachedPortfolio ? JSON.parse(cachedPortfolio) : null),
          ts: Date.now(),
        };
        if (__DEV__) console.log('LoginScreen: initialLoginData to save', merged);
        await AsyncStorage.setItem('initialLoginData', JSON.stringify(merged));
      } catch (e) {
        console.warn('Unable to save initial login data', (e as any)?.message || e);
      }

      await signIn(data.user, data.token);
      const walletTransactions = data.wallet?.transactions || [];
      const bankAccounts = data.bankAccounts || [];
      const portfolio = data.portfolio || null;
      try { setTransactions(walletTransactions); } catch (e) {}
      try { setBankAccounts(bankAccounts); } catch (e) {}
      try { setPortfolio(portfolio); } catch (e) {}
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error: any) {
      showError(error.message || 'Unable to login');
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async () => {
    if (!pendingLoginEmail) return;

    setLoading(true);
    try {
      const data = await verifyTwoFactor(pendingLoginEmail, code);
      try {
        const payload = { wallet: data.wallet || null, bankAccounts: data.bankAccounts || null, portfolio: data.portfolio || null, ts: Date.now() };
        if (__DEV__) console.log('LoginScreen: 2FA initialLoginData to save', payload);
        await AsyncStorage.setItem('initialLoginData', JSON.stringify(payload));
      } catch (e) {
        console.warn('Unable to save initial login data', (e as any)?.message || e);
      }
      if (__DEV__) console.log('LoginScreen: calling signIn for', data.user?.email);
      await signIn(data.user, data.token);
      if (__DEV__) console.log('LoginScreen: signIn complete');
      try { setTransactions(data.wallet?.transactions || []); } catch (e) {}
      try { setBankAccounts(data.bankAccounts || []); } catch (e) {}
      try { setPortfolio(data.portfolio || null); } catch (e) {}
      setPendingLoginEmail(null);
      setCode('');
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error: any) {
      showError(error.message || 'Unable to verify code');
    } finally {
      setLoading(false);
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
                <Text style={styles.verificationHint}>Enter the 6-digit code from your authenticator app.</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <PrimaryButton title={loading ? 'Verifying…' : 'Verify code'} onPress={handleTwoFactorSubmit} disabled={loading || code.length !== 6} loading={loading} />
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
