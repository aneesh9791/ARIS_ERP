import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../../pages/Dashboard';

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      todayPatients: 5,
      revenueToday: 12000,
      pendingReports: 3,
      activeCenters: 2,
      patients: [],
    }),
  });
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Dashboard page', () => {
  test('renders dashboard heading', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });
  });

  test("renders all 4 stat tiles", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Today's Patients")).toBeInTheDocument();
      expect(screen.getByText('Revenue Today')).toBeInTheDocument();
      expect(screen.getByText('Pending Reports')).toBeInTheDocument();
      expect(screen.getByText('Active Centers')).toBeInTheDocument();
    });
  });

  test('renders Quick Actions section', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });
    expect(screen.getByText('New Patient')).toBeInTheDocument();
    expect(screen.getByText('Create Invoice')).toBeInTheDocument();
  });

  test('renders Recent Patients section', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Recent Patients')).toBeInTheDocument();
    });
  });

  test('Quick Action New Patient link navigates to /patients', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('New Patient')).toBeInTheDocument();
    });
    const newPatientLink = screen.getByText('New Patient').closest('a');
    expect(newPatientLink).toHaveAttribute('href', '/patients');
  });
});
