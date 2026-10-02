// 메모리 내 고정 윈도우 rate limiter (서버리스 인스턴스 단위로만 유효)
const buckets = new Map();

export function rateLimit(key, limit, windowMs = 60_000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  // 메모리 누수 방지: 가끔 만료된 버킷 정리
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k);
  }
  return {
    allowed: b.count <= limit,
    retryAfterSec: Math.max(1, Math.ceil((b.reset - now) / 1000)),
  };
}
