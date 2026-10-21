import { getErrorMessage, getUserFriendlyError, isTransientNetworkError } from './networkErrors';

describe('network error handling', () => {
  it('treats abort and timeout messages as transient', () => {
    expect(isTransientNetworkError('Aborted')).toBe(true);
    expect(isTransientNetworkError('Network request failed')).toBe(true);
    expect(isTransientNetworkError('timeout')).toBe(true);
  });

  it('returns blank for transient abort text and keeps other messages', () => {
    expect(getUserFriendlyError('Aborted')).toBe('');
    expect(getUserFriendlyError('Something else')).toBe('Something else');
  });

  it('removes technical HTTP prefixes from user-facing messages', () => {
    expect(getUserFriendlyError('Request failed with status 409: This bank account is already saved'))
      .toBe('This bank account is already saved');
  });

  it('uses a friendly fallback for technical errors', () => {
    expect(getErrorMessage(new Error('Request failed with status 500: database error'), 'Please try again'))
      .toBe('Please try again');
  });
});
