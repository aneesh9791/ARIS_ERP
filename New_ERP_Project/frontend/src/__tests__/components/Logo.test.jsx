import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Logo from '../../components/Common/Logo';

beforeEach(() => {
  localStorage.clear();
});

describe('Logo component', () => {
  test('renders default logo when no config in localStorage', async () => {
    render(<Logo />);
    await waitFor(() => {
      expect(screen.getByText('ARIS')).toBeInTheDocument();
    });
  });

  test('renders custom logo image when customLogo in localStorage', async () => {
    localStorage.setItem('logoConfig', JSON.stringify({
      type: 'custom',
      customLogo: 'data:image/png;base64,abc',
      companyName: 'Test',
      showTagline: false,
    }));

    render(<Logo />);

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc');
    });
  });

  test('accepts size prop without crashing', () => {
    const { container } = render(<Logo size="large" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  test('accepts variant prop without crashing', () => {
    const { container } = render(<Logo variant="sidebar" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
