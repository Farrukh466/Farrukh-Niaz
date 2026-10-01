import { FixedWindowRateLimiter } from './rate-limit';

describe('FixedWindowRateLimiter', () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it('allows up to the limit, then blocks with a retry hint', () => {
    let t = 0;
    const limiter = new FixedWindowRateLimiter(() => t);

    expect([1, 2, 3].map(() => limiter.hit('k', rule).allowed)).toEqual([true, true, true]);
    const blocked = limiter.hit('k', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('resets after the window', () => {
    let t = 0;
    const limiter = new FixedWindowRateLimiter(() => t);
    for (let i = 0; i < 4; i++) limiter.hit('k', rule);

    t = 60_000;
    expect(limiter.hit('k', rule).allowed).toBe(true);
  });

  it('keeps separate counts per key', () => {
    const limiter = new FixedWindowRateLimiter(() => 0);
    for (let i = 0; i < 3; i++) limiter.hit('user-a', rule);

    expect(limiter.hit('user-a', rule).allowed).toBe(false);
    expect(limiter.hit('user-b', rule).allowed).toBe(true);
  });
});