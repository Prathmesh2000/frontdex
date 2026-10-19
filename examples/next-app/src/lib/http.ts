import axios from 'axios';

/** Shared axios instance for authenticated admin/account calls. */
export const http = axios.create({ baseURL: '/api', timeout: 10_000, withCredentials: true });

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) window.location.assign('/account?login=1');
    return Promise.reject(err);
  },
);
