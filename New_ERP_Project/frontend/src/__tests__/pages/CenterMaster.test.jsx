import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MasterDataSettings from '../../pages/MasterDataSettings';

const mockCenters = [
  { id: 1, name: 'ARIS Kozhikode', code: 'DLK001', address: 'Beach Road, Kozhikode', contract_type: 'lease', status: 'active', active: true },
  { id: 2, name: 'ARIS Calicut', code: 'CLT002', address: 'MG Road, Calicut', contract_type: 'revenue_share', status: 'inactive', active: false },
];

function mockFetchAll(centersData = mockCenters) {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('/api/center-master'))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, centers: centersData }) });
    if (url.includes('/api/masters/study-master'))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, studyTypes: [] }) });
    if (url.includes('/api/masters/radiologist-master'))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, radiologists: [] }) });
    if (url.includes('/api/masters/user-master'))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, users: [] }) });
    if (url.includes('/api/masters/consumable-master'))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, consumables: [] }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const renderPage = () =>
  render(<MemoryRouter><MasterDataSettings /></MemoryRouter>);

// Click the "Center Master" tab and wait for center data
const openCenterTab = async () => {
  const tab = await screen.findByRole('button', { name: /center master/i });
  await act(async () => { userEvent.click(tab); });
};

// Wait for center table data to appear
const waitForCenters = () => waitFor(() => expect(screen.getByText('ARIS Kozhikode')).toBeInTheDocument(), { timeout: 3000 });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('token', 'test-token-123');
  mockFetchAll();
});

afterEach(() => { localStorage.clear(); });

// ─── Table ──────────────────────────────────────────────────────────────────
describe('Center Master — table', () => {
  test('shows centers in table after clicking Center Master tab', async () => {
    renderPage();
    await openCenterTab();
    await waitForCenters();

    expect(screen.getByText('ARIS Kozhikode')).toBeInTheDocument();
    expect(screen.getByText('DLK001')).toBeInTheDocument();
    expect(screen.getByText('ARIS Calicut')).toBeInTheDocument();
  });

  test('shows Active and Inactive badges', async () => {
    renderPage();
    await openCenterTab();
    await waitForCenters();

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  test('shows empty state when no centers', async () => {
    mockFetchAll([]);
    renderPage();
    await openCenterTab();

    await waitFor(() => expect(screen.getByText(/no centers found/i)).toBeInTheDocument());
  });
});

// ─── Add ────────────────────────────────────────────────────────────────────
describe('Center Master — Add', () => {
  const openAddModal = async () => {
    renderPage();
    await openCenterTab();
    await waitForCenters();
    await act(async () => {
      userEvent.click(screen.getByRole('button', { name: /\+ add center/i }));
    });
    await waitFor(() => expect(screen.getByText('Add Center')).toBeInTheDocument());
  };

  test('opens modal when Add Center is clicked', async () => {
    await openAddModal();
    expect(screen.getByPlaceholderText(/e\.g\. ARIS Kozhikode/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. DLK001/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/full address/i)).toBeInTheDocument();
  });

  test('shows validation errors on empty submit', async () => {
    await openAddModal();
    await act(async () => {
      userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Center Name is required')).toBeInTheDocument();
      expect(screen.getByText('Center Code is required')).toBeInTheDocument();
      expect(screen.getByText('Address is required')).toBeInTheDocument();
      expect(screen.getByText('Contract Type is required')).toBeInTheDocument();
    });
  });

  test('shows duplicate code error', async () => {
    await openAddModal();
    await act(async () => {
      userEvent.type(screen.getByPlaceholderText(/e\.g\. ARIS Kozhikode/i), 'New Center');
      userEvent.type(screen.getByPlaceholderText(/e\.g\. DLK001/i), 'DLK001'); // duplicate
      userEvent.type(screen.getByPlaceholderText(/full address/i), 'Some Address');
      userEvent.selectOptions(screen.getByDisplayValue('Select contract type'), 'lease');
      userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Center Code already exists')).toBeInTheDocument()
    );
  });

  test('calls POST API with correct data on valid submit', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })  // initial load - study
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, radiologists: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })  // centers
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, users: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, consumables: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, center: { id: 99 } }) }) // POST
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) }); // refetch

    await openAddModal();

    await act(async () => {
      userEvent.type(screen.getByPlaceholderText(/e\.g\. ARIS Kozhikode/i), 'Brand New Center');
      userEvent.type(screen.getByPlaceholderText(/e\.g\. DLK001/i), 'BNC999');
      userEvent.type(screen.getByPlaceholderText(/full address/i), 'Test Street');
      userEvent.selectOptions(screen.getByDisplayValue('Select contract type'), 'lease');
      userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body);
      expect(body.name).toBe('Brand New Center');
      expect(body.code).toBe('BNC999');
    });
  });

  test('Cancel closes modal without saving', async () => {
    await openAddModal();
    await act(async () => {
      userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });

    await waitFor(() =>
      expect(screen.queryByText('Add Center')).not.toBeInTheDocument()
    );
    // no POST was made
    expect(global.fetch.mock.calls.find(c => c[1]?.method === 'POST')).toBeUndefined();
  });
});

// ─── Edit ────────────────────────────────────────────────────────────────────
describe('Center Master — Edit', () => {
  const openEditModal = async () => {
    renderPage();
    await openCenterTab();
    await waitForCenters();
    const row = screen.getByText('ARIS Kozhikode').closest('tr');
    await act(async () => {
      userEvent.click(within(row).getByRole('button', { name: /edit/i }));
    });
    await waitFor(() => expect(screen.getByText('Edit Center')).toBeInTheDocument());
  };

  test('opens Edit modal pre-filled with center data', async () => {
    await openEditModal();
    expect(screen.getByDisplayValue('ARIS Kozhikode')).toBeInTheDocument();
    expect(screen.getByDisplayValue('DLK001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Beach Road, Kozhikode')).toBeInTheDocument();
  });

  test('calls PUT with updated data', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, radiologists: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, users: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, consumables: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // PUT
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) }); // refetch

    await openEditModal();

    await act(async () => {
      userEvent.selectOptions(screen.getByDisplayValue('Active'), 'inactive');
      userEvent.click(screen.getByRole('button', { name: /^update$/i }));
    });

    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(c => c[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      expect(putCall[0]).toContain('/api/center-master/1');
      expect(JSON.parse(putCall[1].body).status).toBe('inactive');
    });
  });

  test('shows inline error when update fails', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, radiologists: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, users: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, consumables: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Server error' }) }); // PUT fails

    await openEditModal();

    await act(async () => {
      userEvent.click(screen.getByRole('button', { name: /^update$/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Server error')).toBeInTheDocument()
    );
    // Modal stays open
    expect(screen.getByText('Edit Center')).toBeInTheDocument();
  });
});

// ─── Delete ──────────────────────────────────────────────────────────────────
describe('Center Master — Delete', () => {
  test('calls DELETE API when confirmed', async () => {
    window.confirm = jest.fn(() => true);
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, radiologists: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: mockCenters }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, users: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, consumables: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // DELETE
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, centers: [mockCenters[1]] }) }); // refetch

    renderPage();
    await openCenterTab();
    await waitForCenters();

    const row = screen.getByText('ARIS Kozhikode').closest('tr');
    await act(async () => {
      userEvent.click(within(row).getByRole('button', { name: /delete/i }));
    });

    await waitFor(() => {
      const del = global.fetch.mock.calls.find(c => c[1]?.method === 'DELETE');
      expect(del).toBeDefined();
      expect(del[0]).toContain('/api/center-master/1');
    });
  });

  test('does NOT call DELETE when confirmation is cancelled', async () => {
    window.confirm = jest.fn(() => false);

    renderPage();
    await openCenterTab();
    await waitForCenters();

    const row = screen.getByText('ARIS Kozhikode').closest('tr');
    await act(async () => {
      userEvent.click(within(row).getByRole('button', { name: /delete/i }));
    });

    await waitFor(() => {
      expect(global.fetch.mock.calls.find(c => c[1]?.method === 'DELETE')).toBeUndefined();
    });
  });
});
