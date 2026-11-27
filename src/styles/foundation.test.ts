import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesDir = resolve(process.cwd(), 'src/styles');
const indexCssPath = resolve(process.cwd(), 'src/index.css');

describe('Tailwind v4 foundation (Fase 0A)', () => {
  it('imports tokens.css, base.css, and motion.css from index.css after tailwindcss', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');
    const tailwindPos = indexCss.indexOf('@import "tailwindcss";');
    const tokensPos = indexCss.indexOf('@import "./styles/tokens.css";');
    const basePos = indexCss.indexOf('@import "./styles/base.css";');
    const motionPos = indexCss.indexOf('@import "./styles/motion.css";');

    expect(tailwindPos).toBeGreaterThanOrEqual(0);
    expect(tokensPos).toBeGreaterThan(tailwindPos);
    expect(basePos).toBeGreaterThan(tokensPos);
    expect(motionPos).toBeGreaterThan(basePos);
  });

  it('defines complete Figma tokens in @theme and a single :root compatibility block in tokens.css', () => {
    const tokensPath = resolve(stylesDir, 'tokens.css');
    expect(existsSync(tokensPath)).toBe(true);
    const tokensCss = readFileSync(tokensPath, 'utf8');
    const indexCss = readFileSync(indexCssPath, 'utf8');

    expect(tokensCss).toContain('@theme {');
    for (const token of [
      '--color-canvas:',
      '--color-surface:',
      '--color-surface-soft:',
      '--color-primary:',
      '--color-primary-hover:',
      '--color-secondary:',
      '--color-danger-action:',
      '--color-text:',
      '--color-muted:',
      '--color-border:',
      '--color-border-strong:',
      '--color-input-border:',
      '--color-link:',
      '--color-error:',
      '--color-success:',
      '--color-warning:',
      '--font-sans:',
      '--font-heading:',
    ]) {
      expect(tokensCss).toContain(token);
    }

    expect(tokensCss.match(/^:root\s*\{/gm)).toHaveLength(1);
    expect(tokensCss).toContain('--motion-fast: 120ms;');
    expect(tokensCss).toContain('--motion-base: 180ms;');
    expect(tokensCss).toContain('--ease-standard: cubic-bezier(0.2, 0, 0, 1);');
    const rootBlock = tokensCss.slice(tokensCss.indexOf(':root {'));
    expect(rootBlock).toContain('--canvas: var(--color-canvas);');
    expect(rootBlock).toContain('--primary: var(--color-primary);');
    expect(rootBlock).not.toMatch(/--(?:canvas|surface|primary|text|muted|border|error|success|warning):\s*#/);
    expect(indexCss).not.toMatch(/^@theme\s*\{/m);
    expect(indexCss).not.toMatch(/^:root\s*\{/m);
  });

  it('wraps element resets, headings, and focus defaults inside @layer base without transitional tail in base.css', () => {
    const basePath = resolve(stylesDir, 'base.css');
    expect(existsSync(basePath)).toBe(true);
    const baseCss = readFileSync(basePath, 'utf8');
    const indexCss = readFileSync(indexCssPath, 'utf8');

    expect(baseCss).toContain('@layer base {');
    expect(baseCss).toContain(':focus-visible');
    expect(baseCss).toContain('.skip-link');
    expect(baseCss).toContain('h1 {');
    expect(baseCss).toContain('h2 {');
    expect(baseCss).not.toContain('/* Transitional');
    expect(indexCss).not.toMatch(/^:focus-visible\s*\{/m);
    expect(indexCss).not.toMatch(/^body\s*\{/m);
    expect(indexCss).not.toMatch(/^\.skip-link\s*\{/m);
  });

  it('removes migrated Fase 1 shell, static page, and showcase CSS blocks from index.css', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');

    for (const removed of [
      /^\.app-shell\s*\{/m,
      /^\.site-footer\s*\{/m,
      /^\.help-page\s*\{/m,
      /^\.help-grid\s*\{/m,
      /^\.auth-showcase\s*\{/m,
      /^\.logout-dialog\s*\{/m,
      /^\.route-loading-panel\s*,/m,
      /^\.status-page-panel\s*\{/m,
      /^\.document-grid\s*\{/m,
      /^\.error-panel\s*\{/m,
      /^\.success-label\s*\{/m,
      /^\.eyebrow\s*\{/m,
    ]) {
      expect(indexCss).not.toMatch(removed);
    }
  });

  it('removes migrated Fase 2A auth CSS blocks from index.css', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');

    for (const removed of [
      /^\.auth-layout\s*\{/m,
      /^\.auth-intro\s*\{/m,
      /^\.study-illustration\s*\{/m,
      /^\.study-card\s*\{/m,
      /^\.study-tiles\s*\{/m,
      /^\.study-note\s*\{/m,
      /^\.study-badge\s*\{/m,
      /^\.auth-card\s*\{/m,
      /^\.password-field\s*\{/m,
      /^\.password-toggle\s*\{/m,
      /^\.password-label-row\s*\{/m,
      /^\.password-help-trigger\s*\{/m,
      /^\.password-help-backdrop\s*\{/m,
      /^\.password-help-dialog\s*\{/m,
      /^\.forgot-link\s*\{/m,
      /^\.google-button\s*\{/m,
      /^\.auth-switch\s+a\s*\{/m,
      /^\.auth-server-error\s*\{/m,
      /^\.auth-fields\s*\{/m,
      /^\.auth-flow\b/m,
      /^\.auth-divider\s*\{/m,
      /^\.sprint-notice\s*\{/m,
      /^\.username-layout\s*\{/m,
      /^\.username-cancel\s*\{/m,
    ]) {
      expect(indexCss).not.toMatch(removed);
    }
  });

  it('removes migrated Fase 2B join-room CSS blocks from index.css', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');

    for (const removed of [
      /^\.room-join-page\s*\{/m,
      /^\.room-join-page\s+h1\s*\{/m,
      /^\.room-management-dialog-join\s+\.form-field\b/m,
      /^\.room-management-dialog-join-error\s+\.form-field\b/m,
      /^\.room-management-dialog-join\s+\.room-management-dialog-field-error\s*\{/m,
      /^\.room-management-dialog-join-helper\s*\{/m,
      /^\.room-management-dialog-join-error\s+\.room-management-dialog-join-helper\s*\{/m,
      /^\.room-management-dialog-join\s+\.room-management-dialog-actions\s+\.primary\s*\{/m,
      /^\.entry-form\s*\{/m,
    ]) {
      expect(indexCss).not.toMatch(removed);
    }
  });

  it('removes migrated Fase 3 profile and account-deletion CSS blocks from index.css', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');

    for (const removed of [
      /^\.user-profile\s*\{/m,
      /^\.user-profile-heading\s*\{/m,
      /^\.user-profile-grid\s*\{/m,
      /^\.user-profile-card\s*\{/m,
      /^\.user-profile-identity\s*\{/m,
      /^\.user-profile-avatar\s*\{/m,
      /^\.user-profile-data\s*\{/m,
      /^\.user-profile-settings\s*\{/m,
      /^\.user-profile-edit\s*\{/m,
      /^\.user-profile-fields\s*\{/m,
      /^\.user-profile-actions\s*\{/m,
      /^\.user-profile-loading\s*\{/m,
      /^\.user-profile-notice\s*\{/m,
      /^\.user-profile-dialog\s*\{/m,
      /^\.user-profile-discard\s*\{/m,
      /^\.user-profile-avatar-trigger\s*\{/m,
      /^\.user-profile-avatar-dialog\s*\{/m,
      /^\.profile-delete-dialog\s*\{/m,
      /^\.profile-delete-confirmation\s*\{/m,
      /^\.profile-delete-status\s+strong\s*\{/m,
    ]) {
      expect(indexCss).not.toMatch(removed);
    }
  });

  it('removes migrated Fase 4A dashboard and room-card CSS blocks from index.css', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');

    for (const removed of [
      /^\.dashboard\s*\{/m,
      /^\.dashboard-heading\s*\{/m,
      /^\.rooms-section\s*\{/m,
      /^\.rooms-grid\s*\{/m,
      /^\.dashboard-loading\s*\{/m,
      /^\.room-skeleton-grid\s*\{/m,
      /^\.room-card-skeleton\s*\{/m,
      /^\.room-load-error\s*\{/m,
      /^\.room-empty-state\s*\{/m,
      /^\.room-card\s*\{/m,
      /^\.room-card-menu\s*\{/m,
      /^\.room-card-enter\s*\{/m,
      /^\.dashboard-avatar\s*\{/m,
      /^\.dashboard-shell\s*\{/m,
    ]) {
      expect(indexCss).not.toMatch(removed);
    }
  });

  it('removes migrated Fase 4B room creation and management CSS blocks from index.css', () => {
    const indexCss = readFileSync(indexCssPath, 'utf8');

    for (const removed of [
      /^\.room-management-dialog-create\s*\{/m,
      /^\.room-management-dialog-join\s*\{/m,
      /^\.room-management-dialog-delete\s*\{/m,
      /^\.room-management-dialog-edit\s*\{/m,
      /^\.room-management-dialog-description\s*\{/m,
      /^\.room-management-dialog-field-error\s*\{/m,
      /^\.room-management-dialog-helper\s*\{/m,
      /^\.room-create-dialog\b/m,
      /^\.room-create-alert\b/m,
      /^\.room-create-success\s*\{/m,
      /^\.room-create-review\s*\{/m,
      /^\.room-id-actions\s*\{/m,
      /^\.room-copy-button\s*\{/m,
      /^\.room-copy-badge\s*\{/m,
      /^\.room-created-panel\s*\{/m,
      /^\.room-operation-dialog\s*\{/m,
      /^\.room-management-status\s*\{/m,
    ]) {
      expect(indexCss).not.toMatch(removed);
    }
  });

  it('centralizes keyframes and reduced-motion rules in motion.css without leaving duplicates in index.css', () => {
    const motionPath = resolve(stylesDir, 'motion.css');
    expect(existsSync(motionPath)).toBe(true);
    const motionCss = readFileSync(motionPath, 'utf8');
    const indexCss = readFileSync(indexCssPath, 'utf8');

    expect(motionCss).toContain('@keyframes menu-enter');
    expect(motionCss).toContain('@keyframes dashboard-skeleton-shimmer');
    expect(motionCss).toContain('@keyframes room-loading-progress');
    expect(motionCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(indexCss).not.toContain('@keyframes ');
    expect(indexCss).not.toContain('@media (prefers-reduced-motion: reduce)');
  });
});
