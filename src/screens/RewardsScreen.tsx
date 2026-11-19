import { useCallback, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchScratchCards, scratchScratchCard } from '../data/api';
import Svg, { Defs, Mask, Rect, Image as SvgImage, Path } from 'react-native-svg';

type ScratchCard = {
  id: string;
  investmentAmount: number;
  investmentName: string;
  createdAt: string;
  scratchedAt: string | null;
  rewardAmount: number | null;
};

function formatCurrency(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

const ALL_IN_ONE_REVEAL_CARD = require('../../assets/assets/assets/assets/all-in-one-revealcard.jpg');

const SCRATCH_ASSETS = {
  below5000: {
    cover: require('../../assets/assets/assets/assets/scratch-cover-below-5000.jpg'),
    minReward: 1,
    maxReward: 50,
  },
  below20000: {
    cover: require('../../assets/assets/assets/assets/scratch-cover-below-20000.jpg'),
    minReward: 51,
    maxReward: 100,
  },
  below50000: {
    cover: require('../../assets/assets/assets/assets/scratch-cover-below-50000.jpg'),
    minReward: 101,
    maxReward: 200,
  },
  below100000: {
    cover: require('../../assets/assets/assets/assets/scratch-cover-below-100000.jpg'),
    minReward: 201,
    maxReward: 350,
  },
  above100000: {
    cover: require('../../assets/assets/assets/assets/scratch-cover-above-100000.jpg'),
    minReward: 351,
    maxReward: 500,
  },
  referral: {
    cover: require('../../assets/assets/assets/assets/scratch-cover-refer.jpg'),
  },
} as const;

function isReferralScratchCard(card: ScratchCard) {
  return String(card.investmentName || '').toLowerCase().includes('referral');
}

function getScratchTier(card: ScratchCard) {
  if (isReferralScratchCard(card)) return null;
  const amount = Number(card.investmentAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 5000) return SCRATCH_ASSETS.below5000;
  if (amount <= 20000) return SCRATCH_ASSETS.below20000;
  if (amount < 50000) return SCRATCH_ASSETS.below50000;
  if (amount <= 100000) return SCRATCH_ASSETS.below100000;
  return SCRATCH_ASSETS.above100000;
}

function getScratchAssets(card: ScratchCard) {
  if (isReferralScratchCard(card)) return SCRATCH_ASSETS.referral;
  return getScratchTier(card) || SCRATCH_ASSETS.below5000;
}

function ScratchCardTile({ card, onScratch, isActive = false, onOpen }: { card: ScratchCard; onScratch: (id: string) => Promise<boolean>; isActive?: boolean; onOpen?: (card: ScratchCard) => void }) {
  const [scratchPath, setScratchPath] = useState('');
  const [scratchDistance, setScratchDistance] = useState(0);
  const [scratchSize, setScratchSize] = useState({ width: 1, height: 1 });
  const widthRef = useRef(1);
  const heightRef = useRef(1);
  const scratchAreaRef = useRef<View | null>(null);
  const areaOriginRef = useRef({ x: 0, y: 0 });
  const scratchPathRef = useRef('');
  const scratchDistanceRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const claimingRef = useRef(false);
  const onScratchRef = useRef(onScratch);
  onScratchRef.current = onScratch;

  const addScratchPoint = (x: number, y: number, start = false) => {
    const boundedX = Math.max(0, Math.min(widthRef.current, x));
    const boundedY = Math.max(0, Math.min(heightRef.current, y));
    scratchPathRef.current += `${start || !scratchPathRef.current ? 'M' : ' L'}${boundedX} ${boundedY}`;
    setScratchPath(scratchPathRef.current);

    if (lastPointRef.current && !start) {
      const deltaX = boundedX - lastPointRef.current.x;
      const deltaY = boundedY - lastPointRef.current.y;
      scratchDistanceRef.current += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    }
    lastPointRef.current = { x: boundedX, y: boundedY };
    setScratchDistance(scratchDistanceRef.current);

    if (scratchDistanceRef.current >= Math.min(widthRef.current, heightRef.current) * 0.75 && !claimingRef.current) {
      claimingRef.current = true;
      void onScratchRef.current(card.id).then((success) => {
        if (success) return;
        claimingRef.current = false;
        scratchPathRef.current = '';
        scratchDistanceRef.current = 0;
        lastPointRef.current = null;
        setScratchPath('');
        setScratchDistance(0);
      });
    }
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => isActive && !card.scratchedAt,
    onStartShouldSetPanResponderCapture: () => isActive && !card.scratchedAt,
    onMoveShouldSetPanResponder: (_event, gesture) => isActive && !card.scratchedAt && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => isActive && !card.scratchedAt && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (_event, gesture) => addScratchPoint(
      gesture.x0 - areaOriginRef.current.x,
      gesture.y0 - areaOriginRef.current.y,
      true,
    ),
    onPanResponderMove: (_event, gesture) => addScratchPoint(
      gesture.moveX - areaOriginRef.current.x,
      gesture.moveY - areaOriginRef.current.y,
    ),
    onPanResponderRelease: () => { lastPointRef.current = null; },
    onPanResponderTerminate: () => { lastPointRef.current = null; },
  })).current;

  const scratchProgress = Math.min(scratchDistance / (Math.min(scratchSize.width, scratchSize.height) * 0.75), 1);

  const tier = getScratchTier(card);
  const { cover } = getScratchAssets(card);

  return (
    <Pressable
      style={[styles.card, isActive && styles.activeCard]}
      onPress={() => { if (!isActive) onOpen?.(card); }}
      disabled={isActive}
      accessibilityRole="button"
      accessibilityLabel="Open scratch card"
    >
      <View
        ref={scratchAreaRef}
        style={[styles.scratchArea, isActive && styles.activeScratchArea]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          widthRef.current = width;
          heightRef.current = height;
          setScratchSize({ width, height });
          scratchAreaRef.current?.measureInWindow((x, y) => {
            areaOriginRef.current = { x, y };
          });
        }}
        {...panResponder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel="Scratch card"
        accessibilityHint="Swipe across the card to claim your reward"
      >
        <Image
          source={ALL_IN_ONE_REVEAL_CARD}
          style={styles.scratchReveal}
          resizeMode="contain"
        />
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${scratchSize.width} ${scratchSize.height}`}
          style={styles.scratchSvg}
        >
          <Defs>
            <Mask id={`scratch-mask-${card.id}`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
              <Rect width={scratchSize.width} height={scratchSize.height} fill="white" />
              <Path
                d={scratchPath}
                stroke="black"
                strokeWidth={Math.max(42, scratchSize.width * 0.14)}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Mask>
          </Defs>
          <SvgImage
            href={cover}
            x={0}
            y={0}
            width={scratchSize.width}
            height={scratchSize.height}
            preserveAspectRatio="none"
            mask={`url(#scratch-mask-${card.id})`}
          />
        </Svg>
      </View>
      <View style={styles.scratchTierInfo}>
        {tier ? (
          <>
            <Text style={styles.scratchTierInvestment}>Investment: {formatCurrency(card.investmentAmount)}</Text>
            <Text style={styles.scratchTierReward}>
              Possible reward: {formatCurrency(tier.minReward)}–{formatCurrency(tier.maxReward)}
            </Text>
          </>
        ) : isReferralScratchCard(card) ? (
          <Text style={styles.scratchTierReward}>Referral bonus</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function RewardsScreen() {
  const navigation = useNavigation<any>();
  const { user, updateUser } = useAuth();
  const { showError } = useToast();
  const [cards, setCards] = useState<ScratchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [scratchingId, setScratchingId] = useState<string | null>(null);
  const [claimedCard, setClaimedCard] = useState<ScratchCard | null>(null);
  const [activeScratchCard, setActiveScratchCard] = useState<ScratchCard | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const totalEarnedRef = useRef(0);
  const totalRewardsCacheKey = `scratchTotalEarned:${user?.email || ''}`;
  const updateUserRef = useRef(updateUser);
  const showErrorRef = useRef(showError);
  const loadingCardsRef = useRef(false);
  updateUserRef.current = updateUser;
  showErrorRef.current = showError;

  const loadCards = useCallback(async () => {
    if (loadingCardsRef.current) return;
    loadingCardsRef.current = true;
    try {
      if (totalRewardsCacheKey !== 'scratchTotalEarned:') {
        const cachedTotal = await AsyncStorage.getItem(totalRewardsCacheKey);
        if (cachedTotal !== null) {
          const parsedTotal = Number(cachedTotal);
          if (Number.isFinite(parsedTotal)) {
            totalEarnedRef.current = parsedTotal;
            setTotalEarned(parsedTotal);
          }
        }
      }
      const result = await fetchScratchCards();
      const fetchedCards = Array.isArray(result.cards) ? result.cards : [];
      setCards(fetchedCards.filter((card: ScratchCard) => !card.scratchedAt));
      const cardHistoryTotal = fetchedCards.reduce((total: number, card: ScratchCard) => (
        card.scratchedAt ? total + Number(card.rewardAmount || 0) : total
      ), 0);
      const freshTotal = typeof result.totalEarned === 'number' && Number.isFinite(result.totalEarned)
        ? result.totalEarned
        : cardHistoryTotal;
      totalEarnedRef.current = freshTotal;
      setTotalEarned(freshTotal);
      if (totalRewardsCacheKey !== 'scratchTotalEarned:') {
        await AsyncStorage.setItem(totalRewardsCacheKey, String(freshTotal));
      }
      if (typeof result.balance === 'number') await updateUserRef.current({ balance: result.balance });
    } catch (error: any) {
      showErrorRef.current(error?.message || 'Unable to load rewards');
    } finally {
      loadingCardsRef.current = false;
      setLoading(false);
    }
  }, [totalRewardsCacheKey]);

  useFocusEffect(useCallback(() => {
    void loadCards();
  }, [loadCards]));

  const handleScratch = async (cardId: string): Promise<boolean> => {
    if (scratchingId) return false;
    setScratchingId(cardId);
    try {
      const result = await scratchScratchCard(cardId);
      const rewardAmount = Number(result.rewardAmount || 0);
      const alreadyScratched = result.alreadyScratched === true;
      const card = cards.find((item) => item.id === cardId);
      setCards((current) => current.filter((item) => item.id !== cardId));
      if (card && !alreadyScratched) {
        setClaimedCard({ ...card, scratchedAt: new Date().toISOString(), rewardAmount });
        setActiveScratchCard(null);
      }
      if (typeof result.balance === 'number') await updateUser({ balance: result.balance });
      if (!alreadyScratched) {
        totalEarnedRef.current += rewardAmount;
        setTotalEarned(totalEarnedRef.current);
        if (totalRewardsCacheKey !== 'scratchTotalEarned:') {
          void AsyncStorage.setItem(totalRewardsCacheKey, String(totalEarnedRef.current));
        }
      }
      setActiveScratchCard(null);
      return true;
    } catch (error: any) {
      showError(error?.message || 'Unable to scratch this card');
      void loadCards();
      return false;
    } finally {
      setScratchingId(null);
    }
  };

  const pendingCount = cards.length;

  return (
    <>
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#f8fafc" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.heading}>Rewards</Text>
          <Text style={styles.subtitle}>Scratch cards and your reward history</Text>
        </View>
      </View>

      <View style={styles.totalRewardsCard}>
        <View style={styles.totalRewardsIcon}>
          <MaterialCommunityIcons name="gift-open-outline" size={24} color="#34d399" />
        </View>
        <View style={styles.totalRewardsTextWrap}>
          <Text style={styles.totalRewardsLabel}>TOTAL REWARDS</Text>
          <Text style={styles.totalRewardsAmount}>{formatCurrency(totalEarned)}</Text>
        </View>
      </View>

      {loading ? <Text style={styles.statusText}>Loading rewards…</Text> : null}
      {!loading && cards.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="gift-outline" size={26} color="#34d399" />
          </View>
          <Text style={styles.emptyTitle}>No scratch cards yet</Text>
          <Text style={styles.emptyText}>New cards appear here after an eligible investment.</Text>
        </View>
      ) : null}
      {cards.length > 0 ? (
        <>
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.sectionTitle}>Scratch cards</Text>
              <Text style={styles.sectionSubtitle}>Tap a card to reveal your reward</Text>
            </View>
            <View style={styles.pendingCountBadge}>
              <Text style={styles.pendingCount}>{pendingCount} available</Text>
            </View>
          </View>
          <View style={styles.cardsGrid}>
            {cards.map((card) => <ScratchCardTile key={card.id} card={card} onScratch={handleScratch} onOpen={setActiveScratchCard} />)}
          </View>
        </>
      ) : null}
    </ScrollView>
    <Modal
      visible={Boolean(activeScratchCard)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setActiveScratchCard(null)}
    >
      <View style={styles.activeScratchBackdrop}>
        <View style={styles.activeScratchModal}>
          <Pressable
            style={styles.activeScratchClose}
            onPress={() => setActiveScratchCard(null)}
            accessibilityRole="button"
            accessibilityLabel="Close scratch card"
          >
            <MaterialCommunityIcons name="close" size={22} color="#334155" />
          </Pressable>
          {activeScratchCard ? (
            <ScratchCardTile
              card={activeScratchCard}
              onScratch={handleScratch}
              isActive
            />
          ) : null}
        </View>
      </View>
    </Modal>
    <Modal
      visible={Boolean(claimedCard)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setClaimedCard(null)}
    >
      <View style={styles.rewardModalBackdrop}>
        <View style={styles.rewardModal}>
          <View style={styles.revealCardWrap}>
            <Image
              source={ALL_IN_ONE_REVEAL_CARD}
              style={styles.revealCardImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.rewardCheck}>
            <MaterialCommunityIcons name="check" size={28} color="#fff" />
          </View>
          <Text style={styles.rewardModalEyebrow}>NICE ONE!</Text>
          <Text style={styles.rewardModalTitle}>You won</Text>
          <Text style={styles.rewardModalAmount}>{formatCurrency(claimedCard?.rewardAmount || 0)}</Text>
          <View style={styles.rewardWalletNote}>
            <MaterialCommunityIcons name="wallet-plus-outline" size={19} color="#087f5b" />
            <Text style={styles.rewardWalletText}>Added to your wallet</Text>
          </View>
          <Pressable style={styles.rewardDoneButton} onPress={() => setClaimedCard(null)} accessibilityRole="button">
            <Text style={styles.rewardDoneText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b15' },
  container: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 40, backgroundColor: '#090b15' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 12, marginBottom: 22 },
  backButton: { width: 46, height: 46, marginTop: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', borderWidth: 1, borderColor: '#263449' },
  headerText: { flex: 1, marginLeft: 14 },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginTop: 3 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  pendingCountBadge: { backgroundColor: 'rgba(52,211,153,0.10)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.22)', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  pendingCount: { color: '#6ee7b7', fontSize: 12, fontWeight: '700' },
  card: { width: '50%', alignSelf: 'auto', backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 4, paddingBottom: 8, overflow: 'visible', elevation: 0 },
  activeCard: { width: '82%', maxWidth: 360, alignSelf: 'center' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff6db', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  cardDetails: { flex: 1 },
  cardTitle: { color: '#172033', fontSize: 14, fontWeight: '700' },
  cardMeta: { color: '#718096', fontSize: 11, marginTop: 4 },
  scratchArea: { width: '100%', aspectRatio: 1, borderRadius: 0, overflow: 'hidden', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' },
  activeScratchArea: { aspectRatio: 1, borderRadius: 0 },
  scratchReveal: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', borderRadius: 0 },
  scratchSvg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 },
  scratchPrompt: { position: 'absolute', bottom: 18, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', elevation: 3 },
  scratchPromptText: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  scratchFooter: { marginTop: 11 },
  scratchProgressText: { color: '#718096', fontSize: 12, fontWeight: '600', marginBottom: 7 },
  scratchProgressCount: { color: '#946c00', fontWeight: '800' },
  scratchTierInfo: { alignItems: 'center', paddingHorizontal: 2, paddingTop: 7, paddingBottom: 4 },
  scratchTierInvestment: { color: '#94a3b8', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  scratchTierReward: { color: '#6ee7b7', fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#e8edf4', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#e5aa00' },
  statusText: { color: '#94a3b8', textAlign: 'center', paddingVertical: 20 },
  emptyCard: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 30, borderRadius: 20, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937' },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: 'rgba(52,211,153,0.10)' },
  emptyTitle: { color: '#f8fafc', fontWeight: '800', fontSize: 17 },
  emptyText: { maxWidth: 280, color: '#94a3b8', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  rewardModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.62)' },
  rewardModal: { width: '100%', maxWidth: 380, alignItems: 'center', paddingTop: 0, paddingHorizontal: 0, paddingBottom: 24, borderRadius: 28, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 0 },
  revealCardWrap: { width: '100%', height: 250, overflow: 'hidden', marginBottom: 0, backgroundColor: '#fff' },
  revealCardImage: { width: '100%', height: '100%', backgroundColor: '#fff' },
  rewardCheck: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07966a', marginTop: 8, marginBottom: 16 },
  rewardModalEyebrow: { color: '#07845f', fontSize: 11, fontWeight: '900', letterSpacing: 1.8, paddingHorizontal: 26 },
  rewardModalTitle: { color: '#182230', fontSize: 19, fontWeight: '600', marginTop: 8, paddingHorizontal: 26 },
  rewardModalAmount: { color: '#111827', fontSize: 42, fontWeight: '900', letterSpacing: -1.2, marginTop: 4, paddingHorizontal: 26 },
  rewardWalletNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 17, borderRadius: 22, backgroundColor: '#e8f7f1' },
  rewardWalletText: { color: '#087f5b', fontSize: 13, fontWeight: '700' },
  rewardDoneButton: { width: '86%', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 24, borderRadius: 15, backgroundColor: '#162033' },
  rewardDoneText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  allInOneModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.62)' },
  allInOneModal: { width: '100%', maxWidth: 380, alignItems: 'center', paddingHorizontal: 26, paddingTop: 30, paddingBottom: 24, borderRadius: 28, backgroundColor: '#fff' },
  allInOneImage: { width: '100%', height: 200, marginBottom: 20 },
  allInOneTitle: { color: '#182230', fontSize: 19, fontWeight: '600', marginTop: 8 },
  allInOneAmount: { color: '#111827', fontSize: 42, fontWeight: '900', letterSpacing: -1.2, marginTop: 4 },
  allInOneDoneButton: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 24, borderRadius: 15, backgroundColor: '#162033' },
  allInOneDoneText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  activeScratchBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(9,11,21,0.88)' },
  activeScratchModal: { maxWidth: 360, width: '82%', alignSelf: 'center', position: 'relative', borderRadius: 0, overflow: 'hidden', backgroundColor: '#090b15' },
  activeScratchClose: { position: 'absolute', zIndex: 20, top: 12, right: 12, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)', elevation: 5 },
  totalRewardsCard: { flexDirection: 'row', alignItems: 'center', width: '100%', padding: 16, marginBottom: 24, borderRadius: 20, backgroundColor: '#111827', borderWidth: 1, borderColor: '#263449' },
  totalRewardsIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(52,211,153,0.12)', marginRight: 14 },
  totalRewardsTextWrap: { flex: 1 },
  totalRewardsLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  totalRewardsAmount: { color: '#f8fafc', fontSize: 25, fontWeight: '900', marginTop: 4 },
  cardsGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'flex-start', marginTop: 4 },
});