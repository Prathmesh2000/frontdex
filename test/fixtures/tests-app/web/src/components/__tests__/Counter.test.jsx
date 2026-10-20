import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import Counter from '../Counter';
import { useToggle } from '../../hooks/useToggle';

describe('Counter', () => {
  it('starts at zero', () => {
    render(<Counter />);
    expect(screen.getByTestId('counter-value').textContent).toBe('0');
  });

  describe('when clicked', () => {
    test('increments', () => {
      render(<Counter />);
      fireEvent.click(screen.getByRole('button', { name: 'Increment' }));
      expect(screen.getByTestId('counter-value').textContent).toBe('1');
    });
  });
});

test('useToggle flips', () => {
  const { result } = renderHook(() => useToggle());
  expect(result.current[0]).toBe(false);
});
