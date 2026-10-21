import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchPortfolio, purchasePlan } from '../data/api';
import { investmentPlans, type InvestmentPlan } from '../data/plans';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import PrimaryButton from '../components/PrimaryButton';
import { getUserFriendlyError } from '../utils/networkErrors';

function parseDays(label: string) {
  if (!label) return 22;
  const normalized = label.toLowerCase();
  if (normalized.includes('month')) return 22;
  const match = label.match(/(\d+)\s*days?/i);
  return match ? Number(match[1]) : 22;
}

const tabs = [
  { id: 'equity', title: 'Equity', description: 'Invest in stocks and grow your portfolio.' },
  { id: 'commodities', title: 'Commodities', description: 'Trade precious metals and commodities.' },
  { id: 'fno', title: 'F&O', description: 'Weekly F&O strategies on Nifty 50, Bank Nifty and Gift Nifty.' },
];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user, updateUser, token } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('equity');
  const [purchasedPlans, setPurchasedPlans] = useState<InvestmentPlan[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);
  const purchasingPlanRef = useRef(false);

  const selected = tabs.find((tab) => tab.id === selectedTab) ?? tabs[0];
  const selectedPlans = investmentPlans.filter((plan) => plan.planType === selectedTab);

  const refreshPortfolio = useCallback(async () => {
    if (!user?.email) {
      setPurchasedPlans([]);
      return;
    }

    setPortfolioLoading(true);
    try {
      // Try to use initial login payload first for immediate display
      let result: any = null;
      try {
        const initial = await AsyncStorage.getItem('initialLoginData');
        if (initial) {
          const parsed = JSON.parse(initial);
          if (parsed?.portfolio) {
            result = parsed.portfolio;
            setPurchasedPlans(result.plans || []);
            setIsSyncing(true);

            // background refresh
            (async () => {
              try {
                const fresh = await fetchPortfolio();
                setPurchasedPlans(fresh.plans || []);
                try {
                  await AsyncStorage.setItem('cachedPortfolio', JSON.stringify(fresh));
                } catch (e) {}
              } catch (err) {
                // ignore
              } finally {
                setIsSyncing(false);
              }
            })();

            await AsyncStorage.removeItem('initialLoginData');
            setPortfolioLoading(false);
            return;
          }
        }
      } catch (e) {
        // ignore
      }

      if (!result) {
        result = await fetchPortfolio();
      }
      setPurchasedPlans(result.plans || []);
      // persist portfolio summary for instant display on next login
      try {
        await AsyncStorage.setItem('cachedPortfolio', JSON.stringify(result));
      } catch (e) {
        // ignore
      }
    } catch (e) {
      setPurchasedPlans([]);
    } finally {
      setPortfolioLoading(false);
    }
  }, [user?.email]);

  const { isRefreshing: isSyncingPortfolio, error: portfolioError, refresh: refreshPortfolioData } = useAutoRefresh(refreshPortfolio, [user?.email], 10000, Boolean(user));

  useFocusEffect(
    useCallback(() => {
      if (user?.email) {
        void refreshPortfolioData(true);
      }
    }, [user?.email, refreshPortfolioData]),
  );

  const { showSuccess, showError } = useToast();

  const handlePurchase = async (plan: InvestmentPlan) => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }

    Alert.alert(
      'Confirm purchase',
      `Purchase ${plan.planName} for ${plan.amountLabel}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
            onPress: async () => {
            if (purchasingPlanRef.current) return;

            if (user.balance < plan.amount) {
                          purchasingPlanRef.current = true;
                          setPurchasingPlanId(plan.id);
              showError('Your wallet balance is not enough for this plan.');
              return;
            }

              // Ensure client does not attempt unsupported plan amounts for this plan type
              const allowedAmountsForType = investmentPlans.filter((p) => p.planType === plan.planType).map((p) => p.amount);
              if (!allowedAmountsForType.includes(plan.amount)) {
                showError('This plan is not available. Please choose a supported amount.');
                return;
              }

            setPurchasingPlanId(plan.id);
            try {
              if (__DEV__) console.log('HomeScreen: purchasing plan', { planId: plan.id, amount: plan.amount, user: user?.email, token: Boolean(token) });
              const result = await purchasePlan({
                planId: plan.id,
                planName: plan.planName,
                planType: plan.planType,
                amount: plan.amount,
                amountLabel: plan.amountLabel,
                returnLabel: plan.returnLabel,
                returnPercent: plan.returnPercent,
                durationLabel: plan.durationLabel,
                totalReturn: plan.totalReturn,
                premium: plan.premium,
              });

              // Optimistic UI: apply returned balance and plans immediately
              if (result) {
                if (result.balance != null) {
                  await updateUser({ balance: result.balance });
                }
                if (result.plans) {
                  setPurchasedPlans(result.plans);
                } else {
                  const nextPlans = [...purchasedPlans, { ...plan, purchasedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + parseDays(plan.durationLabel) * 24 * 60 * 60 * 1000).toISOString() }];
                  setPurchasedPlans(nextPlans);
                }
              }

              // Trigger background refreshes (don't await)
              void refreshPortfolioData(false);

              showSuccess(`${plan.planName} purchased successfully.`);
            } catch (error: any) {
              // If backend returned retry info (attempted within 30 days), show friendly message
              const body = error?.body || (error?.response && error.response.body) || null;
              function formatSeconds(s: number) {
                if (!s || s <= 0) return 'less than a minute';
                const days = Math.floor(s / (24 * 3600));
                const hours = Math.floor((s % (24 * 3600)) / 3600);
                const minutes = Math.floor((s % 3600) / 60);
                const parts: string[] = [];
                if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
                if (hours) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
                if (!days && minutes) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
                return parts.length ? parts.join(' ') : 'less than a minute';
              }

              if (body) {
                if (body.code === 'FNO_ACTIVE') {
                  showError(body.error || 'You already have this F&O plan active.');
                } else if (body.code === 'FNO_COOLDOWN') {
                  const secs = Number(body.retryAfterSeconds || 0);
                  showError(body.error ? `${body.error}. Try again in ${formatSeconds(secs)}` : `You can purchase this plan again in ${formatSeconds(secs)}`);
                } else if (body.error) {
                  showError(body.error);
                } else {
                  showError(error.message || 'Unable to complete purchase.');
                }
              } else {
                showError(error.message || 'Unable to complete purchase.');
              }
            } finally {
              purchasingPlanRef.current = false;
              setPurchasingPlanId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isSyncingPortfolio} onRefresh={() => refreshPortfolioData(true)} colors={['#fbbf24']} tintColor="#fbbf24" />}
      >
        <Text style={styles.heading}>Investment Categories</Text>
      <View style={styles.tabRow}>
        {tabs.map((tab, index) => (
          <Pressable
            key={tab.id}
            style={[styles.tabButton, index === tabs.length - 1 ? null : styles.tabButtonMargin, selectedTab === tab.id && styles.tabButtonActive]}
            onPress={() => setSelectedTab(tab.id)}
          >
            <Text numberOfLines={1} style={[styles.tabText, selectedTab === tab.id && styles.tabTextActive]}>{tab.title}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{selected.title}</Text>
        <Text style={styles.infoDescription}>{selected.description}</Text>
        {portfolioError ? <Text style={styles.infoNote}>{getUserFriendlyError(portfolioError)}</Text> : null}
      </View>
      <View style={styles.planList}>
        {selectedPlans.map((plan) => (
          <View key={plan.id} style={[styles.planCard, plan.planType === 'commodities' && styles.commoditiesPlanCard]}>
            <View style={styles.planHeader}>
              <View style={styles.planIcon}>
                <Text style={styles.planIconText}>📈</Text>
              </View>
              <View style={styles.planTitleWrapper}>
                <Text style={styles.planName}>{plan.planName}</Text>
                <Text style={styles.planMeta}>{plan.amountLabel}</Text>
              </View>
              <View style={styles.planStatusBadge}>
                <Text style={styles.planStatusText}>ACTIVE</Text>
              </View>
            </View>

            <View style={styles.planHighlight}>
              <Text style={styles.planHighlightLabel}>ESTIMATED RETURN</Text>
              <Text style={styles.planHighlightValue}>{plan.returnLabel}</Text>
            </View>

            <View style={styles.planDetailsRow}>
              <View style={styles.planDetailBadge}>
                <Text style={styles.planDetailBadgeText}>{plan.planType === 'fno' ? `${plan.durationLabel} (5 trading days)` : plan.durationLabel}</Text>
              </View>
            </View>

            <View style={styles.planReturnCard}>
              <Text style={styles.planReturnTitle}>ESTIMATED TOTAL RETURN AFTER {plan.durationLabel.toUpperCase()}</Text>
              <Text style={styles.planReturnAmount}>₹{plan.totalReturn.toLocaleString()}</Text>
            </View>

            <PrimaryButton title={purchasingPlanId === plan.id ? 'Processing…' : 'Select Plan'} onPress={() => handlePurchase(plan)} disabled={Boolean(purchasingPlanId) && purchasingPlanId !== plan.id} loading={purchasingPlanId === plan.id} compact />
          </View>
        ))}
      </View>
    </ScrollView>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#0B132B',
    flexGrow: 1,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 30,
    marginBottom: 18,
  },
  syncingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 2,
    gap: 10,
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabButtonMargin: {
    marginRight: 10,
  },
  tabButtonActive: {
    backgroundColor: '#FFD166',
    borderColor: '#FFD166',
  },
  tabText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#121212',
  },
  infoCard: {
    backgroundColor: '#1C2541',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#223050',
    marginBottom: 14,
  },
  planList: {
    gap: 6,
  },
  planCard: {
    backgroundColor: '#1C2541',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#223050',
    marginBottom: 8,
  },
  commoditiesPlanCard: {
    minHeight: 150,
    paddingVertical: 12,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  planMeta: {
    color: '#ADB5BD',
    fontSize: 10,
    marginBottom: 0,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  infoDescription: {
    color: '#ADB5BD',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  infoNote: {
    color: '#ADB5BD',
    fontSize: 11,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  planIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  planIconText: {
    fontSize: 12,
  },
  planTitleWrapper: {
    flex: 1,
  },
  planStatusBadge: {
    backgroundColor: '#52B788',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  planStatusText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 9,
  },
  planHighlight: {
    backgroundColor: '#121E33',
    borderRadius: 12,
    padding: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#223050',
  },
  planHighlightLabel: {
    color: '#ADB5BD',
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  planHighlightValue: {
    color: '#2A9D8F',
    fontSize: 13,
    fontWeight: '800',
  },
  planDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  planDetailBlock: {
    backgroundColor: '#121E33',
    borderRadius: 10,
    padding: 6,
    flex: 1,
    marginRight: 6,
  },
  planDetailLabel: {
    color: '#ADB5BD',
    fontSize: 9,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  planDetailValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  planDetailBadge: {
    backgroundColor: '#121E33',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  planDetailBadgeText: {
    color: '#2A9D8F',
    fontSize: 11,
    fontWeight: '700',
  },
  planReturnCard: {
    backgroundColor: '#121E33',
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: '#223050',
    marginBottom: 4,
  },
  planReturnTitle: {
    color: '#ADB5BD',
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  planReturnAmount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  buyButton: {
    backgroundColor: '#F4D35E',
    borderRadius: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: '#475569',
  },
  buyText: {
    color: '#121212',
    fontWeight: '800',
    fontSize: 13,
  },
  buyTextDisabled: {
    color: '#94A3B8',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
});
