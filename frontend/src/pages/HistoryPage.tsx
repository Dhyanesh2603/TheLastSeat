import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingsApi, seatsApi } from '../services/api';
import { CheckCircle2, XCircle, Clock, Ban, RefreshCw } from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const [cancellingSeatId, setCancellingSeatId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: bookingsData, refetch: refetchBookings, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: bookingsApi.list,
  });

  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['my-history'],
    queryFn: bookingsApi.history,
  });

  const handleCancelBooking = async (seatId: number) => {
    if (!window.confirm(`Are you sure you want to cancel booking for Seat #${seatId}? The seat will be released immediately.`)) {
      return;
    }
    setCancellingSeatId(seatId);
    setFeedback(null);
    try {
      const res = await seatsApi.cancel(seatId);
      setFeedback(res.message);
      refetchBookings();
      refetchHistory();
    } catch (err: any) {
      setFeedback(err.response?.data?.detail || 'Failed to cancel booking.');
    } finally {
      setCancellingSeatId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white m-0">My Bookings & Activity</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Confirmed tickets, active reservations, and complete transaction audit history.
          </p>
        </div>
        <button
          onClick={() => { refetchBookings(); refetchHistory(); }}
          className="flex items-center space-x-1.5 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {feedback && (
        <div className="rounded border border-neutral-700 bg-neutral-800/80 p-3 text-xs text-neutral-200">
          {feedback}
        </div>
      )}

      {/* Active Confirmed Tickets Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-mono uppercase tracking-wider text-neutral-400">
          Confirmed Tickets ({bookingsData?.filter(b => b.status === 'Confirmed').length || 0})
        </h2>

        {isLoading ? (
          <div className="rounded border border-neutral-800 p-6 text-center text-xs text-neutral-500 font-mono">
            Loading confirmed tickets...
          </div>
        ) : bookingsData?.filter(b => b.status === 'Confirmed').length === 0 ? (
          <div className="rounded border border-neutral-800/80 bg-[#101115] p-6 text-center text-xs text-neutral-500 font-mono">
            No active confirmed tickets. Reserve a seat from the Seat Map to book.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {bookingsData?.filter(b => b.status === 'Confirmed').map((booking) => (
              <div
                key={booking.id}
                className="rounded border border-neutral-800 bg-[#101115] p-4 space-y-3 shadow-sm hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="font-mono text-sm font-bold text-white">
                    {booking.seat?.seat_number || `Seat #${booking.seat_id}`}
                  </span>
                  <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-bold uppercase">
                    Confirmed
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-neutral-400">
                  <div>
                    <span className="block text-[10px] text-neutral-500">REFERENCE</span>
                    <span className="text-neutral-200 font-bold">{booking.booking_reference}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-500">PAID AMOUNT</span>
                    <span className="text-emerald-400 font-bold">${Number(booking.total_amount).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-500">DATE ISSUED</span>
                    <span className="text-neutral-300">{new Date(booking.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-500">CONCURRENCY INVARIANT</span>
                    <span className="text-neutral-300">1-of-1 Locked</span>
                  </div>
                </div>

                <div className="border-t border-neutral-800/80 pt-2 flex justify-end">
                  <button
                    disabled={cancellingSeatId === booking.seat_id}
                    onClick={() => handleCancelBooking(booking.seat_id)}
                    className="flex items-center space-x-1.5 rounded border border-red-900/60 bg-red-950/20 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900/30 hover:border-red-700 disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>{cancellingSeatId === booking.seat_id ? 'Releasing...' : 'Cancel Booking'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Timeline Section */}
      <div className="space-y-3 pt-4">
        <h2 className="text-sm font-mono uppercase tracking-wider text-neutral-400">
          Full Audit Activity Timeline
        </h2>

        <div className="rounded border border-neutral-800 bg-[#0e0f13] divide-y divide-neutral-800/80 text-xs">
          {historyData?.history && historyData.history.length > 0 ? (
            historyData.history.map((item, idx) => {
              const isBooking = item.type === 'booking';
              const isPayment = item.type === 'payment';
              const isReservation = item.type === 'reservation';

              return (
                <div key={idx} className="flex items-center justify-between p-3.5 hover:bg-neutral-900/30">
                  <div className="flex items-center space-x-3">
                    {isBooking && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    {isPayment && (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    {isReservation && (
                      <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    )}

                    <div>
                      <div className="font-semibold text-neutral-200">{item.title}</div>
                      <div className="font-mono text-[11px] text-neutral-500">
                        {item.seat_number !== 'N/A' && `Seat ${item.seat_number} • `}
                        Status: <span className="text-neutral-400">{item.status}</span>
                        {item.amount && ` • $${Number(item.amount).toFixed(2)}`}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono text-[11px] text-neutral-500">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-neutral-500 font-mono">
              No previous audit activity logged yet.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
