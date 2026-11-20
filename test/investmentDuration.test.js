const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getInvestmentCalendarDays,
  getInvestmentWorkingDays,
} = require('../utils/investmentDuration');

test('one and a half months maps to 33 market days and 45 calendar days', () => {
  assert.equal(getInvestmentWorkingDays('1.5 Months', 'commodities'), 33);
  assert.equal(getInvestmentCalendarDays('1.5 Months'), 45);
});

test('existing one-month and F&O working-day rules stay unchanged', () => {
  assert.equal(getInvestmentWorkingDays('1 Month', 'equity'), 22);
  assert.equal(getInvestmentWorkingDays('1 Week', 'fno'), 5);
});

test('zero or too-short durations cannot create zero-day investments', () => {
  assert.throws(() => getInvestmentWorkingDays('0 Months', 'commodities'), RangeError);
  assert.throws(() => getInvestmentCalendarDays('0 Months'), RangeError);
  assert.throws(() => getInvestmentWorkingDays('0.01 Months', 'commodities'), RangeError);
});
