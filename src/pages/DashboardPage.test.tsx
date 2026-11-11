import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LocationProbe = () => <output data-testid="location-path">{useLocation().pathname}</output>;
const renderDashboard = (initialEntry = '/dashboard', withLocation = false) => render(<MemoryRouter initialEntries={[initialEntry]}><DashboardPage />{withLocation && <LocationProbe />}</MemoryRouter>);

describe('Dashboard de salas', () => {
  it('starts loading and then renders the populated dashboard from the design', () => {
    vi.useFakeTimers();
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Tus salas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Salas recientes' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('CARGANDO');
    expect(screen.getByText('Estamos obteniendo tus salas. Esto puede tardar unos segundos.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.room-card-skeleton')).toHaveLength(4);
    expect(document.querySelectorAll('.room-card-skeleton .room-card-accent-clip')).toHaveLength(4);
    expect(screen.queryByText('3 salas')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('3 salas')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.room-card-skeleton')).toHaveLength(0);
    expect(document.querySelectorAll('.room-card-accent-clip')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Cálculo II · Grupo A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Arquitectura de software' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proyecto de estructuras' })).toBeInTheDocument();
    expect(screen.getByText(/CALC-8F2K/)).toBeInTheDocument();
    expect(screen.getByText('3 personas conectadas ahora')).toBeInTheDocument();
    expect(document.querySelector('.rooms-grid')).toHaveAttribute('data-room-count', '3');
    expect(screen.queryByText('No tienes salas')).not.toBeInTheDocument();
  });

  it('keeps the existing navigation destinations', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByRole('button', { name: '＋ Crear sala' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ Unirse a sala' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Entrar/ })[0]).toHaveAttribute('href', '/salas/CALC-8F2K');
  });

  it('keeps dashboard actions independently keyboard focusable', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    const createRoom = screen.getByRole('button', { name: '＋ Crear sala' });
    const joinRoom = screen.getByRole('button', { name: '＋ Unirse a sala' });
    const enterRoom = screen.getAllByRole('link', { name: /Entrar/ })[0];
    const options = screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' });

    act(() => createRoom.focus());
    expect(createRoom).toHaveFocus();
    act(() => joinRoom.focus());
    expect(joinRoom).toHaveFocus();
    act(() => enterRoom.focus());
    expect(enterRoom).toHaveFocus();
    act(() => options.focus());
    expect(options).toHaveFocus();
  });

  it('renders the empty rooms state for the demo query parameter', () => {
    vi.useFakeTimers();
    renderDashboard('/dashboard?state=empty');

    expect(screen.getByRole('status')).toHaveTextContent('CARGANDO');
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'true');

    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByRole('heading', { name: 'No tienes salas' })).toBeInTheDocument();
    expect(screen.getByText('Cuando crees una sala o te unas con un ID, aparecerá aquí.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear mi primera sala' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: '＋ Crear sala' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ Unirse a sala' })).toBeInTheDocument();
    expect(screen.getByText(/Acceso privado/)).toBeInTheDocument();
    expect(screen.queryByText('3 salas')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.room-card-skeleton')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Cálculo II · Grupo A' })).not.toBeInTheDocument();
  });

  it('shows the backend error state when the demo query parameter is present', () => {
    vi.useFakeTimers();
    renderDashboard('/dashboard?state=error');

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'true');

    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No pudimos cargar tus salas' })).toBeInTheDocument();
    expect(screen.getByText('No fue posible obtener la lista de salas. Comprueba tu conexión a internet e inténtalo de nuevo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'false');
    expect(document.querySelectorAll('.room-card-skeleton')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Cálculo II · Grupo A' })).not.toBeInTheDocument();
    expect(screen.queryByText('3 salas')).not.toBeInTheDocument();
  });

  it('retries the room request and recovers to the populated dashboard', () => {
    vi.useFakeTimers();
    renderDashboard('/dashboard?state=error');
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('status')).toHaveTextContent('CARGANDO');
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.room-card-skeleton')).toHaveLength(4);

    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByText('3 salas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cálculo II · Grupo A' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Salas recientes' })).toHaveAttribute('aria-busy', 'false');
  });

  it('opens an independent options menu for a room', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));
    const menuButton = screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' });

    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Editar sala' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Eliminar sala' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the room menu with Escape and an outside click', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));
    const menuButton = screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' });

    fireEvent.click(menuButton);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(menuButton);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('edits a room locally and restores focus after closing the dialog', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));
    const menuButton = screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' });

    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar sala' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar sala' });
    const nameInput = screen.getByRole('textbox', { name: 'Nombre de la sala' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'edit-room-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'edit-room-description');
    expect(screen.getByText('Actualiza el nombre de tu sala. Los cambios se aplicarán a todos sus participantes.')).toBeInTheDocument();
    expect(nameInput).toHaveValue('Cálculo II · Grupo A');
    expect(screen.getByRole('textbox', { name: 'ID de la sala' })).toHaveValue('CALC-8F2K  ·  No editable');
    expect(screen.getByRole('textbox', { name: 'ID de la sala' })).toHaveAttribute('readonly');
    expect(screen.getByText('El ID se mantiene igual aunque cambies el nombre.')).toBeInTheDocument();
    expect(nameInput).toHaveFocus();
    expect(screen.queryByText('Revisa el nombre de la Sala antes de guardar.')).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Cálculo II · Grupo B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByRole('heading', { name: 'Cálculo II · Grupo B' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it('shows an accessible validation error when an edited room name is empty', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar sala' }));

    const nameInput = screen.getByRole('textbox', { name: 'Nombre de la sala' });
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByRole('dialog', { name: 'Editar sala' })).toBeInTheDocument();
    expect(screen.getByText('Revisa el nombre de la Sala antes de guardar.')).toBeInTheDocument();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'edit-room-error');
    expect(nameInput).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'ID de la sala' })).toHaveValue('CALC-8F2K  ·  No editable');
    expect(screen.getByText('El ID se mantiene igual aunque cambies el nombre.')).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Sala corregida' } });
    expect(screen.queryByText('Revisa el nombre de la Sala antes de guardar.')).not.toBeInTheDocument();
    expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('heading', { name: 'Sala corregida' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels editing without changing the room', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar sala' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la sala' }), { target: { value: 'Nombre temporal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('heading', { name: 'Cálculo II · Grupo A' })).toBeInTheDocument();
    expect(screen.queryByText('Nombre temporal')).not.toBeInTheDocument();
  });

  it('creates a room in a modal and adds it to the local dashboard list', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));

    const dialog = screen.getByRole('dialog', { name: 'Crear sala' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-describedby', 'create-room-description');
    expect(screen.getByText('Configura una sala privada para tu grupo de estudio.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nombre de la sala' })).toHaveFocus();
    expect(screen.getByPlaceholderText('Ej. Física · Grupo de laboratorio')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Privada/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Pública/ })).not.toBeChecked();
    expect(screen.queryByText('Ingresa el nombre de la Sala')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la sala' }), { target: { value: 'Seminario de cálculo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));

    expect(screen.getByRole('heading', { name: 'Seminario de cálculo' })).toBeInTheDocument();
    expect(screen.getByText('4 salas')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the create modal open and focuses the name after an empty-name validation error', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    const nameInput = screen.getByRole('textbox', { name: 'Nombre de la sala' });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));

    expect(screen.getByRole('dialog', { name: 'Crear sala' })).toBeInTheDocument();
    expect(screen.getByText('Ingresa el nombre de la Sala')).toBeInTheDocument();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'create-room-error');
    expect(nameInput).toHaveFocus();
    expect(screen.getByRole('radio', { name: /Privada/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Pública/ })).toBeInTheDocument();
    expect(screen.queryByText('4 salas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Pública/ }));
    expect(screen.getByRole('radio', { name: /Pública/ })).toBeChecked();
    expect(screen.getByText('Ingresa el nombre de la Sala')).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Sala válida' } });
    expect(screen.queryByText('Ingresa el nombre de la Sala')).not.toBeInTheDocument();
    expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(screen.getByRole('heading', { name: 'Sala válida' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('4 salas')).toBeInTheDocument();
  });

  it('validates names made only of spaces when creating a room', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    const nameInput = screen.getByRole('textbox', { name: 'Nombre de la sala' });
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));

    expect(screen.getByText('Ingresa el nombre de la Sala')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '   ' })).not.toBeInTheDocument();
  });

  it('keeps the selected privacy when creating a public room', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la sala' }), { target: { value: 'Sala pública' } });
    fireEvent.click(screen.getByRole('radio', { name: /Pública/ }));

    expect(screen.getByRole('radio', { name: /Pública/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Privada/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Pública/ }).closest('label')).toHaveClass('room-privacy-option-selected');
    expect(screen.getByRole('radio', { name: /Privada/ })).toHaveAttribute('id', 'room-privacy-private');
    expect(screen.getByRole('radio', { name: /Pública/ })).toHaveAttribute('id', 'room-privacy-public');

    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));

    expect(screen.getByRole('heading', { name: 'Sala pública' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sala pública' }).closest('.room-card')).toHaveStyle({ '--room-accent': '#0f766e' });
  });

  it('opens the join room modal with the Figma content and focuses the room ID', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));

    const dialog = screen.getByRole('dialog', { name: 'Unirse a sala' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'join-room-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'join-room-description');
    expect(screen.getByText('Ingresa únicamente el ID de la sala que te compartieron.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ej. CALC-8F2K')).toHaveFocus();
    expect(screen.getByText('No necesitas correo, nombre ni contraseña para unirte desde aquí.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('navigates to the requested room after trimming its ID', () => {
    vi.useFakeTimers();
    renderDashboard('/dashboard', true);
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'ID de la sala' }), { target: { value: ' CALC-8F2K ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));

    expect(screen.getByTestId('location-path')).toHaveTextContent('/salas/CALC-8F2K');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the join modal open for an empty ID and closes it with Escape', () => {
    vi.useFakeTimers();
    renderDashboard('/dashboard', true);
    act(() => vi.advanceTimersByTime(900));

    const joinButton = screen.getByRole('button', { name: '＋ Unirse a sala' });
    fireEvent.click(joinButton);
    const idInput = screen.getByRole('textbox', { name: 'ID de la sala' });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));
    expect(screen.getByRole('dialog', { name: 'Unirse a sala' })).toBeInTheDocument();
    expect(screen.getByText('Ingresa el código de la Sala para continuar')).toBeInTheDocument();
    expect(idInput).toHaveAttribute('aria-invalid', 'true');
    expect(idInput).toHaveAttribute('aria-describedby', 'join-room-error');
    expect(idInput).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the invalid-format error without navigating', () => {
    vi.useFakeTimers();
    renderDashboard('/dashboard', true);
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));
    const idInput = screen.getByRole('textbox', { name: 'ID de la sala' });
    fireEvent.change(idInput, { target: { value: 'ABC-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));

    expect(screen.getByText('El código ingresado no tiene un formato válido')).toBeInTheDocument();
    expect(idInput).toHaveValue('ABC-123');
    expect(idInput).toHaveAttribute('aria-invalid', 'true');
    expect(idInput).toHaveFocus();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/dashboard');

    fireEvent.change(idInput, { target: { value: 'CALC-8F2K' } });
    expect(screen.queryByText('El código ingresado no tiene un formato válido')).not.toBeInTheDocument();
    expect(idInput).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('closes the edit dialog with Escape and restores focus to its menu button', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));
    const menuButton = screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' });

    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar sala' }));
    expect(screen.getByRole('dialog', { name: 'Editar sala' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it('confirms local deletion and shows the empty state after removing every room', () => {
    vi.useFakeTimers();
    renderDashboard();
    act(() => vi.advanceTimersByTime(900));

    const deleteRoom = (roomName: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Más opciones de ${roomName}` }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar sala' }));
      const dialog = screen.getByRole('dialog', { name: '¿Eliminar esta sala?' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'delete-room-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'delete-room-description delete-room-warning');
      expect(dialog).toHaveTextContent(roomName);
      expect(screen.getByRole('heading', { name: '¿Eliminar esta sala?' })).toBeInTheDocument();
      expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar sala' }));
    };

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Cálculo II · Grupo A' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar sala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('heading', { name: 'Cálculo II · Grupo A' })).toBeInTheDocument();

    deleteRoom('Cálculo II · Grupo A');
    expect(screen.getByText('2 salas')).toBeInTheDocument();
    deleteRoom('Arquitectura de software');
    deleteRoom('Proyecto de estructuras');

    expect(screen.getByRole('heading', { name: 'No tienes salas' })).toBeInTheDocument();
    expect(screen.queryByText('2 salas')).not.toBeInTheDocument();
    expect(screen.queryByText('3 salas')).not.toBeInTheDocument();
  });

  it('cleans the loading timer when it unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = renderDashboard();

    unmount();

    expect(() => {
      act(() => vi.advanceTimersByTime(900));
    }).not.toThrow();
  });
});
