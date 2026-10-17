import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { seatsApi, reservationsApi, queueApi } from '../services/api';
import type { Seat, Reservation } from '../types';
import { SeatGrid } from '../components/SeatGrid';
import { ReservationDrawer } from '../components/ReservationDrawer';
import { WaitingQueueModal } from '../components/WaitingQueueModal';
import { Users, Clock, Play, Pause, RotateCcw, Zap } from 'lucide-react';

interface SimulationAction {
  id: string;
  time: string;
  student_name: string;
  seat_number: string;
  action: string;
  status: string;
  details?: string;
}

export const StudentDashboard: React.FC = () => {
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);

  // Live Rush Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const simSpeed = 10; // seats per wave
  const [activityFeed, setActivityFeed] = useState<SimulationAction[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const simulationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll seats every 1200ms for live concurrency state
  const { data: seatData, isLoading: isSeatsLoading, refetch: refetchSeats } = useQuery({
    queryKey: ['seats'],
    queryFn: seatsApi.list,
    refetchInterval: 1200,
  });

  // Query active user reservations (Pending or Payment Failed)
  const { data: resData, refetch: refetchReservations } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: reservationsApi.list,
    refetchInterval: 1500,
  });

  // Query waiting queue status
  const { data: queueStatus, refetch: refetchQueue } = useQuery({
    queryKey: ['queue-status'],
    queryFn: queueApi.status,
    refetchInterval: 2500,
  });

  // Find active pending reservation held by this user
  const activeReservation: Reservation | null =
    resData?.reservations?.find(
      (r) => (r.status === 'Pending' || r.status === 'Payment Failed') && !r.is_expired
    ) || null;

  const handleSeatSelected = (seat: Seat) => {
    setSelectedSeat(seat);
  };

  const handleReservationUpdated = () => {
    refetchSeats();
    refetchReservations();
    refetchQueue();
  };

  // Real-time Rush Simulation Engine
  useEffect(() => {
    if (!isSimulating) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      return;
    }

    const runWave = async () => {
      try {
        const res = await seatsApi.simulateRush(simSpeed);
        if (res.actions && res.actions.length > 0) {
          const now = new Date().toLocaleTimeString();
          const newEntries: SimulationAction[] = res.actions.map((act) => ({
            id: Math.random().toString(36).substring(2, 9),
            time: now,
            student_name: act.student_name,
            seat_number: act.seat_number,
            action: act.action,
            status: act.status,
            details: act.details,
          }));

          setActivityFeed((prev) => [...newEntries, ...prev].slice(0, 8));
          refetchSeats();
        }
      } catch (err) {
        console.error('Simulation wave error:', err);
      }
    };

    // Run first wave immediately, then interval
    runWave();
    simulationIntervalRef.current = setInterval(runWave, 1600);

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };
  }, [isSimulating, simSpeed, refetchSeats]);

  const handleResetAllSeats = async () => {
    setIsResetting(true);
    setIsSimulating(false);
    try {
      await seatsApi.resetAll();
      setActivityFeed([]);
      setSelectedSeat(null);
      handleReservationUpdated();
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Quick Book: Finds the best available seat and opens checkout immediately
  const handleQuickBookBestSeat = () => {
    if (!seatData?.seats) return;
    const bestSeat =
      seatData.seats.find((s) => s.status === 'Available' && s.tier === 'VIP') ||
      seatData.seats.find((s) => s.status === 'Available' && s.tier === 'Standard') ||
      seatData.seats.find((s) => s.status === 'Available');

    if (bestSeat) {
      setSelectedSeat(bestSeat);
    }
  };

  const totalSeats = seatData?.total || 500;
  const bookedCount = seatData?.booked_count || 0;
  const availableCount = seatData?.available_count ?? 500;
  const reservedCount = seatData?.reserved_count || 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      
      {/* Sleek Minimal Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-white tracking-tight">Concert Auditorium</h1>
            <span className="text-xs font-mono text-neutral-500">• 500 Seats</span>
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono mt-1 text-neutral-400">
            <span className="flex items-center space-x-1.5 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{availableCount} Available</span>
            </span>
            <span className="text-neutral-700">/</span>
            <span className="flex items-center space-x-1.5 text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>{reservedCount} Held</span>
            </span>
            <span className="text-neutral-700">/</span>
            <span className="flex items-center space-x-1.5 text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500/80" />
              <span>{bookedCount} Booked</span>
            </span>
          </div>
        </div>

        {/* Minimal Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Rush Simulation Toggle */}
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              isSimulating
                ? 'bg-amber-400 text-black hover:bg-amber-300 font-semibold shadow-sm'
                : 'border border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:text-white'
            }`}
          >
            {isSimulating ? (
              <>
                <Pause className="h-3.5 w-3.5 fill-black" />
                <span>Rush Active ({simSpeed}/s)</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Simulate Rush</span>
              </>
            )}
          </button>

          {/* Reset Seats */}
          <button
            disabled={isResetting}
            onClick={handleResetAllSeats}
            title="Reset all seats back to Available"
            className="rounded-md border border-neutral-800 bg-neutral-900 p-2 text-neutral-400 hover:border-neutral-700 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          </button>

          {/* Waiting Queue */}
          <button
            onClick={() => setIsQueueModalOpen(true)}
            className="flex items-center space-x-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-neutral-700 hover:text-white cursor-pointer"
          >
            <Users className="h-3.5 w-3.5 text-amber-400" />
            <span>Queue ({queueStatus?.total_in_queue || 0})</span>
          </button>

          {/* Quick Book */}
          <button
            onClick={handleQuickBookBestSeat}
            disabled={availableCount === 0}
            className="flex items-center space-x-1.5 rounded-md bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 active:scale-95 transition-all disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer shadow-sm"
          >
            <Zap className="h-3.5 w-3.5 fill-black" />
            <span>Quick Book</span>
          </button>
        </div>
      </div>

      {/* Subtle hairline occupancy line */}
      <div className="w-full h-1 rounded-full bg-neutral-800/60 overflow-hidden flex -mt-2">
        <div style={{ width: `${(bookedCount / totalSeats) * 100}%` }} className="bg-red-500/80 transition-all duration-300" />
        <div style={{ width: `${(reservedCount / totalSeats) * 100}%` }} className="bg-amber-400 transition-all duration-300" />
        <div style={{ width: `${(availableCount / totalSeats) * 100}%` }} className="bg-emerald-500 transition-all duration-300" />
      </div>

      {/* Minimal 1-line stream when simulating */}
      {isSimulating && activityFeed.length > 0 && (
        <div className="flex items-center justify-between rounded border border-neutral-800/60 bg-neutral-900/40 px-3 py-1.5 text-[11px] font-mono text-neutral-400 -mt-2">
          <div className="flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-semibold">{activityFeed[0].student_name}</span>
            <span className="text-neutral-500">{activityFeed[0].action}</span>
            <span className="text-amber-400 font-semibold">{activityFeed[0].seat_number}</span>
          </div>
          <span className="text-neutral-600 text-[10px]">{activityFeed[0].time}</span>
        </div>
      )}

      {/* Active Hold Alert Banner (if user holds a seat) */}
      {activeReservation && (
        <div className="flex items-center justify-between rounded border border-amber-800/80 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-amber-400 animate-pulse" />
            <span>
              You have an active hold on <strong>Seat #{activeReservation.seat_id}</strong>. Complete your booking before it expires!
            </span>
          </div>
          <button
            onClick={() => {
              const s = seatData?.seats.find((x) => x.id === activeReservation.seat_id);
              if (s) setSelectedSeat(s);
            }}
            className="rounded bg-amber-500 px-3 py-1 font-semibold text-black hover:bg-amber-400 shadow-sm"
          >
            Complete Booking
          </button>
        </div>
      )}

      {/* Seat Grid View */}
      <div className="rounded-lg border border-neutral-800/80 bg-[#0e0f13] p-4 sm:p-6 shadow-sm">
        <SeatGrid
          seats={seatData?.seats || []}
          selectedSeat={selectedSeat}
          myReservationSeatId={activeReservation?.seat_id || null}
          onSelectSeat={handleSeatSelected}
          isLoading={isSeatsLoading}
        />
      </div>

      {/* Reservation Drawer */}
      {selectedSeat && (
        <ReservationDrawer
          seat={selectedSeat}
          activeReservation={activeReservation}
          onClose={() => setSelectedSeat(null)}
          onReservationUpdated={handleReservationUpdated}
          onOpenQueue={() => setIsQueueModalOpen(true)}
        />
      )}

      {/* Waiting Queue Modal */}
      <WaitingQueueModal
        isOpen={isQueueModalOpen}
        queueStatus={queueStatus || null}
        onClose={() => setIsQueueModalOpen(false)}
        onRefresh={refetchQueue}
        onSelectSeatId={(seatId) => {
          const s = seatData?.seats.find((x) => x.id === seatId);
          if (s) setSelectedSeat(s);
        }}
      />
    </div>
  );
};
