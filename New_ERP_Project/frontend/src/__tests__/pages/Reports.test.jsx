import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Reports from '../../pages/Reports';

const renderReports = () =>
  render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Reports page', () => {
  test('renders Reports heading', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    renderReports();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reports/i })).toBeInTheDocument();
    });
  });

  test('renders all 5 report type tiles', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    renderReports();
    await waitFor(() => {
      expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    });
    expect(screen.getByText('Financial Reports')).toBeInTheDocument();
    expect(screen.getByText('Customer Analytics')).toBeInTheDocument();
    expect(screen.getByText('Inventory Reports')).toBeInTheDocument();
    expect(screen.getByText('Sales Performance')).toBeInTheDocument();
  });

  test('clicking a tile selects it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('Financial Reports')).toBeInTheDocument();
    });

    const financialTile = screen.getByText('Financial Reports').closest('button');
    userEvent.click(financialTile);

    await waitFor(() => {
      expect(financialTile).toHaveClass('border-teal-600');
    });
  });

  test('renders date range filter', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    renderReports();
    await waitFor(() => {
      // The date range label is "Date Range" and the select element follows it
      expect(screen.getByText('Date Range')).toBeInTheDocument();
    });
    // Also check the select options exist
    expect(screen.getByDisplayValue('Last 30 Days')).toBeInTheDocument();
  });

  test('renders Refresh and Export buttons', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    renderReports();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });
  });

  test('shows loading spinner when fetching', () => {
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
    renderReports();
    // Component starts in loading state immediately
    expect(screen.getByText(/generating report/i)).toBeInTheDocument();
  });

  test('shows error message on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    renderReports();
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
