/**
 * Sliding window In-Memory Rate Limiter to prevent DoS, Brute-force & credential stuffing.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function checkRateLimit(identifier: string, maxRequests: number = 10, windowSeconds: number = 60): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { allowed: true, remaining: maxRequests - 1, resetInSeconds: windowSeconds };
  }

  if (record.count >= maxRequests) {
    const resetInSeconds = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

/**
 * Sanitizes input string to prevent stored or reflected XSS injection.
 */
export function sanitizeInput(str: string): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
