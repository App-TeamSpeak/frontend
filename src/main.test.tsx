import { beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.fn();
const createRoot = vi.fn(() => ({ render }));
vi.mock('react-dom/client', () => ({ createRoot }));

describe('frontend entry point', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the application in the root element', async () => {
    await import('./main');

    expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(render).toHaveBeenCalledTimes(1);
  });
});
