import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('TeamSpeak frontend', () => {
  it('renders the technical base page', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /salón de estudio colaborativo/i })).toBeInTheDocument();
  });
});
