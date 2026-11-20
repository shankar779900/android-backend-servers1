export interface InvestmentPlan {
  id: string;
  planName: string;
  planType: string;
  amount: number;
  amountLabel: string;
  returnLabel: string;
  returnPercent: number;
  durationLabel: string;
  totalReturn: number;
  totalProfit?: number;
  premium: boolean;
  workingDays?: number;
  creditedEarnings?: number;
  portfolioEarnings?: number;
  claimedEarnings?: number;
  todayGain?: number;
  investmentStatus?: 'Active' | 'Completed' | 'Withdrawn' | 'Reinvested';
  purchasedAt?: string;
  expiresAt?: string;
  completedAt?: string;
  transactionId?: string;
  dailyProfit?: number;
  quantity?: number;
}

export const investmentPlans: InvestmentPlan[] = [
  { id: '2000', planType: 'equity', planName: 'Equity Growth Plan', amount: 2000, amountLabel: '₹2,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 2600, premium: false },
  { id: '3500', planType: 'equity', planName: 'Equity Growth Plan', amount: 3500, amountLabel: '₹3,500', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 4550, premium: false },
  { id: '5000', planType: 'equity', planName: 'Equity Growth Plan', amount: 5000, amountLabel: '₹5,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 6500, premium: false },
  { id: '10000', planType: 'equity', planName: 'Equity Growth Plan', amount: 10000, amountLabel: '₹10,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 13000, premium: false },
  { id: '20000', planType: 'equity', planName: 'Equity Growth Plan', amount: 20000, amountLabel: '₹20,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 26000, premium: false },
  { id: '30000', planType: 'equity', planName: 'Equity Growth Plan', amount: 30000, amountLabel: '₹30,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 39000, premium: false },
  { id: '40000', planType: 'equity', planName: 'Equity Growth Plan', amount: 40000, amountLabel: '₹40,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 52000, premium: false },
  { id: '50000', planType: 'equity', planName: 'Equity Growth Plan', amount: 50000, amountLabel: '₹50,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 65000, premium: false },
  { id: '100000', planType: 'equity', planName: 'Equity Growth Plan', amount: 100000, amountLabel: '₹1,00,000', returnLabel: 'Up to 30%', returnPercent: 30, durationLabel: '1 Month', totalReturn: 130000, premium: false },
  { id: '150000', planType: 'equity', planName: 'Equity Pro Plan', amount: 150000, amountLabel: '₹1,50,000', returnLabel: 'Up to 37%', returnPercent: 37, durationLabel: '1 Month', totalReturn: 205500, premium: true },
  { id: '200000', planType: 'equity', planName: 'Equity Pro Plan', amount: 200000, amountLabel: '₹2,00,000', returnLabel: 'Up to 37%', returnPercent: 37, durationLabel: '1 Month', totalReturn: 274000, premium: true },
  { id: '250000', planType: 'equity', planName: 'Equity Pro Plan', amount: 250000, amountLabel: '₹2,50,000', returnLabel: 'Up to 37%', returnPercent: 37, durationLabel: '1 Month', totalReturn: 342500, premium: true },
  { id: '300000', planType: 'equity', planName: 'Equity Pro Plan', amount: 300000, amountLabel: '₹3,00,000', returnLabel: 'Up to 37%', returnPercent: 37, durationLabel: '1 Month', totalReturn: 411000, premium: true },
  { id: 'gold1', planType: 'commodities', planName: 'Gold Savings Plan', amount: 48000, amountLabel: '₹48,000', returnLabel: 'Up to 46%', returnPercent: 46, durationLabel: '1.5 Months', totalReturn: 70080, premium: false, workingDays: 33 },
  { id: 'silver1', planType: 'commodities', planName: 'Silver Growth Plan', amount: 46000, amountLabel: '₹46,000', returnLabel: 'Up to 46%', returnPercent: 46, durationLabel: '1.5 Months', totalReturn: 67160, premium: false, workingDays: 33 },
  { id: 'copper95000', planType: 'commodities', planName: 'Hindustan Copper Limited', amount: 95000, amountLabel: '₹95,000', returnLabel: 'Up to 46%', returnPercent: 46, durationLabel: '1.5 Months', totalReturn: 138700, premium: false, workingDays: 33 },
  { id: 'copper41000', planType: 'commodities', planName: 'Hindustan Copper Limited', amount: 41000, amountLabel: '₹41,000', returnLabel: 'Up to 46%', returnPercent: 46, durationLabel: '1.5 Months', totalReturn: 59860, premium: false, workingDays: 33 },
  { id: 'zinc27000', planType: 'commodities', planName: 'Hindustan Zinc Limited', amount: 27000, amountLabel: '₹27,000', returnLabel: 'Up to 46%', returnPercent: 46, durationLabel: '1.5 Months', totalReturn: 39420, premium: false, workingDays: 33 },
  { id: 'zinc65000', planType: 'commodities', planName: 'Hindustan Zinc Limited', amount: 65000, amountLabel: '₹65,000', returnLabel: 'Up to 46%', returnPercent: 46, durationLabel: '1.5 Months', totalReturn: 94900, premium: false, workingDays: 33 },
  { id: 'fno0', planType: 'fno', planName: 'Nifty 50 Weekly Futures', amount: 2000, amountLabel: '₹2,000', returnLabel: 'Up to 9%', returnPercent: 9, durationLabel: '1 Week', totalReturn: 2180, premium: false },
  { id: 'fno3', planType: 'fno', planName: 'Nifty 50 Weekly Futures', amount: 3500, amountLabel: '₹3,500', returnLabel: 'Up to 9%', returnPercent: 9, durationLabel: '1 Week', totalReturn: 3815, premium: false },
  { id: 'fno1', planType: 'fno', planName: 'Nifty 50 Weekly Futures', amount: 10000, amountLabel: '₹10,000', returnLabel: 'Up to 9%', returnPercent: 9, durationLabel: '1 Week', totalReturn: 10900, premium: false },
  { id: 'fno4', planType: 'fno', planName: 'Nifty 50 Weekly Futures', amount: 30000, amountLabel: '₹30,000', returnLabel: 'Up to 9%', returnPercent: 9, durationLabel: '1 Week', totalReturn: 32700, premium: false },
  { id: 'fno2', planType: 'fno', planName: 'Bank Nifty Weekly Options', amount: 50000, amountLabel: '₹50,000', returnLabel: 'Up to 9%', returnPercent: 9, durationLabel: '1 Week', totalReturn: 54500, premium: false },
];
