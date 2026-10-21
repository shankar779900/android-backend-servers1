export function isTransientNetworkError(message?: string): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return (
    normalized.includes('aborted') ||
    normalized.includes('abort') ||
    normalized.includes('network request failed') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('load failed') ||
    normalized.includes('connection')
  );
}

export function getUserFriendlyError(message?: string): string {
  if (!message) return '';
  const cleaned = String(message)
    .replace(/^Request failed with status \d+\s*:\s*/i, '')
    .trim();
  const normalized = cleaned.toLowerCase();

  // hide messages that contain HTML or raw markup (e.g. server returned an HTML error page)
  try {
    if (/<\/?[a-z][\s\S]*>/i.test(cleaned)) return '';
  } catch (e) {}

  // suppress transient network issues entirely
  if (isTransientNetworkError(message)) return '';

  // suppress common server/db/internal errors to avoid exposing raw messages
  const blockedKeywords = [
    'econnrefused', 'enotfound', '503', '502', '500', 'gateway', 'prisma', 'database', 'sql', 'exception', 'stack', 'trace', 'error:', 'internal', 'timed out', 'connection refused'
  ];
  for (const kw of blockedKeywords) {
    if (normalized.includes(kw)) return '';
  }

  // message appears safe — return original message so UI can show it to the user
  return cleaned;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  return getUserFriendlyError(raw) || fallback;
}
