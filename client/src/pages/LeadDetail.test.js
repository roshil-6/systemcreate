import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import LeadDetail from './LeadDetail';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({
  useParams: jest.fn(),
  useNavigate: () => jest.fn(),
}));

describe('Lead detail initialization', () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    sessionStorage.clear();
    useAuth.mockReturnValue({ user: { id: 7, role: 'ADMIN' } });
    axios.get.mockImplementation(async (url) => ({
      data: url.endsWith('/comments') || url.endsWith('/staff/list')
        ? []
        : { id: 105378, name: 'Regression lead', assigned_staff_id: 7 },
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  test.each(['105378', 'new'])('opens lead route %s without an initialization crash', async (id) => {
    useParams.mockReturnValue({ id });
    await act(async () => root.render(<LeadDetail />));
    expect(container.textContent).toContain(id === 'new' ? 'Create New Lead' : 'Regression lead');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/leads/staff/list'), expect.any(Object)
    );
  });
});
