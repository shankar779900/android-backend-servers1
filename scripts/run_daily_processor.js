const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { processDailyInvestmentEarnings } = require('../services/investmentEarnings');

(async () => {
  try {
    console.log('Triggering processDailyInvestmentEarnings now...');
    await processDailyInvestmentEarnings();
    console.log('Done');
    process.exit(0);
  } catch (err) {
    console.error('Error running processor:', err);
    process.exit(1);
  }
})();
