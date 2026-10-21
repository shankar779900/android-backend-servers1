import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';import { useToast } from '../contexts/ToastContext';import { fetchPortfolio, claimWeeklyEarnings } from '../data/api';
import { type InvestmentPlan } from '../data/plans';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { getUserFriendlyError } from '../utils/networkErrors';

function parseDays(label: string) {
  if (!label) return 22;
  const normalized = label.toLowerCase();
  if (normalized.includes('month')) return 22;
  const match = label.match(/(\d+)\s*days?/i);
  return match ? Number(match[1]) : 22;
}

function formatCurrency(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatPlanDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPlanProfit(plan: InvestmentPlan) {
  return Number(plan.creditedEarnings ?? plan.portfolioEarnings ?? 0);
}

export default function InvestmentScreen() {
  const navigation = useNavigation<any>();
  const { user, updateUser } = useAuth();
  const { portfolio: authPortfolio, setPortfolio: setAuthPortfolio } = useAuth();
  const { showSuccess, showError } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [purchasedPlans, setPurchasedPlans] = useState<InvestmentPlan[]>([]);
  const [isTradingDay, setIsTradingDay] = useState(false);
  const [weeklyData, setWeeklyData] = useState<{ totalUnclaimed: number; completedTradingDays: number; claimAllowed: boolean; alreadyClaimed: boolean; weekStart?: string; weekEnd?: string }>({ totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
  const [isClaimingWeekly, setIsClaimingWeekly] = useState(false);
  const claimingWeeklyRef = useRef(false);
  const [isPortfolioVisible, setIsPortfolioVisible] = useState(true);
  const [holdingTab, setHoldingTab] = useState<'active' | 'matured'>('active');

  const loadPortfolio = useCallback(async () => {
    if (!user?.email) {
      setPurchasedPlans([]);
      setWeeklyData({ totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
      return;
    }

    // If we already have a portfolio in AuthContext, use it immediately
    if (authPortfolio) {
      setPurchasedPlans(authPortfolio.plans || []);
      setWeeklyData(authPortfolio.weeklyData || { totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
      setIsTradingDay(Boolean(authPortfolio.isTradingDay));
      if (typeof authPortfolio.balance === 'number') {
        await updateUser({ balance: authPortfolio.balance });
      }
      // start a background refresh
      (async () => {
        try {
          const fresh = await fetchPortfolio();
          setPurchasedPlans(fresh.plans || []);
          setWeeklyData(fresh.weeklyData || { totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
          setIsTradingDay(Boolean(fresh.isTradingDay));
          if (typeof fresh.balance === 'number') await updateUser({ balance: fresh.balance });
          try { setAuthPortfolio(fresh); } catch (e) {}
        } catch (err) {
          // ignore
        }
      })();
      return;
    }

    // Try to use initial login payload for immediate display
    let result: any = null;
    try {
      const initial = await AsyncStorage.getItem('initialLoginData');
      if (initial) {
        const parsed = JSON.parse(initial);
        if (parsed?.portfolio) {
          result = parsed.portfolio;
          setPurchasedPlans(result.plans || []);
          setWeeklyData(result.weeklyData || { totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
          setIsTradingDay(Boolean(result.isTradingDay));
          if (typeof result.balance === 'number') {
            await updateUser({ balance: result.balance });
          }
          setIsSyncing(true);
          // background refresh
          (async () => {
            try {
              const fresh = await fetchPortfolio();
              setPurchasedPlans(fresh.plans || []);
              setWeeklyData(fresh.weeklyData || { totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
              setIsTradingDay(Boolean(fresh.isTradingDay));
              if (typeof fresh.balance === 'number') await updateUser({ balance: fresh.balance });
              try { await AsyncStorage.setItem('cachedPortfolio', JSON.stringify(fresh)); } catch (e) {}
            } catch (err) {
              // ignore
            } finally {
              setIsSyncing(false);
            }
          })();
          await AsyncStorage.removeItem('initialLoginData');
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    if (!result) {
      result = await fetchPortfolio();
    }
    // persist portfolio summary for instant display on next login
    try {
      await AsyncStorage.setItem('cachedPortfolio', JSON.stringify(result));
      try { setAuthPortfolio(result); } catch (e) {}
    } catch (e) {
      // ignore
    }
    if (__DEV__) {
      console.log('fetchPortfolio result:', result);
    }
    setPurchasedPlans(result.plans || []);
    setWeeklyData(result.weeklyData || { totalUnclaimed: 0, completedTradingDays: 0, claimAllowed: false, alreadyClaimed: false });
    setIsTradingDay(Boolean(result.isTradingDay));
    if (typeof result.balance === 'number') {
      await updateUser({ balance: result.balance });
    }
  }, [user?.email, updateUser]);

  const { isRefreshing, refresh, error: portfolioError } = useAutoRefresh(loadPortfolio, [user?.email], 10000, Boolean(user));

  useFocusEffect(
    useCallback(() => {
      if (user?.email) {
        void refresh(true);
      }
    }, [user?.email, refresh]),
  );

  if (!user) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Please log in to view your portfolio.</Text>
        <Text style={styles.emptyHint}>Your holdings, earnings, and plan performance will appear here.</Text>
      </View>
    );
  }

  const now = Date.now();
  const enrichedPlans = purchasedPlans.map((plan) => {
    const purchasedAtMs = plan.purchasedAt ? new Date(plan.purchasedAt).getTime() : now;
    const expiresAtMs = plan.expiresAt
      ? new Date(plan.expiresAt).getTime()
      : purchasedAtMs + parseDays(plan.durationLabel) * 24 * 60 * 60 * 1000;
    const status = String(plan.investmentStatus || '').toLowerCase();
    const isActive = status ? status === 'active' || status === 'reinvested' : expiresAtMs > now;
    return { ...plan, purchasedAtMs, expiresAtMs, isActive };
  });

  const activePlans = enrichedPlans.filter((plan) => plan.isActive);
  const maturedPlans = enrichedPlans.filter((plan) => !plan.isActive);
  const visiblePlans = holdingTab === 'active' ? activePlans : maturedPlans;
  const investedAmount = activePlans.reduce((sum, plan) => sum + plan.amount * (plan.quantity || 1), 0);
  const totalCreditedEarnings = activePlans.reduce((sum, plan) => sum + Number(plan.creditedEarnings ?? 0), 0);
  const totalUnclaimedEarnings = activePlans.reduce((sum, plan) => sum + Number(plan.portfolioEarnings ?? 0), 0);
  const portfolioEarnings = totalCreditedEarnings;
  const portfolioValue = investedAmount + portfolioEarnings;
  const todayGain = isTradingDay ? activePlans.reduce((sum, plan) => sum + Number(plan.todayGain || 0), 0) : 0;
  const overallGain = totalCreditedEarnings;
  const overallGainPercent = investedAmount > 0 ? (overallGain / investedAmount) * 100 : 0;
  const todayGainPercent = investedAmount > 0 ? (todayGain / investedAmount) * 100 : 0;
  const weeklyGain = Number(weeklyData.totalUnclaimed || 0);

  const showEarningsCard = activePlans.length > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Portfolio</Text>
      {isSyncing ? <Text style={styles.syncingText}>Syncing…</Text> : null}

      <View style={styles.portfolioSummaryCard}>
        <View style={styles.portfolioHeaderRow}>
          <View>
            <Text style={styles.portfolioLabel}>Portfolio value</Text>
            <Text style={styles.portfolioValue}>{isPortfolioVisible ? formatCurrency(portfolioValue) : '₹•••••••••'}</Text>
          </View>
          <Pressable onPress={() => setIsPortfolioVisible((visible) => !visible)} style={({ pressed }) => [styles.eyeButton, pressed && styles.eyeButtonPressed]}>
            <MaterialCommunityIcons name={isPortfolioVisible ? 'eye' : 'eye-off'} size={24} color="#cbd5e1" />
          </Pressable>
        </View>

        <View style={styles.portfolioGainRow}>
          <MaterialCommunityIcons name="trending-up" size={20} color="#10b981" style={styles.gainIcon} />
          <View>
            <Text style={styles.gainLabel}>Overall Gain</Text>
            <View style={styles.gainValueRow}>
              <Text style={styles.gainValue}>{isPortfolioVisible ? formatCurrency(overallGain) : '₹••••••'}</Text>
              <Text style={styles.gainPercent}>{isPortfolioVisible ? `(+${overallGainPercent.toFixed(2)}%)` : '(+••••%)'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.portfolioStatsRow}>
          <View style={styles.portfolioStatBlock}>
            <Text style={styles.portfolioStatLabel}>Invested Value</Text>
            <Text style={styles.portfolioStatValue}>{formatCurrency(investedAmount)}</Text>
          </View>
          <View style={styles.portfolioDivider} />
          <View style={styles.portfolioStatBlock}>
            <Text style={styles.portfolioStatLabel}>Today's Gain</Text>
            <View style={styles.todayGainRow}>
              <MaterialCommunityIcons name="trending-up" size={14} color="#10b981" />
              <Text style={styles.todayGainValue}>{formatCurrency(todayGain)}</Text>
              <Text style={styles.todayGainPercent}>(+{todayGainPercent.toFixed(2)}%)</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.weeklyCard}>
        <View style={styles.weeklyHeader}>
          <Text style={styles.weeklyTitle}>This week earnings</Text>
          <Text style={styles.weeklyMeta}>{weeklyData.completedTradingDays} trading days completed</Text>
        </View>
        <Text style={styles.weeklyAmount}>{formatCurrency(weeklyGain)}</Text>
        <Text style={styles.weeklyDescription}>
          {weeklyData.claimAllowed
            ? 'Ready to claim your completed weekly earnings.'
            : weeklyData.alreadyClaimed
            ? 'This week’s earnings have already been claimed.'
            : 'Claim after 5 complete trading days.'}
        </Text>
        <View style={styles.weeklyActionsRow}>
          <Text style={styles.weeklyPeriod}>{weeklyData.weekStart ? `${new Date(weeklyData.weekStart).toLocaleDateString()} - ${new Date(weeklyData.weekEnd || '').toLocaleDateString()}` : ''}</Text>
          <Text
            style={[styles.claimButton, (!weeklyData.claimAllowed || isClaimingWeekly) && styles.claimButtonDisabled]}
            onPress={async () => {
              if (claimingWeeklyRef.current) return;

              if (!weeklyData.claimAllowed) {
                showError(weeklyData.alreadyClaimed ? 'You have already claimed this week earnings.' : 'Wait until 5 complete trading days to claim this week earnings.');
                return;
              }

              claimingWeeklyRef.current = true;
              setIsClaimingWeekly(true);
              try {
                const result = await claimWeeklyEarnings();
                showSuccess(`₹${result.claimedAmount.toFixed(2)} credited to wallet.`);
                setWeeklyData({ ...weeklyData, claimAllowed: false, alreadyClaimed: true, totalUnclaimed: 0 });
                if (result.balance != null) {
                  await updateUser({ balance: result.balance });
                }
              } catch (error: any) {
                const friendly = getUserFriendlyError(error?.message || 'Unable to claim weekly earnings.');
                if (friendly) {
                  showError(friendly);
                }
              } finally {
                claimingWeeklyRef.current = false;
                setIsClaimingWeekly(false);
              }
            }}
          >
            {isClaimingWeekly ? 'Claiming...' : 'Claim'}
          </Text>
        </View>
      {portfolioError ? (
        (() => {
          const friendly = getUserFriendlyError(portfolioError);
          return friendly ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{friendly}</Text>
            </View>
          ) : null;
        })()
      ) : null}
      </View>

      <Text style={styles.sectionHeading}>Holdings</Text>
      <View style={styles.holdingsTabs}>
        <Pressable
          onPress={() => setHoldingTab('active')}
          style={[styles.holdingsTab, holdingTab === 'active' && styles.holdingsTabActive]}
        >
          <Text style={[styles.holdingsTabText, holdingTab === 'active' && styles.holdingsTabTextActive]}>Active Holdings</Text>
        </Pressable>
        <Pressable
          onPress={() => setHoldingTab('matured')}
          style={[styles.holdingsTab, holdingTab === 'matured' && styles.holdingsTabActive]}
        >
          <Text style={[styles.holdingsTabText, holdingTab === 'matured' && styles.holdingsTabTextActive]}>Matured Holdings</Text>
        </Pressable>
      </View>

      {visiblePlans.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{holdingTab === 'active' ? 'You have no active holdings.' : 'You have no matured holdings yet.'}</Text>
          <Text style={styles.emptyHint}>{holdingTab === 'active' ? 'Active plans will appear here while they are earning.' : 'Completed plans will appear here after they mature.'}</Text>
        </View>
      ) : (
        visiblePlans.map((plan) => {
          const baseEarnedAmount = plan.creditedEarnings || 0;
          const todayGainAmount = isTradingDay ? Number(plan.todayGain || 0) : 0;
          const earnedAmount = baseEarnedAmount;
          const earnedPercent = plan.amount ? (earnedAmount / plan.amount) * 100 : 0;
          const todayGainPercent = plan.amount ? (todayGainAmount / plan.amount) * 100 : 0;
          const profit = plan.totalReturn - plan.amount;
          const profitPercent = plan.amount ? ((plan.totalReturn / plan.amount - 1) * 100) : plan.returnPercent;

          return (
            <View
              key={plan.transactionId || `${plan.id}-${plan.purchasedAt}`}
              style={[styles.planListCard, plan.planType === 'commodities' && styles.commoditiesCard]}
            >
              <View style={styles.planListHeader}>
                <View style={styles.planListNameSection}>
                  <Text style={styles.planListName}>{plan.planName}</Text>
                  {plan.quantity && plan.quantity > 1 ? (
                    <Text style={styles.planListQuantity}>Qty: {plan.quantity}</Text>
                  ) : null}
                  {formatPlanDate(plan.purchasedAt) ? (
                    <View style={styles.planListDateRow}>
                      <MaterialCommunityIcons name="calendar-outline" size={13} color="#94a3b8" />
                      <Text style={styles.planListDateText}>Purchased {formatPlanDate(plan.purchasedAt)}</Text>
                    </View>
                  ) : null}
                  {!plan.isActive && formatPlanDate(plan.completedAt || plan.expiresAt) ? (
                    <View style={styles.planListDateRow}>
                      <MaterialCommunityIcons name="check-circle-outline" size={13} color="#fbbf24" />
                      <Text style={styles.planListMaturityDateText}>
                        {plan.completedAt ? 'Matured' : 'Plan expired'} on {formatPlanDate(plan.completedAt || plan.expiresAt)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.planListValueSection}>
                  <Text style={styles.planListCurrentValue}>{formatCurrency(plan.amount + (plan.creditedEarnings || 0))}</Text>
                  <Text style={styles.planListInvestedValue}>
                    ({formatCurrency(plan.amount)})
                  </Text>
                </View>
              </View>

              <View style={styles.planListGainRow}>
                <MaterialCommunityIcons name="trending-up" size={28} color="#10b981" style={styles.planListGainArrow} />
                <View style={styles.planListGainInfo}>
                  <Text style={styles.planListGainLabel}>Earned so far</Text>
                  <View style={styles.planListGainAmountRow}>
                    <Text style={styles.planListGainAmount}>{formatCurrency(earnedAmount)}</Text>
                    <Text style={styles.planListGainPercent}>(+{earnedPercent.toFixed(2)}%)</Text>
                  </View>
                </View>
              </View>

              <View style={styles.planListDailyGainRow}>
                <Text style={styles.planListDailyGainLabel}>Today’s gain</Text>
                <View style={styles.planListDailyGainAmountRow}>
                  <Text style={styles.planListDailyGainAmount}>{formatCurrency(todayGainAmount)}</Text>
                  <Text style={styles.planListDailyGainPercent}>(+{todayGainPercent.toFixed(2)}%)</Text>
                </View>
              </View>

              <View style={styles.planListProgressBar}>
                <View style={[styles.progressFill, { width: `${Math.min((earnedPercent / 100) * 100, 100)}%` }]} />
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#090b15',
  },
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  heading: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  subheading: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  syncRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  syncText: {
    color: '#93c5fd',
    fontSize: 12,
  },
  syncError: {
    color: '#fda4af',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  summaryPrimary: {
    backgroundColor: '#111827',
  },
  summarySecondary: {
    backgroundColor: '#0f172a',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  summaryMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  portfolioSummaryCard: {
    backgroundColor: '#0e264f',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3c72',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  syncingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  portfolioDivider: {
    width: 1,
    backgroundColor: '#223553',
    marginHorizontal: 18,
  },
  todayGainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  todayGainValue: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  todayGainPercent: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  weekendCard: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  weekendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  weekendIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekendBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  weekendBadgeText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  weekendContent: {
    flex: 1,
  },
  weekendTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  weekendValue: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  weekendMeta: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionHeading: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 24,
  },
  holdingsSummaryCard: {
    display: 'none',
  },
  holdingsSummaryTitle: {
    display: 'none',
  },
  holdingsStatsRow: {
    display: 'none',
  },
  holdingsStatBlock: {
    display: 'none',
  },
  holdingsStatLabel: {
    display: 'none',
  },
  holdingsStatValue: {
    display: 'none',
  },
  portfolioHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  portfolioLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  portfolioValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 0,
  },
  portfolioGainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#223553',
  },
  eyeButton: {
    padding: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  eyeButtonPressed: {
    opacity: 0.7,
  },
  gainIcon: {
    marginRight: 10,
  },
  gainLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  gainValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  gainValue: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: '800',
  },
  gainPercent: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
  },
  portfolioStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  portfolioStatBlock: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 5,
  },
  portfolioStatLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  portfolioStatValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  holdingsTabs: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  holdingsTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  holdingsTabActive: {
    backgroundColor: '#10B981',
  },
  holdingsTabText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  holdingsTabTextActive: {
    color: '#06281d',
  },
  planListCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  commoditiesCard: {
    minHeight: 140,
    paddingVertical: 18,
  },
  planListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planListNameSection: {
    flex: 1,
  },
  planListName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  planListDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  planListDateText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '500',
  },
  planListMaturityDateText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '600',
  },
  planListQuantity: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  planListValueSection: {
    alignItems: 'flex-end',
  },
  planListCurrentValue: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '800',
  },
  planListInvestedValue: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  planListGainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  planListGainArrow: {
    marginRight: 4,
  },
  planListGainInfo: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  planListGainLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  planListGainAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  planListGainAmount: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  planListGainPercent: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  planListDailyGainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0f172a',
  },
  planListDailyGainLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  planListDailyGainAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  planListDailyGainAmount: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700',
  },
  planListDailyGainPercent: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  planListProgressBar: {
    height: 5,
    backgroundColor: '#0f172a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
  emptyCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 12,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 10,
  },
  emptyHint: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: '#7f1d1d',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  errorText: {
    color: '#fee2e2',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyState: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  weeklyCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 24,
  },
  weeklyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weeklyTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  weeklyMeta: {
    color: '#94a3b8',
    fontSize: 11,
  },
  weeklyAmount: {
    color: '#10b981',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  weeklyDescription: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  weeklyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyPeriod: {
    color: '#94a3b8',
    fontSize: 12,
  },
  claimButton: {
    color: '#ffffff',
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    overflow: 'hidden',
    fontWeight: '700',
  },
  claimButtonDisabled: {
    backgroundColor: '#334155',
    color: '#94a3b8',
  },
});
