import axios from 'axios';

export const api = axios.create({ baseURL: '/api/v2', headers: { 'X-Client': 'acme-admin' } });

export const fetchUsers = (params) => api.get('/users', { params }).then((r) => r.data);
export const fetchUser = (id) => api.get(`/users/${id}`).then((r) => r.data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data).then((r) => r.data);
export const fetchMetrics = () => api.get('/metrics/summary').then((r) => r.data);
