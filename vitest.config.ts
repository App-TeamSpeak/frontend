import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      passWithNoTests: false,
      setupFiles: ['./src/test-setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/test-setup.ts'],
        reporter: ['text', 'lcov', 'html'],
        reportsDirectory: 'coverage',
        reportOnFailure: true,
      },
    },
  }),
);
