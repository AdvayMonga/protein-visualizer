import { render, screen } from '@testing-library/react';
import App from './App';

// The 3D canvas needs WebGL, which jsdom does not provide, so these cover the
// pre-load state only. Rendering logic is tested through the geometry helpers.
test('renders the app title', () => {
  render(<App />);

  expect(screen.getByText(/Protein Structure Visualizer/i)).toBeInTheDocument();
});

test('shows an empty state before any file is loaded', () => {
  render(<App />);

  expect(screen.getByText(/No protein loaded/i)).toBeInTheDocument();
});

test('does not show the structure panel before a file is loaded', () => {
  render(<App />);

  expect(screen.queryByText(/Total Atoms:/i)).not.toBeInTheDocument();
});
