import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The rampage and battle tests simulate whole runs and battles: CI runners are slower than a
  // laptop, so they get longer than vitest's default 5 s.
  test: { include: ['src/**/*.test.ts'], testTimeout: 30_000 },
});
