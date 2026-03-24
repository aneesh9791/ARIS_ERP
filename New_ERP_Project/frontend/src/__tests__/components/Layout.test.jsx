import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../components/Layout';

// Mock Outlet so we don't need actual child routes
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => <div data-testid="outlet" />,
}));

const renderLayout = (initialEntries = ['/dashboard']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Layout />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Layout component', () => {
  test('renders sidebar navigation', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  test('renders ARIS brand in sidebar', () => {
    renderLayout();
    // "ARIS" text appears in the sidebar logo area
    expect(screen.getByText('ARIS')).toBeInTheDocument();
  });

  test('renders all navigation sections', () => {
    renderLayout();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Clinical')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  test('mobile menu button exists', () => {
    renderLayout();
    const hamburger = screen.getByRole('button', { name: /open sidebar/i });
    expect(hamburger).toBeInTheDocument();
  });

  test('shows user logout button', () => {
    renderLayout();
    // The logout button has title="Sign out"
    const logoutButton = screen.getByTitle(/sign out/i);
    expect(logoutButton).toBeInTheDocument();
  });
});
