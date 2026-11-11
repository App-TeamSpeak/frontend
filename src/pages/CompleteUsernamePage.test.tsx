import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompleteUsernamePage } from './PlaceholderPages';

const setUser = vi.fn();
afterEach(() => { cleanup(); setUser.mockClear(); });
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'ana@test.edu', name: 'Ana', username: '' }, setUser }) }));
vi.mock('../services/auth', () => ({ completeProfile: vi.fn() }));

describe('CompleteUsernamePage', () => {
  it('rechaza un nombre inválido', () => {
    render(<MemoryRouter><CompleteUsernamePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Usa entre 8 y 30 caracteres');
  });
  it('acepta un nombre válido', async () => {
    const { completeProfile } = await import('../services/auth');
    vi.mocked(completeProfile).mockResolvedValue({ user: { id: 'u1', email: 'ana@test.edu', name: 'Ana', username: 'ana_nueva' } } as never);
    render(<MemoryRouter><CompleteUsernamePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'ana_nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(await screen.findByRole('heading', { name: 'Tu cuenta está lista' })).toBeInTheDocument();
    expect(setUser).toHaveBeenCalled();
  });
});
