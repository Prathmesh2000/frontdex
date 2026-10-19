import { render } from '@testing-library/react';
import { Button } from './Button';

test('renders its label', () => {
  render(<Button>Save</Button>);
});
