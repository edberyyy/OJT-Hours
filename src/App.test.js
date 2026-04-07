import { render, screen } from '@testing-library/react';
import App from './App';

test('renders OJT Progress header', () => {
  render(<App />);
  expect(screen.getByText(/ojt progress/i)).toBeInTheDocument();
});
