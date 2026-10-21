import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { disableTwoFactor, fetchUserProfile } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import AuthenticatorLogo from '../components/AuthenticatorLogo';
import SectionCard from '../components/SectionCard';
import SyncBanner from '../components/SyncBanner';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referralBonusEarned, setReferralBonusEarned] = useState(0);
  const [referralCount, setReferralCount] = useState(0);
  const [showReferralDetails, setShowReferralDetails] = useState(false);
  const [showSupportDetails, setShowSupportDetails] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading2fa, setLoading2fa] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.email !== email) setEmail(user.email);
      const phone = user.phoneNumber || 'Not provided';
      if (phone !== phoneNumber) setPhoneNumber(phone);
      const tf = Boolean(user.twoFactorEnabled);
      if (tf !== twoFactorEnabled) setTwoFactorEnabled(tf);
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profileResult = await fetchUserProfile();
    const nextEmail = profileResult.user?.email ?? user?.email ?? '';
    if (nextEmail !== email) setEmail(nextEmail);
    const nextPhone = (profileResult.user?.phoneNumber ?? user?.phoneNumber) || 'Not provided';
    if (nextPhone !== phoneNumber) setPhoneNumber(nextPhone);
    const nextBonus = profileResult.user?.referralBonusEarned || 0;
    if (nextBonus !== referralBonusEarned) setReferralBonusEarned(nextBonus);
    const nextCount = profileResult.user?.referralCount || 0;
    if (nextCount !== referralCount) setReferralCount(nextCount);
    const nextCode = profileResult.user?.referralCode ?? user?.referralCode ?? null;
    if (nextCode !== referralCode) setReferralCode(nextCode);
    const nextTwo = Boolean(profileResult.user?.twoFactorEnabled);
    if (nextTwo !== twoFactorEnabled) setTwoFactorEnabled(nextTwo);
  }, [user?.email, user?.phoneNumber, user?.twoFactorEnabled]);

  const { isRefreshing, refresh } = useAutoRefresh(refreshProfile, [user?.email], 10000, Boolean(user));

  const { showSuccess, showError } = useToast();

  const handleToggle2fa = async () => {
    if (twoFactorEnabled) {
      setLoading2fa(true);
      try {
        await disableTwoFactor();
        setTwoFactorEnabled(false);
        showSuccess('Two-step verification is now disabled.');
      } catch (error: any) {
        showError(error.message || 'Unable to disable 2FA');
      } finally {
        setLoading2fa(false);
      }
      return;
    }

    navigation.navigate('TwoFactorSetup', { mode: 'enable' });
  };

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user?.email]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void refresh(false);
    }, [refresh, user?.email]),
  );

  const loadProfile = async () => {
    setLoading(true);
    try {
      const profileResult = await fetchUserProfile();
      const nextEmail = profileResult.user?.email ?? user?.email ?? '';
      if (nextEmail !== email) setEmail(nextEmail);
      const nextPhone = (profileResult.user?.phoneNumber ?? user?.phoneNumber) || 'Not provided';
      if (nextPhone !== phoneNumber) setPhoneNumber(nextPhone);
      const nextBonus = profileResult.user?.referralBonusEarned || 0;
      if (nextBonus !== referralBonusEarned) setReferralBonusEarned(nextBonus);
      const nextCount = profileResult.user?.referralCount || 0;
      if (nextCount !== referralCount) setReferralCount(nextCount);
      const nextCode = profileResult.user?.referralCode ?? user?.referralCode ?? null;
      if (nextCode !== referralCode) setReferralCode(nextCode);
      const nextTwo = Boolean(profileResult.user?.twoFactorEnabled);
      if (nextTwo !== twoFactorEnabled) setTwoFactorEnabled(nextTwo);
    } catch (error: any) {
      showError(error.message || 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.emptyState}>
        <Text style={styles.emptyText}>You are not signed in.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => refresh(true)} colors={['#fbbf24']} tintColor="#fbbf24" />}
      >
        <Text style={styles.heading}>Your profile</Text>

        <SectionCard title="Account details" style={styles.compactCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Full name</Text>
            <Text style={styles.detailValue}>{user.username}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{email}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Phone number</Text>
            <Text style={styles.detailValue}>{phoneNumber}</Text>
          </View>
        </SectionCard>

        <SectionCard title="Referral" style={styles.compactSmallCard}>
          <View style={styles.compactDetailRow}>
            <Text style={styles.detailLabel}>Your referral code</Text>
            <Text style={styles.detailValue}>{referralCode}</Text>
          </View>
          <PrimaryButton
            title="Refer"
            onPress={() => navigation.navigate('Referral', {
              referralCode,
              referralBonusEarned,
              referralCount,
            })}
            compact
            style={styles.cardButton}
          />
        </SectionCard>

        <SectionCard title="Security" style={styles.compactSmallCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextWrap}>
              <Text style={styles.detailLabel}>Two-step verification</Text>
              <Text style={styles.settingDescription}>{twoFactorEnabled ? 'Enabled for this account' : 'Add an authenticator app for extra protection'}</Text>
            </View>
            <Pressable onPress={handleToggle2fa} disabled={loading2fa} style={({ pressed }) => [styles.authenticatorButton, pressed && styles.authenticatorButtonPressed, loading2fa && styles.authenticatorButtonDisabled]}>
              <AuthenticatorLogo size={48} enabled={twoFactorEnabled} />
              <Text style={styles.authenticatorButtonText}>{twoFactorEnabled ? 'Disable' : 'Enable'}</Text>
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Customer support" style={styles.compactCard}>
          <PrimaryButton title="Customer support" onPress={() => navigation.navigate('Support')} compact style={styles.cardButton} />
        </SectionCard>

        <View style={styles.buttonGroup}>
          <PrimaryButton title="Log out" onPress={signOut} compact />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b15',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  compactCard: {
    padding: 10,
  },
  compactSmallCard: {
    padding: 6,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingDescription: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  authenticatorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  authenticatorButtonPressed: {
    opacity: 0.7,
  },
  authenticatorButtonDisabled: {
    opacity: 0.5,
  },
  authenticatorButtonText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  compactDetailRow: {
    marginBottom: 6,
  },
  heading: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  subheading: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 8,
    lineHeight: 24,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  syncText: {
    color: '#93c5fd',
    fontSize: 12,
  },
  syncError: {
    color: '#fda4af',
  },
  detailRow: {
    marginBottom: 10,
  },
  detailLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  detailValue: {
    color: '#f8fafc',
    fontSize: 15,
    lineHeight: 20,
  },
  referralHintRow: {
    marginTop: 6,
  },
  referralDetailsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  referralHint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  supportIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  supportLabel: {
    color: '#f8fafc',
    fontSize: 16,
  },
  supportDetailsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  supportText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  balanceValue: {
    color: '#fbbf24',
    fontSize: 34,
    fontWeight: '800',
  },
  loader: {
    marginTop: 12,
  },
  cardButton: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 260,
    marginTop: 12,
  },
  buttonGroup: {
    marginTop: 14,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090b15',
    padding: 24,
  },
  emptyText: {
    color: '#f8fafc',
    fontSize: 18,
  },
});
