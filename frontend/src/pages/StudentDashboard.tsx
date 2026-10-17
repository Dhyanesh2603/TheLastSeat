import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { seatsApi, reservationsApi, queueApi } from '../services/api';
import type { Seat, Reservation } from '../types';
import { SeatGrid } from '../components/SeatGrid';
import { ReservationDrawer } from '../components/ReservationDrawer';
import { WaitingQueueModal } from '../components/WaitingQueueModal';
import { Users, Clock, Play, Pause, RotateCcw, Zap, Calendar, MapPin, Ticket } from 'lucide-react';

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
      
      {/* 1. Event Hero & Overview Card */}
      <div className="rounded-xl border border-neutral-800 bg-[#101216] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] font-medium text-neutral-300 border border-neutral-700/60">
                CAMPUS LIVE 2026
              </span>
              <span className="flex items-center space-x-1.5 font-mono text-[11px] text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Portal Live • Concurrent Booking</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Annual College Music Concert
            </h1>
            <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
              Reserve your seat with temporary 5-minute atomic holds. Distributed locks guarantee zero double-bookings across 10,000 concurrent students.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleQuickBookBestSeat}
              disabled={availableCount === 0}
              className="flex items-center space-x-1.5 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 active:scale-95 transition-all disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer shadow-sm"
            >
              <Zap className="h-3.5 w-3.5 fill-black" />
              <span>Quick Book Best Seat</span>
            </button>
            <button
              onClick={() => setIsQueueModalOpen(true)}
              className="flex items-center space-x-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-amber-400" />
              <span>Waiting Queue ({queueStatus?.total_in_queue || 0})</span>
            </button>
          </div>
        </div>

        {/* Event Key Details Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-neutral-800/80 text-xs font-mono text-neutral-400">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-neutral-500 shrink-0" />
            <span>Today, 6:00 PM - 10:00 PM</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPin className="h-4 w-4 text-neutral-500 shrink-0" />
            <span>Main Campus Auditorium • 500 Seats</span>
          </div>
          <div className="flex items-center space-x-2">
            <Ticket className="h-4 w-4 text-neutral-500 shrink-0" />
            <span>VIP ($150) • Standard ($75) • Balcony ($45)</span>
          </div>
        </div>
      </div>

      {/* 2. Three-Step Booking Guide Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3.5 space-y-1">
          <div className="flex items-center space-x-2 text-xs font-semibold text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-mono text-neutral-300">
              1
            </span>
            <span>Select Your Seat</span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-normal pl-7">
            Click any available seat below to view tier details and coordinate placement.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3.5 space-y-1">
          <div className="flex items-center space-x-2 text-xs font-semibold text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-mono text-neutral-300">
              2
            </span>
            <span>5-Minute Exclusive Hold</span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-normal pl-7">
            A temporary Redis lock protects your seat while you review payment details.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3.5 space-y-1">
          <div className="flex items-center space-x-2 text-xs font-semibold text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-mono text-neutral-300">
              3
            </span>
            <span>Instant Confirmation</span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-normal pl-7">
            Postgres row-level locks confirm your booking with zero double-booking risk.
          </p>
        </div>
      </div>

      {/* 3. Auditorium Capacity Bar & Rush Simulator Controls */}
      <div className="rounded-lg border border-neutral-800 bg-[#101216] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3 font-mono">
            <span className="text-neutral-400 font-semibold">CAPACITY:</span>
            <span className="text-emerald-400 font-medium">{availableCount} Available</span>
            <span className="text-neutral-600">•</span>
            <span className="text-amber-400 font-medium">{reservedCount} Under Hold</span>
            <span className="text-neutral-600">•</span>
            <span className="text-neutral-400 font-medium">{bookedCount} Confirmed</span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Rush Simulation Toggle */}
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center space-x-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isSimulating
                  ? 'bg-amber-400 text-black font-semibold'
                  : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              {isSimulating ? (
                <>
                  <Pause className="h-3.5 w-3.5 fill-black" />
                  <span>Rush Active (10/s)</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>Simulate Rush</span>
                </>
              )}
            </button>

            {/* Reset Seats Button */}
            <button
              disabled={isResetting}
              onClick={handleResetAllSeats}
              title="Reset seats to available"
              className="rounded border border-neutral-800 bg-neutral-900 p-1.5 text-neutral-400 hover:text-white disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Subtle, non-glowing Capacity Progress Bar */}
        <div className="w-full h-1.5 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden flex">
          <div style={{ width: `${(bookedCount / totalSeats) * 100}%` }} className="bg-neutral-600 transition-all duration-300" title={`${bookedCount} Booked`} />
          <div style={{ width: `${(reservedCount / totalSeats) * 100}%` }} className="bg-amber-500/80 transition-all duration-300" title={`${reservedCount} Held`} />
          <div style={{ width: `${(availableCount / totalSeats) * 100}%` }} className="bg-emerald-600/80 transition-all duration-300" title={`${availableCount} Available`} />
        </div>

        {/* Live Simulation Ticker when running */}
        {isSimulating && activityFeed.length > 0 && (
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-800/60">
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-neutral-200">{activityFeed[0].student_name}</span>
              <span className="text-neutral-500">{activityFeed[0].action}</span>
              <span className="text-white font-semibold">{activityFeed[0].seat_number}</span>
            </div>
            <span className="text-neutral-500 text-[10px]">{activityFeed[0].time}</span>
          </div>
        )}
      </div>

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
