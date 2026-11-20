import { SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';
import { useAuth } from '../contexts/AuthContext';
import { generateReferralCode } from '../data/api';

export default function ReferralScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { referralBonusEarned, referralCount, referralCode: paramReferralCode } = route.params || {};
  const { user } = useAuth();
  const initialCode = paramReferralCode ?? user?.referralCode ?? null;
  const [referralCode, setReferralCode] = useState<string | null>(initialCode);
  const referralLink = referralCode
    ? `https://smartgrowup.com/download/${encodeURIComponent(referralCode)}`
    : '';

  const shareReferralLink = async () => {
    if (!referralCode) return;

    try {
      await Share.share({
        title: 'Join GrowUp Investments',
        message: `Join me on GrowUp Investments. Download the app and use my referral code ${referralCode}: ${referralLink}`,
        url: referralLink,
      });
    } catch {
      // Share sheet dismissal does not need an error message.
    }
  };

  useEffect(() => {
    let mounted = true;

    const currentCode = paramReferralCode ?? user?.referralCode ?? null;

    // If we already have a code from params or user, ensure local state reflects it and don't generate.
    if (currentCode) {
      if (currentCode !== referralCode) {
        setReferralCode(String(currentCode));
      }
      return () => {};
    }

    // Only attempt generation if there's a logged-in user and we don't have a code yet
    const init = async () => {
      if (!user) return;
      try {
        const resp: any = await generateReferralCode();
        if (mounted && resp?.referralCode && resp.referralCode !== referralCode) {
          setReferralCode(String(resp.referralCode));
        }
      } catch (err) {
        // ignore — UI shows fallback below
      }
    };

    void init();
    return () => {
      mounted = false;
    };
  }, [user, paramReferralCode, referralCode]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Referral details</Text>
        <SectionCard title="Your referral info">
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Your referral code</Text>
            <Text style={styles.detailValue}>{referralCode || 'Not generated yet'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Referral bonus earned</Text>
            <Text style={styles.detailValue}>₹{(referralBonusEarned || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Successful referrals</Text>
            <Text style={styles.detailValue}>{referralCount ?? 0}</Text>
          </View>
          <View style={styles.noteRow}>
            <Text style={styles.noteText}>
              Share your referral code with a friend. A referral reward is paid once, after their first successful investment. The reward amount depends on that first investment.
            </Text>
          </View>
          <View style={styles.shareButton}>
            <PrimaryButton
              title="Share referral link"
              onPress={shareReferralLink}
              disabled={!referralCode}
              compact
            />
          </View>
        </SectionCard>
        <SectionCard title="Referral rules" style={styles.rulesCard}>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>Your friend must sign up using your referral code to qualify for the referral reward.</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>Only your friend's first successful investment qualifies for a referral reward.</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>The total referral scratch-card reward depends on your friend's first successful investment:</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>Under ₹5,000: ₹100</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>₹5,000–₹20,000: ₹300</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>₹20,001–₹50,000: ₹500</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>₹50,001–₹1,00,000: ₹800</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>Over ₹1,00,000: ₹1,000</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>The scratch card appears after that investment; scratch it to add the reward to your wallet. Later investments do not earn another referral reward.</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>•</Text>
            <Text style={styles.ruleText}>Any ₹100 referral signup bonus already paid counts toward the tier total.</Text>
          </View>
        </SectionCard>
        <View style={styles.bottomButtonRow}>
          <PrimaryButton title="Back" onPress={() => navigation.goBack()} compact />
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
  heading: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 16,
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
  noteRow: {
    marginTop: 8,
  },
  shareButton: {
    marginTop: 18,
  },
  noteText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  rulesCard: {
    paddingVertical: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  ruleBullet: {
    color: '#fbbf24',
    fontSize: 14,
    lineHeight: 18,
  },
  ruleText: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  bottomButtonRow: {
    alignItems: 'center',
    marginTop: 24,
  },
});
