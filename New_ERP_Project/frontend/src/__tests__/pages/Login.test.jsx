import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Login from '../../pages/Login';

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('Login page', () => {
  test('renders login form with email and password fields', () => {
    renderLogin();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('shows error when credentials are invalid', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    renderLogin();

    userEvent.type(screen.getByLabelText(/email address/i), 'bad@test.com');
    userEvent.type(screen.getByLabelText(/^password$/i), 'wrongpass');
    userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  test('disables button while loading', async () => {
    global.fetch.mockImplementationOnce(() => new Promise(() => {}));

    renderLogin();

    userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    userEvent.type(screen.getByLabelText(/^password$/i), 'password');
    userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });

  test('submits form with email field (not username)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'abc',
        user: { id: 1, email: 'admin@test.com', role: 'ADMIN' },
      }),
    });

    renderLogin();

    userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"email"'),
        })
      );
    });
  });

  test('toggles password visibility', async () => {
    renderLogin();

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    userEvent.click(screen.getByRole('button', { name: /toggle password visibility/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'text');
    });
  });

  test('shows network error on fetch failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    renderLogin();

    userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
