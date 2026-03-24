import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Equipment from '../../pages/Equipment';

const renderEquipment = () =>
  render(
    <MemoryRouter>
      <Equipment />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Equipment page', () => {
  test('renders Equipment heading', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ equipment: [], total: 0 }),
    });
    renderEquipment();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /equipment/i })).toBeInTheDocument();
    });
  });

  test('renders 4 stat tiles', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        equipment: [],
        total: 0,
        stats: { total: 0, active: 0, maintenance: 0, inactive: 0 },
      }),
    });
    renderEquipment();
    await waitFor(() => {
      expect(screen.getByText('Total Equipment')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('In Maintenance')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });

  test('renders Add Equipment button', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ equipment: [], total: 0 }),
    });
    renderEquipment();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });
  });

  test('renders table headers when equipment data present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        equipment: [
          {
            id: '1',
            name: 'MRI Scanner 3T',
            type: 'MRI',
            center: 'Main Center',
            status: 'active',
            last_maintenance: '2026-01-01',
            next_maintenance: '2026-07-01',
          },
        ],
        total: 1,
        stats: { total: 1, active: 1, maintenance: 0, inactive: 0 },
      }),
    });
    renderEquipment();
    await waitFor(() => {
      expect(screen.getByText('Equipment Name')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Center')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  test('opens add equipment modal on button click', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ equipment: [], total: 0 }),
    });
    renderEquipment();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });

    userEvent.click(screen.getByRole('button', { name: /add equipment/i }));

    await waitFor(() => {
      // Both the button and modal heading contain "add equipment" — check heading specifically
      const headings = screen.getAllByRole('heading', { name: /add equipment/i });
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });
});
