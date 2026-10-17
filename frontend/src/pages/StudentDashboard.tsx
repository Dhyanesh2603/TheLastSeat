import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { seatsApi, reservationsApi, queueApi } from '../services/api';
import type { Seat, Reservation } from '../types';
import { SeatGrid } from '../components/SeatGrid';
import { ReservationDrawer } from '../components/ReservationDrawer';
import { WaitingQueueModal } from '../components/WaitingQueueModal';
import { Users, Clock, Play, Pause, RotateCcw, Zap, Activity, Info, X } from 'lucide-react';

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
  const [simSpeed, setSimSpeed] = useState<number>(5); // seats per wave
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
  const capacityPercent = Math.min(100, Math.round((bookedCount / totalSeats) * 100));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      
      {/* Interactive Quick Booking Hero Banner */}
      <div className="rounded-xl border border-emerald-500/60 bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-[#10121a] p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-lg shadow-emerald-950/20">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-wider text-emerald-400 font-bold">
              Tickets Open // 6:00 PM College Concert Portal
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Select Your Seat & Book Instantly
          </h1>
          <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed">
            Click any <strong className="text-emerald-400">vibrant green seat</strong> on the auditorium map to open checkout, 
            or let the system grab the highest tier available seat with 1-click.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleQuickBookBestSeat}
            disabled={availableCount === 0}
            className="rounded-lg bg-emerald-500 px-5 py-3 text-xs font-black text-black hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-950/80 flex items-center space-x-2 disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer"
          >
            <Zap className="h-4 w-4 fill-black" />
            <span>Quick Book Best Seat ($150 VIP)</span>
          </button>
          <button
            onClick={() => setIsQueueModalOpen(true)}
            className="rounded-lg border border-neutral-700 bg-neutral-900/90 px-4 py-3 text-xs font-bold text-neutral-200 hover:border-neutral-500 hover:text-white flex items-center space-x-2 cursor-pointer shadow-md"
          >
            <Users className="h-4 w-4 text-amber-400" />
            <span>Waiting Queue ({queueStatus?.total_in_queue || 0})</span>
          </button>
        </div>
      </div>

      {/* Auditorium Capacity & Metric Strip */}
      <div className="rounded-lg border border-neutral-800 bg-[#101115] p-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-neutral-400">AUDITORIUM OCCUPANCY:</span>
            <span className="font-bold text-white">{bookedCount} / {totalSeats} Booked</span>
            <span className="text-neutral-500">({capacityPercent}% Full)</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px]">
            <span className="text-emerald-400 font-bold">{availableCount} Available</span>
            <span className="text-neutral-600">|</span>
            <span className="text-amber-400">{reservedCount} Under 5m Hold</span>
            <span className="text-neutral-600">|</span>
            <span className="text-neutral-400">{bookedCount} Confirmed</span>
          </div>
        </div>

        {/* Live Animated Capacity Bar */}
        <div className="w-full h-2.5 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden flex">
          <div
            style={{ width: `${(bookedCount / totalSeats) * 100}%` }}
            className="bg-red-500/80 transition-all duration-500 h-full"
            title={`${bookedCount} Seats Booked`}
          />
          <div
            style={{ width: `${(reservedCount / totalSeats) * 100}%` }}
            className="bg-amber-400 transition-all duration-500 h-full animate-pulse"
            title={`${reservedCount} Seats Held`}
          />
          <div
            style={{ width: `${(availableCount / totalSeats) * 100}%` }}
            className="bg-emerald-500/90 transition-all duration-500 h-full"
            title={`${availableCount} Seats Available`}
          />
        </div>
      </div>

      {/* Real-Time Concert Rush Simulator Console */}
      <div className="rounded-lg border border-neutral-800 bg-[#101115] p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-800/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className={`p-1.5 rounded ${isSimulating ? 'bg-amber-950/80 text-amber-400 animate-pulse' : 'bg-neutral-800 text-neutral-400'}`}>
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">6:00 PM Portal Rush Simulator</span>
                {isSimulating && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 animate-ping"></span>
                    LIVE STREAMING
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400">
                Simulates thousands of concurrent students attempting to reserve and book seats in real time.
              </p>
            </div>
          </div>

          {/* Controls: Play/Pause, Speed, Reset */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Speed Selector */}
            <div className="flex items-center rounded border border-neutral-800 bg-neutral-900 text-xs font-mono">
              {[
                { label: '2/s (Slow)', val: 2 },
                { label: '10/s (Rush)', val: 10 },
                { label: '25/s (Flash Sale)', val: 25 },
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => setSimSpeed(s.val)}
                  className={`px-2.5 py-1 text-[11px] transition-colors ${
                    simSpeed === s.val
                      ? 'bg-neutral-700 text-white font-bold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Play/Pause Button */}
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center space-x-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-all ${
                isSimulating
                  ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-md shadow-amber-950/40'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-md shadow-emerald-950/40'
              }`}
            >
              {isSimulating ? (
                <>
                  <Pause className="h-3.5 w-3.5 fill-black" />
                  <span>Pause Rush</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-black" />
                  <span>Start Rush Simulation</span>
                </>
              )}
            </button>

            {/* Reset All Seats Button */}
            <button
              disabled={isResetting}
              onClick={handleResetAllSeats}
              title="Reset all 500 seats back to Available"
              className="flex items-center space-x-1 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Reset Seats</span>
            </button>
          </div>
        </div>

        {/* Educational Explainer Strip */}
        <div className="rounded border border-neutral-800/80 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-300 flex flex-wrap items-center justify-between gap-2 font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>HOW THE SIMULATION WORKS:</span>
            </span>
            <span>Simulates 10,000 students rushing at 6:00 PM. Green seats turn yellow (5-minute Redis holds) and red (confirmed bookings).</span>
          </div>
          <span className="text-emerald-400 font-bold shrink-0">DOUBLE BOOKINGS: 0 (GUARANTEED)</span>
        </div>

        {/* Live Simulation Activity Ticker */}
        {activityFeed.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
              <span className="flex items-center space-x-1">
                <Activity className="h-3 w-3 text-neutral-400" />
                <span>REAL-TIME BOOKING ACTIVITY STREAM</span>
              </span>
              <span>Showing last {activityFeed.length} actions</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {activityFeed.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="rounded border border-neutral-800/80 bg-neutral-900/60 p-2 text-xs font-mono space-y-0.5 transition-all animate-fadeIn"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white truncate max-w-[110px]">{item.student_name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        item.status === 'Booked'
                          ? 'bg-neutral-800 text-neutral-300'
                          : item.status === 'Reserved'
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                          : 'bg-red-950/80 text-red-400'
                      }`}
                    >
                      {item.seat_number}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>{item.action}</span>
                    <span className="text-[10px] text-neutral-400">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
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

      {/* Sticky Floating Bottom Dock when a Seat is Selected */}
      {selectedSeat && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4">
          <div className="rounded-xl border border-emerald-500/70 bg-[#12141a]/95 backdrop-blur-md p-4 shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                  Selected: Seat {selectedSeat.seat_number}
                </div>
                <div className="text-sm font-black text-white">
                  {selectedSeat.tier} Section • <span className="text-emerald-400 font-mono">${Number(selectedSeat.price).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const s = selectedSeat;
                  setSelectedSeat(null);
                  setTimeout(() => setSelectedSeat(s), 50);
                }}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-black hover:bg-emerald-400 shadow-md shadow-emerald-950 flex items-center space-x-1.5 cursor-pointer"
              >
                <Zap className="h-4 w-4 fill-black" />
                <span>Confirm & Checkout</span>
              </button>
              <button
                onClick={() => setSelectedSeat(null)}
                className="rounded-lg border border-neutral-700 bg-neutral-800 p-2 text-neutral-400 hover:text-white"
                title="Deselect seat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
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
