import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Patients from '../../pages/Patients';

const renderPatients = () =>
  render(
    <MemoryRouter>
      <Patients />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Patients page', () => {
  test('renders patients page heading', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patients: [], total: 0 }),
    });
    renderPatients();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /patients/i })).toBeInTheDocument();
    });
  });

  test('renders search input', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patients: [], total: 0 }),
    });
    renderPatients();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search by name, email, or phone/i)
      ).toBeInTheDocument();
    });
  });

  test('renders Add Patient button', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patients: [], total: 0 }),
    });
    renderPatients();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add patient/i })).toBeInTheDocument();
    });
  });

  test('shows loading spinner when fetching', () => {
    // Never-resolving fetch keeps component in loading state
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
    renderPatients();
    expect(screen.getByText(/loading patients/i)).toBeInTheDocument();
  });

  test('shows error message on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Failed' }),
    });
    renderPatients();
    await waitFor(() => {
      expect(screen.getByText(/failed to fetch patients/i)).toBeInTheDocument();
    });
  });

  test('renders patient rows when data returned', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        patients: [
          {
            id: '1',
            name: 'John Doe',
            email: 'john@test.com',
            phone: '123',
            date_of_birth: '1990-01-01',
            gender: 'male',
            active: true,
          },
        ],
        total: 1,
      }),
    });
    renderPatients();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  test('opens Add Patient modal when Add button clicked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patients: [], total: 0 }),
    });
    renderPatients();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add patient/i })).toBeInTheDocument();
    });

    userEvent.click(screen.getByRole('button', { name: /add patient/i }));

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument();
    });
  });

  test('filters toggle shows/hides filter panel', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patients: [], total: 0 }),
    });
    renderPatients();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    });

    userEvent.click(screen.getByRole('button', { name: /filters/i }));

    await waitFor(() => {
      // Filter panel renders a Gender label — may also appear in dropdown option text
      expect(screen.getAllByText(/gender/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
