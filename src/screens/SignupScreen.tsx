import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useToast } from '../contexts/ToastContext';
import { register, sendSignupOtp, validateReferralCode, verifySignupOtp } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';

export default function SignupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { showSuccess, showError } = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referralCode, setReferralCode] = useState(String(route.params?.referralCode || ''));
  const [pendingReferralCode, setPendingReferralCode] = useState(String(route.params?.referralCode || ''));
  const [referrerName, setReferrerName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [generatedReferralCode, setGeneratedReferralCode] = useState('');
  const referralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('pendingReferralCode').then(async (storedCode) => {
      const code = String(route.params?.referralCode || storedCode || '').trim().toUpperCase();
      if (active && code) {
        setReferralCode(code);
        setPendingReferralCode(code);
        await AsyncStorage.removeItem('pendingReferralCode');
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [route.params?.referralCode]);

  useEffect(() => {
    if (referralTimer.current) clearTimeout(referralTimer.current);
    const code = pendingReferralCode.trim().toUpperCase();
    if (!code) {
      setReferrerName('');
      return;
    }
    referralTimer.current = setTimeout(() => {
      validateReferralCode(code).then((data: any) => setReferrerName(data.referrerName || '')).catch(() => setReferrerName(''));
    }, 400);
    return () => { if (referralTimer.current) clearTimeout(referralTimer.current); };
  }, [pendingReferralCode]);

  const handleSendOtp = async () => {
    if (!email.trim()) return showError('Please enter your email first.');
    setSendingOtp(true);
    try {
      await sendSignupOtp(email.trim());
      setOtpSent(true);
      setOtpVerified(false);
      showSuccess('A verification code was sent to your email.');
    } catch (error: any) {
      showError(error.message || 'Unable to send verification code.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (code.length !== 4 || verifyingOtp) return;
    setVerifyingOtp(true);
    try {
      await verifySignupOtp(email.trim(), code);
      setOtpVerified(true);
      showSuccess('Email verified.');
    } catch (error: any) {
      showError(error.message || 'Invalid or expired code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSignup = async () => {
    if (password !== confirmPassword) return showError('Passwords must match.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');
    if (!otpVerified) return showError('Verify your email before creating an account.');
    setRegistering(true);
    try {
      const result: any = await register(username.trim(), email.trim(), password, phoneNumber.trim(), referralCode.trim() || undefined);
      setGeneratedReferralCode(result.referralCode || '');
      setRegistrationComplete(true);
      showSuccess('Account created successfully.');
    } catch (error: any) {
      showError(error.message || 'Unable to create your account.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {registrationComplete ? (
            <View style={styles.successContainer}>
              <Text style={styles.successHeading}>Account created</Text>
              <Text style={styles.description}>Your account is ready. Sign in with your email and password.</Text>
              {generatedReferralCode ? <SectionCard title="Your referral code"><Text style={styles.referral}>{generatedReferralCode}</Text></SectionCard> : null}
              <PrimaryButton title="Continue to login" onPress={() => navigation.navigate('Login')} />
            </View>
          ) : (
            <>
              <Text style={styles.heading}>Create account</Text>
              <Text style={styles.description}>Open an account and get started.</Text>
              <SectionCard title="Register">
                <TextInput value={username} onChangeText={setUsername} placeholder="Full name" placeholderTextColor="#94a3b8" style={styles.input} autoCapitalize="words" />
                <TextInput value={email} onChangeText={(value) => { setEmail(value); setOtpSent(false); setOtpVerified(false); setOtp(''); }} placeholder="Email" keyboardType="email-address" placeholderTextColor="#94a3b8" style={styles.input} autoCapitalize="none" />
                <PrimaryButton title={sendingOtp ? 'Sending…' : otpSent ? 'Resend verification code' : 'Send verification code'} onPress={handleSendOtp} disabled={sendingOtp || !email.trim()} loading={sendingOtp} compact style={styles.actionButton} />
                {otpSent ? <>
                  <TextInput value={otp} onChangeText={(value) => { const cleaned = value.replace(/\D/g, '').slice(0, 4); setOtp(cleaned); if (cleaned.length === 4) void handleVerifyOtp(cleaned); }} placeholder="4-digit email code" keyboardType="number-pad" maxLength={4} placeholderTextColor="#94a3b8" style={styles.input} editable={!otpVerified} />
                  <Text style={otpVerified ? styles.verified : styles.hint}>{otpVerified ? 'Email verified' : verifyingOtp ? 'Verifying code…' : 'Enter the code sent to your email.'}</Text>
                </> : null}
                <TextInput value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Phone number (optional)" keyboardType="phone-pad" placeholderTextColor="#94a3b8" style={styles.input} />
                <TextInput value={referralCode} onChangeText={(value) => { const code = value.toUpperCase(); setReferralCode(code); setPendingReferralCode(code); }} placeholder="Referral code (optional)" placeholderTextColor="#94a3b8" autoCapitalize="characters" style={styles.input} />
                {referrerName ? <Text style={styles.hint}>Referred by {referrerName}</Text> : null}
                <TextInput value={password} onChangeText={setPassword} placeholder="Password (at least 6 characters)" placeholderTextColor="#94a3b8" secureTextEntry style={styles.input} />
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" placeholderTextColor="#94a3b8" secureTextEntry style={styles.input} />
                <PrimaryButton title={registering ? 'Creating account…' : 'Create account'} onPress={handleSignup} disabled={registering || !username.trim() || !email.trim() || !password || !confirmPassword || !otpVerified} loading={registering} />
              </SectionCard>
              <View style={styles.footerRow}>
                <Text style={styles.hint}>Already have an account? </Text>
                <Text onPress={() => navigation.navigate('Login')} style={styles.link}>Login</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#090b15' },
  screen: { flex: 1 },
  container: { padding: 24, flexGrow: 1 },
  heading: { color: '#ffffff', fontSize: 34, fontWeight: '800', marginBottom: 8 },
  description: { color: '#94a3b8', fontSize: 16, marginBottom: 24, lineHeight: 24 },
  input: { backgroundColor: '#0f172a', color: '#f8fafc', borderColor: '#1f2937', borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  actionButton: { marginBottom: 14 },
  hint: { color: '#94a3b8', fontSize: 13, marginBottom: 12 },
  verified: { color: '#86efac', fontSize: 13, marginBottom: 12 },
  footerRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  link: { color: '#fbbf24', fontWeight: '700' },
  successContainer: { flex: 1, justifyContent: 'center' },
  successHeading: { color: '#ffffff', fontSize: 28, fontWeight: '800', marginBottom: 12 },
  referral: { color: '#fbbf24', fontSize: 20, fontWeight: '700' },
});