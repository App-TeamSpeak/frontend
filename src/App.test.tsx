import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('TeamSpeak frontend', () => {
  it('renders the technical base page', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { estado: 'verificado', sprint: 0 } }),
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: /salón de estudio colaborativo/i })).toBeInTheDocument();
    expect(await screen.findByText('verificado')).toBeInTheDocument();
    expect(screen.getByText('sprint')).toBeInTheDocument();
  });

  it('shows the API error when the document is unavailable', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, code: 'SPRINT0_DOCUMENT_NOT_FOUND', message: 'El documento no existe.' }),
    });

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('El documento no existe.');
  });
});
