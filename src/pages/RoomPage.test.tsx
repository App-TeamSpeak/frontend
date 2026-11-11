import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PictureInPictureStrip, RoomPage } from './RoomPage';

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana Martínez', email: 'ana@test.edu' } }) }));
vi.mock('../firebase', () => ({ firebaseAuth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('token') } } }));
vi.mock('../services/api', () => ({ api: { getRoom: vi.fn(() => new Promise(() => {})), listMessages: vi.fn(() => new Promise(() => {})) }, ApiError: class ApiError extends Error {} }));
vi.mock('socket.io-client', () => ({ io: vi.fn() }));

describe('RoomPage', () => {
  it('limita miniaturas y anuncia participantes adicionales', () => {
    const participants = Array.from({ length: 6 }, (_, index) => ({ name: `Persona ${index}`, initials: 'P', microphone: 'off' as const, camera: 'off' as const }));
    render(<PictureInPictureStrip participants={participants} />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByLabelText('2 participantes adicionales')).toBeInTheDocument();
  });
  it('muestra carga y permite volver al dashboard', () => {
    render(<MemoryRouter initialEntries={['/salas/room-1']}><Routes><Route path="/salas/:id" element={<RoomPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Preparando tu sala');
    expect(screen.getByRole('link', { name: 'Volver a mis salas' })).toHaveAttribute('href', '/dashboard');
  });
});
