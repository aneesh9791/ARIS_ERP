import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Billing from '../../pages/Billing';

const renderBilling = () =>
  render(
    <MemoryRouter>
      <Billing />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Billing page', () => {
  test('renders Billing heading', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bills: [],
        total: 0,
        stats: { total_billed: 0, collected: 0, pending: 0, overdue: 0 },
      }),
    });
    renderBilling();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /billing/i })).toBeInTheDocument();
    });
  });

  test('renders 4 stat tiles', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bills: [],
        total: 0,
        stats: { total_billed: 5000, collected: 3000, pending: 1500, overdue: 500 },
      }),
    });
    renderBilling();
    await waitFor(() => {
      expect(screen.getByText('Total Billed')).toBeInTheDocument();
      expect(screen.getByText('Collected')).toBeInTheDocument();
      // "Pending" may appear in both stat tile and filter dropdown — check at least one exists
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Overdue').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('renders New Bill button', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bills: [], total: 0 }),
    });
    renderBilling();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new bill/i })).toBeInTheDocument();
    });
  });

  test('renders billing table headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bills: [
          {
            id: '1',
            patient_name: 'Jane Doe',
            service: 'MRI Scan',
            amount: 2500,
            status: 'pending',
            due_date: '2026-04-01',
          },
        ],
        total: 1,
        stats: { total_billed: 2500, collected: 0, pending: 2500, overdue: 0 },
      }),
    });
    renderBilling();
    await waitFor(() => {
      expect(screen.getByText('Bill #')).toBeInTheDocument();
      expect(screen.getByText('Patient')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      // "Status" may appear in both table header and filter label
      expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  test('opens new bill modal on button click', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bills: [], total: 0 }),
    });
    renderBilling();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new bill/i })).toBeInTheDocument();
    });

    userEvent.click(screen.getByRole('button', { name: /new bill/i }));

    await waitFor(() => {
      // Modal heading — getByRole scopes to headings only, no ambiguity
      expect(screen.getByRole('heading', { name: /new bill/i })).toBeInTheDocument();
    });
  });

  test('shows empty state when no billing data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bills: [],
        total: 0,
        stats: { total_billed: 0, collected: 0, pending: 0, overdue: 0 },
      }),
    });
    renderBilling();
    await waitFor(() => {
      expect(screen.getByText(/no bills found/i)).toBeInTheDocument();
    });
  });
});
