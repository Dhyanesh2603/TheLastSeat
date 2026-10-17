import axios from 'axios';
import type {
  User,
  Seat,
  SeatListResponse,
  Reservation,
  Booking,
  BookingHistoryResponse,
  WaitingQueueStatus,
  AdminDashboardStats,
  AdminStatsDetailed
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('concert_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function generateIdempotencyKey(): string {
  return 'idemp_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
}

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiClient.post<{ access_token: string; user: User }>('/auth/login', { email, password });
    return res.data;
  },
  register: async (email: string, password: string, fullName: string, role = 'student') => {
    const res = await apiClient.post<User>('/auth/register', { email, password, full_name: fullName, role });
    return res.data;
  },
  getMe: async () => {
    const res = await apiClient.get<User>('/auth/me');
    return res.data;
  },
};

export const seatsApi = {
  list: async () => {
    const res = await apiClient.get<SeatListResponse>('/seats');
    return res.data;
  },
  get: async (seatId: number) => {
    const res = await apiClient.get<Seat>(`/seats/${seatId}`);
    return res.data;
  },
  reserve: async (seatId: number, idempotencyKey?: string) => {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await apiClient.post(`/seats/${seatId}/reserve`, {}, { headers });
    return res.data;
  },
  confirm: async (seatId: number, reservationId?: string, forceOutcome?: string, idempotencyKey?: string) => {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await apiClient.post(
      `/seats/${seatId}/confirm`,
      { reservation_id: reservationId, force_outcome: forceOutcome },
      { headers }
    );
    return res.data;
  },
  cancel: async (seatId: number) => {
    const res = await apiClient.delete(`/seats/${seatId}/cancel`);
    return res.data;
  },
  simulateRush: async (batchSize = 5) => {
    const res = await apiClient.post<{ status: string; wave_size: number; actions: any[] }>(
      `/seats/simulate-rush?batch_size=${batchSize}`
    );
    return res.data;
  },
  resetAll: async () => {
    const res = await apiClient.post<{ message: string; total_available: number }>('/seats/reset-all');
    return res.data;
  },
};

export const reservationsApi = {
  list: async () => {
    const res = await apiClient.get<{ total: number; reservations: Reservation[] }>('/reservations');
    return res.data;
  },
  get: async (id: string) => {
    const res = await apiClient.get<Reservation>(`/reservations/${id}`);
    return res.data;
  },
};

export const bookingsApi = {
  list: async () => {
    const res = await apiClient.get<Booking[]>('/bookings');
    return res.data;
  },
  history: async () => {
    const res = await apiClient.get<BookingHistoryResponse>('/bookings/history');
    return res.data;
  },
};

export const queueApi = {
  join: async (seatId?: number) => {
    const res = await apiClient.post<WaitingQueueStatus>('/queue/join', { seat_id: seatId });
    return res.data;
  },
  status: async () => {
    const res = await apiClient.get<WaitingQueueStatus>('/queue/status');
    return res.data;
  },
};

export const adminApi = {
  getDashboard: async () => {
    const res = await apiClient.get<AdminDashboardStats>('/admin/dashboard');
    return res.data;
  },
  getStats: async () => {
    const res = await apiClient.get<AdminStatsDetailed>('/admin/stats');
    return res.data;
  },
  getPayments: async () => {
    const res = await apiClient.get('/admin/payments');
    return res.data;
  },
  getQueue: async () => {
    const res = await apiClient.get('/admin/queue');
    return res.data;
  },
  simulateBurst: async (seatId: number, concurrencyLevel = 25) => {
    const res = await apiClient.post('/admin/simulate-concurrency-burst', null, {
      params: { seat_id: seatId, concurrency_level: concurrencyLevel }
    });
    return res.data;
  }
};

export const healthApi = {
  getHealth: async () => {
    const res = await apiClient.get('/health');
    return res.data;
  },
};
