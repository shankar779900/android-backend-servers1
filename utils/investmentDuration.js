const TRADING_DAYS_PER_MONTH = 22;
const CALENDAR_DAYS_PER_MONTH = 30;

function positiveRoundedDays(value, unit) {
  const days = Math.round(value);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new RangeError(`Investment duration in ${unit} must be greater than zero`);
  }
  return days;
}

function getInvestmentWorkingDays(durationLabel, planType) {
  const normalizedLabel = String(durationLabel || '').trim().toLowerCase();
  const monthsMatch = normalizedLabel.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthsMatch) {
    return positiveRoundedDays(Number(monthsMatch[1]) * TRADING_DAYS_PER_MONTH, 'trading days');
  }

  const daysMatch = normalizedLabel.match(/(\d+)\s*days?/);
  if (daysMatch) {
    return positiveRoundedDays(Number(daysMatch[1]), 'trading days');
  }

  const weeksMatch = normalizedLabel.match(/(\d+)\s*weeks?/);
  if (weeksMatch) {
    return positiveRoundedDays(Number(weeksMatch[1]) * 5, 'trading days');
  }

  if (['fno', 'futures', 'options'].includes(planType)) {
    return 5;
  }

  return TRADING_DAYS_PER_MONTH;
}

function getInvestmentCalendarDays(durationLabel) {
  const normalizedLabel = String(durationLabel || '').trim().toLowerCase();
  const monthsMatch = normalizedLabel.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthsMatch) {
    return positiveRoundedDays(Number(monthsMatch[1]) * CALENDAR_DAYS_PER_MONTH, 'calendar days');
  }

  const daysMatch = normalizedLabel.match(/(\d+)\s*days?/);
  if (daysMatch) {
    return positiveRoundedDays(Number(daysMatch[1]), 'calendar days');
  }

  const weeksMatch = normalizedLabel.match(/(\d+)\s*weeks?/);
  if (weeksMatch) {
    return positiveRoundedDays(Number(weeksMatch[1]) * 7, 'calendar days');
  }

  return CALENDAR_DAYS_PER_MONTH;
}

module.exports = {
  getInvestmentWorkingDays,
  getInvestmentCalendarDays,
};
