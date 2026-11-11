import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PictureInPictureStrip, RoomPage, type Participant } from './RoomPage';

afterEach(cleanup);

function renderRoom(entry = '/salas/CALC-8F2K') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/salas/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoomPage', () => {
  it('adapts the PiP strip from one participant to overflow capacity', () => {
    const makeParticipant = (index: number): Participant => ({
      name: `Participante ${index}`,
      initials: `P${index}`,
      microphone: 'on',
      camera: 'on',
    });
    const { rerender } = render(<PictureInPictureStrip participants={[makeParticipant(1)]} />);

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByText('+1')).not.toBeInTheDocument();

    rerender(<PictureInPictureStrip participants={[1, 2, 3, 4].map(makeParticipant)} />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();

    rerender(<PictureInPictureStrip participants={[1, 2, 3, 4, 5, 6, 7].map(makeParticipant)} />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByRole('region', { name: 'Participantes de la presentación' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByLabelText('3 participantes adicionales')).toBeInTheDocument();
  });

  it('renders the room metadata, participants and media controls', () => {
    renderRoom();

    expect(screen.getByRole('heading', { name: 'Cálculo II · Grupo A' })).toBeInTheDocument();
    expect(screen.getByText('Sala privada · ID CALC-8F2K')).toBeInTheDocument();
    expect(screen.getByText('EN VIVO')).toBeInTheDocument();
    expect(screen.getByText('4 participantes')).toBeInTheDocument();
    const videoStage = screen.getByRole('region', { name: 'Participantes' });
    expect(videoStage).toHaveClass('video-stage');
    expect(within(videoStage).getAllByRole('article')).toHaveLength(4);
    expect(screen.getByRole('article', { name: 'Participante Ana Martínez' })).toHaveClass('participant-card-0', 'participant-card-active');
    expect(screen.getByRole('article', { name: 'Participante Luis Herrera' })).toHaveClass('participant-card-1');
    expect(screen.getByRole('article', { name: 'Participante Mateo Gómez' })).toHaveClass('participant-card-2');
    expect(screen.getByRole('article', { name: 'Participante Laura Díaz' })).toHaveClass('participant-card-3');
    expect(screen.getAllByText('AM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('LH').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MG').length).toBeGreaterThan(0);
    expect(screen.getAllByText('LD').length).toBeGreaterThan(0);
    expect(screen.getByText('Laura Díaz está compartiendo su pantalla')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Colaboración de sala' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En la sala (4)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chat de la sala' })).toBeInTheDocument();
    expect(screen.getByText('Los mensajes son visibles para quienes están en esta sala.')).toBeInTheDocument();
    expect(screen.getByText('¿Revisamos el ejercicio 3?')).toBeInTheDocument();
    expect(screen.getByText('Sí, comparto mis apuntes en un momento.')).toBeInTheDocument();
    expect(screen.getByText('La fórmula del límite está en la página 12.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Mensaje para la sala' })).toHaveAttribute('placeholder', 'Escribe un mensaje para la sala…');
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Silenciar tu micrófono' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Apagar tu cámara' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Compartir pantalla' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Salir' })).toHaveAttribute('href', '/dashboard');
  });

  it('sends a local chat message and ignores empty messages', () => {
    renderRoom();

    const input = screen.getByRole('textbox', { name: 'Mensaje para la sala' });
    const form = input.closest('form');
    expect(form).not.toBeNull();

    fireEvent.change(input, { target: { value: 'Nos vemos en la página 12.' } });
    fireEvent.submit(form!);
    expect(screen.getByText('Nos vemos en la página 12.')).toBeInTheDocument();
    expect(input).toHaveValue('');

    fireEvent.submit(form!);
    expect(screen.getAllByRole('article')).toHaveLength(8);
  });

  it('toggles microphone and camera states across the room views', () => {
    renderRoom();

    fireEvent.click(screen.getByRole('button', { name: 'Silenciar tu micrófono' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tu cámara' }));

    expect(screen.getByRole('button', { name: 'Activar tu micrófono' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Activar tu cámara' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Micrófono silenciado')).toBeInTheDocument();
    expect(screen.getByText('Cámara apagada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de la sala' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver pantalla compartida' }));

    expect(screen.getByText('Tú · Micrófono silenciado · Cámara apagada')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Miniatura de Ana Martínez' })).getByLabelText('Ana Martínez: micrófono apagado, cámara apagada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Activar tu micrófono' }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar tu cámara' }));

    expect(screen.getByRole('button', { name: 'Silenciar tu micrófono' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Apagar tu cámara' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Tú · Micrófono activo · Cámara activa')).toBeInTheDocument();
  });

  it('toggles the collaboration panel from either header control', () => {
    renderRoom();

    const participantsButton = screen.getByRole('button', { name: '♙ Participantes' });
    const chatButton = screen.getByRole('button', { name: '▤ Chat' });
    expect(participantsButton).toHaveAttribute('aria-expanded', 'true');
    expect(chatButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(chatButton);
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();
    expect(participantsButton).toHaveAttribute('aria-expanded', 'false');
    expect(chatButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(participantsButton);
    expect(screen.getByRole('complementary', { name: 'Colaboración de sala' })).toBeInTheDocument();
    expect(participantsButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();
  });

  it('switches to the shared-screen view from the room options menu', () => {
    renderRoom();

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de la sala' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver pantalla compartida' }));

    expect(screen.getByText('Pantalla compartida')).toBeInTheDocument();
    expect(screen.getByText('Laura Díaz está compartiendo su pantalla')).toBeInTheDocument();
    expect(screen.getByText('Cálculo diferencial')).toBeInTheDocument();
    expect(screen.getByText('Ejercicio 3 · Aplicación de límites')).toBeInTheDocument();
    expect(screen.getByText('lim f(x) = (x² − 4) / (x − 2)')).toBeInTheDocument();
    expect(screen.getByText('x → 2')).toBeInTheDocument();
    expect(screen.getByText('Presentando')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeDisabled();

    const stage = screen.getByRole('region', { name: 'Laura Díaz está compartiendo su pantalla' });
    const content = stage.parentElement;
    expect(content).toHaveClass('room-content-screen-share');
    expect(content).not.toHaveClass('room-content-screen-share-panel-open');
    expect(screen.getByRole('button', { name: '♙ Participantes' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '▤ Chat' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '▤ Chat' }));
    expect(screen.getByRole('complementary', { name: 'Colaboración de sala' })).toBeInTheDocument();
    expect(content).toHaveClass('room-content-screen-share-panel-open');
    expect(screen.getByRole('button', { name: '▤ Chat' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();
    expect(content).not.toHaveClass('room-content-screen-share-panel-open');
  });

  it('opens and closes the collaboration panel beside the shared screen', () => {
    renderRoom();

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de la sala' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver pantalla compartida' }));
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '▤ Chat' }));
    const panel = screen.getByRole('complementary', { name: 'Colaboración de sala' });
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En la sala (4)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chat de la sala' })).toBeInTheDocument();
    expect(screen.getByText('¿Revisamos el ejercicio 3?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Mensaje para la sala' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▤ Chat' })).toHaveAttribute('aria-expanded', 'true');

    const input = screen.getByRole('textbox', { name: 'Mensaje para la sala' });
    fireEvent.change(input, { target: { value: 'Mensaje mientras compartimos.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(screen.getByText('Mensaje mientras compartimos.')).toBeInTheDocument();
    expect(input).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▤ Chat' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '♙ Participantes' }));
    expect(screen.getByRole('complementary', { name: 'Colaboración de sala' })).toBeInTheDocument();
    expect(panel).not.toBeNull();
  });

  it('starts and stops a local screen share from the media controls', () => {
    renderRoom();

    fireEvent.click(screen.getByRole('button', { name: 'Compartir pantalla' }));

    expect(screen.getAllByText('Estás compartiendo')).toHaveLength(2);
    expect(screen.getByText('Ana Martínez · Tú')).toBeInTheDocument();
    expect(screen.getByText('Presentando')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Colaboración de sala' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dejar de compartir' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Miniatura de Laura Díaz')?.textContent).not.toContain('Presentando');
    fireEvent.click(screen.getByRole('button', { name: '▤ Chat' }));
    expect(screen.getByRole('complementary', { name: 'Colaboración de sala' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Dejar de compartir' }));

    expect(screen.getByText('EN VIVO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartir pantalla' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '♙ Participantes' }));
    expect(screen.getByRole('complementary', { name: 'Colaboración de sala' })).toBeInTheDocument();
  });

  it('returns to the grid and closes the options menu with Escape', () => {
    renderRoom();

    const moreButton = screen.getByRole('button', { name: 'Más opciones de la sala' });
    fireEvent.click(moreButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver pantalla compartida' }));
    fireEvent.click(moreButton);
    expect(screen.getByRole('menuitem', { name: 'Volver a la cuadrícula' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Volver a la cuadrícula' }));
    expect(screen.getByText('EN VIVO')).toBeInTheDocument();

    fireEvent.click(moreButton);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('uses a generic room name for unknown room ids', () => {
    renderRoom('/salas/ROOM-123');

    expect(screen.getByRole('heading', { name: 'Sala ROOM-123' })).toBeInTheDocument();
    expect(screen.getByText('Sala privada · ID ROOM-123')).toBeInTheDocument();
  });
});
