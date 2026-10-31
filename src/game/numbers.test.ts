import { describe, expect, it } from 'vitest';
import { big } from './numbers';

describe('big numbers', () => {
  it('reads at a glance as they explode', () => {
    expect(big(0)).toBe('0');
    expect(big(999.9)).toBe('999');
    expect(big(1000)).toBe('1.00K');
    expect(big(12_345)).toBe('12.3K');
    expect(big(999_999)).toBe('999K');
    expect(big(1_750_000)).toBe('1.75M');
    expect(big(4.2e9)).toBe('4.20B');
    expect(big(3.3e15)).toBe('3.30Qa');
    expect(big(1e36)).toBe('1.0e36');
    expect(big(-2500)).toBe('-2.50K');
  });
});
