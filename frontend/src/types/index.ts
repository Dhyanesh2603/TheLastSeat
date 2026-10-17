export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export type SeatTier = 'VIP' | 'Standard' | 'Balcony';
export type SeatStatus = 'Available' | 'Reserved' | 'Booked' | 'Unavailable';

export interface Seat {
  id: number;
  seat_number: string;
  row_identifier: string;
  column_number: number;
  tier: SeatTier;
  price: string | number;
  status: SeatStatus;
  version: number;
}

export interface SeatListResponse {
  total: number;
  available_count: number;
  reserved_count: number;
  booked_count: number;
  unavailable_count: number;
  seats: Seat[];
}

export type ReservationStatus = 'Pending' | 'Confirmed' | 'Expired' | 'Cancelled' | 'Payment Failed';

export interface Reservation {
  id: string;
  user_id: string;
  seat_id: number;
  seat?: Seat;
  status: ReservationStatus;
  expires_at: string;
  created_at: string;
  is_expired: boolean;
  remaining_seconds: number;
}

export interface Booking {
  id: string;
  booking_reference: string;
  user_id: string;
  seat_id: number;
  seat?: Seat;
  reservation_id?: string;
  status: 'Confirmed' | 'Cancelled';
  total_amount: string | number;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface BookingHistoryItem {
  id: string;
  type: 'booking' | 'reservation' | 'payment';
  title: string;
  seat_id: number;
  seat_number: string;
  status: string;
  amount?: string | number;
  timestamp: string;
  details?: Record<string, any>;
}

export interface BookingHistoryResponse {
  total_bookings: number;
  active_bookings: number;
  cancelled_bookings: number;
  history: BookingHistoryItem[];
}

export interface Payment {
  id: string;
  transaction_reference: string;
  user_id: string;
  reservation_id: string;
  booking_id?: string;
  amount: string | number;
  currency: string;
  status: 'Pending' | 'Succeeded' | 'Failed' | 'Timeout' | 'Delayed Success';
  simulated_delay_seconds: number;
  failure_reason?: string;
  created_at: string;
}

export interface WaitingQueueStatus {
  is_in_queue: boolean;
  position?: number;
  total_in_queue: number;
  opportunity_seat_id?: number;
  message: string;
}

export interface AdminDashboardStats {
  total_seats: number;
  available_seats: number;
  reserved_seats: number;
  booked_seats: number;
  unavailable_seats: number;
  total_revenue: string | number;
  total_users: number;
  total_bookings: number;
  total_reservations: number;
  active_reservations: number;
  queue_size: number;
  total_payments: number;
  successful_payments: number;
  failed_payments: number;
}

export interface AdminStatsDetailed {
  payment_success_rate_percent: number;
  concurrency_double_booking_count: number;
  active_redis_reservations: number;
  active_waiting_queue_count: number;
  payment_outcome_breakdown: Record<string, number>;
  recent_audit_events: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    user_id?: string;
    metadata?: any;
    created_at: string;
  }>;
}
