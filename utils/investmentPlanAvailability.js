const ALLOWED_PLAN_AMOUNTS = {
  equity: [2000, 3500, 5000, 10000, 20000, 30000, 40000, 50000, 100000, 150000, 200000, 250000, 300000],
  fno: [2000, 3500, 10000, 30000, 50000],
  futures: [2000, 3500, 10000, 30000, 50000],
  options: [2000, 3500, 10000, 30000, 50000],
  commodities: [10000, 15000, 25000],
};

const DEFAULT_ALLOWED_PLAN_AMOUNTS = [10000, 30000, 50000];

function getAllowedPlanAmounts(planType) {
  return ALLOWED_PLAN_AMOUNTS[planType] || DEFAULT_ALLOWED_PLAN_AMOUNTS;
}

module.exports = { getAllowedPlanAmounts };
