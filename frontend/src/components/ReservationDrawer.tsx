import React, { useState, useEffect } from 'react';
import type { Seat, Reservation } from '../types';
import { seatsApi, generateIdempotencyKey } from '../services/api';
import { Clock, AlertTriangle, CheckCircle2, CreditCard, X, RefreshCw, Zap, Users, AlertOctagon, ShieldAlert } from 'lucide-react';

interface ReservationDrawerProps {
  seat: Seat | null;
  activeReservation: Reservation | null;
  onClose: () => void;
  onReservationUpdated: () => void;
  onOpenQueue?: () => void;
}

export const ReservationDrawer: React.FC<ReservationDrawerProps> = ({
  seat,
  activeReservation,
  onClose,
  onReservationUpdated,
  onOpenQueue
}) => {
  const [isReserving, setIsReserving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [localReservationId, setLocalReservationId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [forceOutcome, setForceOutcome] = useState<string>('success');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info'; isCollision?: boolean } | null>(null);
  const [confirmedBookingRef, setConfirmedBookingRef] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey());

  useEffect(() => {
    if (activeReservation && seat && activeReservation.seat_id === seat.id) {
      setLocalReservationId(activeReservation.id);
      const now = new Date().getTime();
      const exp = new Date(activeReservation.expires_at).getTime();
      const diff = Math.max(0, Math.floor((exp - now) / 1000));
      setRemainingSeconds(diff);
    } else {
      setLocalReservationId(null);
      setRemainingSeconds(0);
      setConfirmedBookingRef(null);
      setStatusMessage(null);
    }
  }, [activeReservation, seat]);

  // Countdown ticker
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setLocalReservationId(null);
          onReservationUpdated();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds, onReservationUpdated]);

  if (!seat) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isReservedByMe =
    (localReservationId != null || (activeReservation && activeReservation.seat_id === seat.id)) &&
    remainingSeconds > 0;

  // 1-Click Instant Reserve & Confirm
  const handleInstantBook = async () => {
    setIsReserving(true);
    setStatusMessage({ text: 'Step 1/2: Securing atomic Redis lock & 5-minute hold...', type: 'info' });
    try {
      const reserveKey = generateIdempotencyKey();
      const res = await seatsApi.reserve(seat.id, reserveKey);
      const resId = res.reservation_id;
      setLocalReservationId(resId);
      setRemainingSeconds(res.remaining_seconds || 300);

      setIsReserving(false);
      setIsConfirming(true);
      setStatusMessage({ text: 'Step 2/2: Confirming transaction via ACID SELECT ... FOR UPDATE...', type: 'info' });

      const confirmKey = 'conf_' + reserveKey;
      const confRes = await seatsApi.confirm(
        seat.id,
        resId,
        forceOutcome === 'random' ? undefined : forceOutcome,
        confirmKey
      );

      if (confRes.booking_status === 'Confirmed') {
        setConfirmedBookingRef(confRes.booking_reference);
        setStatusMessage({ text: confRes.message, type: 'success' });
      } else {
        setStatusMessage({ text: confRes.message, type: 'error' });
      }
      onReservationUpdated();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Booking failed.';
      const isCollision = err.response?.status === 409 || err.response?.status === 429;
      
      let userFriendlyText = detail;
      if (detail.toLowerCase().includes('permanently booked') || detail.toLowerCase().includes('already booked')) {
        userFriendlyText = `Double-Booking Prevented: Seat ${seat.seat_number} was confirmed by another student just milliseconds before your request. Exactly 1 winner permitted. Your card was NOT charged.`;
      } else if (detail.toLowerCase().includes('currently reserved')) {
        userFriendlyText = `Seat Contention: Another student locked seat ${seat.seat_number} first. Hold is active for up to 5 minutes.`;
      } else if (detail.toLowerCase().includes('expired')) {
        userFriendlyText = `Reservation Expired: Your 5-minute hold on seat ${seat.seat_number} expired before confirmation.`;
      }

      setStatusMessage({ text: userFriendlyText, type: 'error', isCollision });
      onReservationUpdated();
    } finally {
      setIsReserving(false);
      setIsConfirming(false);
    }
  };

  // Step 1: Reserve only
  const handleReserve = async () => {
    setIsReserving(true);
    setStatusMessage({ text: 'Acquiring Redis lock and applying 5-minute hold...', type: 'info' });
    try {
      const key = generateIdempotencyKey();
      setIdempotencyKey(key);
      const res = await seatsApi.reserve(seat.id, key);
      setLocalReservationId(res.reservation_id);
      setRemainingSeconds(res.remaining_seconds || 300);
      setStatusMessage({ text: res.message + ' Please complete payment to permanently lock this seat.', type: 'success' });
      onReservationUpdated();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to reserve seat.';
      const isCollision = err.response?.status === 409;
      setStatusMessage({ text: detail, type: 'error', isCollision });
      onReservationUpdated();
    } finally {
      setIsReserving(false);
    }
  };

  // Step 2: Confirm & Pay
  const handleConfirm = async () => {
    setIsConfirming(true);
    setStatusMessage({ text: 'Processing payment and executing row lock in database...', type: 'info' });
    try {
      const effectiveReservationId = localReservationId || activeReservation?.id;
      const res = await seatsApi.confirm(
        seat.id,
        effectiveReservationId,
        forceOutcome === 'random' ? undefined : forceOutcome,
        idempotencyKey
      );

      if (res.booking_status === 'Confirmed') {
        setConfirmedBookingRef(res.booking_reference);
        setStatusMessage({ text: res.message, type: 'success' });
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
      onReservationUpdated();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Payment or confirmation failed.';
      setStatusMessage({ text: detail, type: 'error' });
      onReservationUpdated();
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      {/* Dark backdrop overlay to focus user attention */}
      <div 
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-700 bg-[#0e0f13] text-neutral-200 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-[#12141a] px-6 py-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-wider text-emerald-400 font-bold">
                Ticket Checkout
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Seat {seat.seat_number} — <span className="text-emerald-400">${Number(seat.price).toFixed(2)}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
          {/* Top Hero Booking Button for Available Seats */}
          {seat.status === 'Available' && !confirmedBookingRef && (
            <div className="rounded-lg border-2 border-emerald-500/80 bg-gradient-to-br from-emerald-950/70 via-neutral-900 to-[#0e0f13] p-4 space-y-3 shadow-lg shadow-emerald-950/40">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 font-mono">
                  ● Seat Ready for Purchase
                </span>
                <span className="text-base font-black text-emerald-400 font-mono">
                  ${Number(seat.price).toFixed(2)}
                </span>
              </div>
              <button
                disabled={isReserving || isConfirming}
                onClick={handleInstantBook}
                className="w-full rounded-md bg-emerald-500 py-3 text-sm font-bold text-black transition-all hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] disabled:bg-neutral-800 disabled:text-neutral-500 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-900/60 cursor-pointer"
              >
                {isReserving || isConfirming ? (
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-black" />
                    <span>Locking Seat & Confirming...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 fill-black" />
                    <span>⚡ Instant 1-Click Book Ticket</span>
                  </div>
                )}
              </button>
              <p className="text-[11px] text-emerald-400/80 text-center font-mono">
                Atomic reserve + payment with zero double bookings
              </p>
            </div>
          )}

          {/* Seat Specification Card */}
          <div className="rounded border border-neutral-800 bg-neutral-900/50 p-4 space-y-2.5 font-mono text-xs">
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Tier / Section</span>
              <span className="font-semibold text-white">{seat.tier}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Coordinates</span>
              <span className="text-neutral-200">Row {seat.row_identifier}, Col {seat.column_number}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Base Price</span>
              <span className="font-bold text-emerald-400">${Number(seat.price).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Current Status</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                  seat.status === 'Available'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/80'
                    : seat.status === 'Reserved'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-600/80'
                    : 'bg-red-950/40 text-red-400 border border-red-900/40'
                }`}
              >
                {seat.status}
              </span>
            </div>
          </div>

          {/* EDGE CASE 1: Seat is ALREADY BOOKED by someone else */}
          {seat.status === 'Booked' && (
          <div className="rounded border border-red-900/60 bg-red-950/20 p-5 space-y-3">
            <div className="flex items-center space-x-2 text-red-400">
              <AlertOctagon className="h-5 w-5 shrink-0" />
              <span className="font-semibold text-sm">Seat Already Booked</span>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Seat <strong>{seat.seat_number}</strong> is already permanently purchased and confirmed by another student. 
              The system strictly enforces zero double bookings:
            </p>
            <div className="rounded bg-black/60 p-3 font-mono text-[11px] space-y-1.5 border border-neutral-800">
              <div className="flex justify-between text-neutral-400">
                <span>LOCK STATUS:</span>
                <span className="text-red-400 font-bold">PERMANENTLY BOOKED</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>STORAGE LEVEL:</span>
                <span className="text-neutral-300">ACID SELECT FOR UPDATE</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>DOUBLE BOOKINGS:</span>
                <span className="text-emerald-400 font-bold">0 (GUARANTEED)</span>
              </div>
            </div>
            <div className="pt-1">
              <p className="text-[11px] text-neutral-400">
                💡 <strong>Tip:</strong> Join the FIFO Waiting Queue to receive immediate priority allocation if this or another seat is cancelled!
              </p>
            </div>
          </div>
        )}

        {/* EDGE CASE 2: Seat is RESERVED by someone else */}
        {seat.status === 'Reserved' && !isReservedByMe && (
          <div className="rounded border border-amber-800/60 bg-amber-950/20 p-5 space-y-3">
            <div className="flex items-center space-x-2 text-amber-400">
              <Clock className="h-5 w-5 shrink-0 animate-pulse" />
              <span className="font-semibold text-sm">Seat Under Active 5-Minute Hold</span>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Another student is currently in checkout for seat <strong>{seat.seat_number}</strong> under an active Redis distributed lock.
            </p>
            <div className="rounded bg-black/60 p-3 font-mono text-[11px] space-y-1.5 border border-neutral-800">
              <div className="flex justify-between text-neutral-400">
                <span>LOCK TYPE:</span>
                <span className="text-amber-400 font-bold">Redis SET NX PX Hold</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>AUTO-EXPIRY:</span>
                <span className="text-neutral-300">300 Seconds (5 mins)</span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400">
              If the student abandons checkout or payment fails, this seat will automatically return to Available or go to the waiting queue.
            </p>
          </div>
        )}

        {/* EDGE CASE 3: Seat is UNAVAILABLE */}
        {seat.status === 'Unavailable' && (
          <div className="rounded border border-neutral-800 bg-neutral-900/40 p-5 space-y-2">
            <div className="flex items-center space-x-2 text-neutral-400 font-semibold text-sm">
              <ShieldAlert className="h-5 w-5" />
              <span>Seat Reserved for Sound / Stage Crew</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Seat <strong>{seat.seat_number}</strong> is allocated for stage acoustics, sound engineering consoles, or venue security.
            </p>
          </div>
        )}

        {/* Confirmed Receipt Box */}
        {confirmedBookingRef && (
          <div className="rounded border border-emerald-900/80 bg-emerald-950/20 p-5 space-y-3">
            <div className="flex items-center space-x-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Booking Confirmed!</span>
            </div>
            <p className="text-xs text-neutral-300">
              Your seat has been permanently locked via database row-level locking (SELECT ... FOR UPDATE).
            </p>
            <div className="rounded bg-black/40 p-3 font-mono text-xs space-y-1">
              <div className="text-neutral-400 text-[11px]">BOOKING REFERENCE</div>
              <div className="text-base font-bold text-white tracking-widest">{confirmedBookingRef}</div>
            </div>
          </div>
        )}

        {/* Active Reservation by Current User */}
        {isReservedByMe && !confirmedBookingRef && (
          <div className="rounded border border-amber-800/80 bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold">
                <Clock className="h-4 w-4" />
                <span>Temporary 5-Minute Hold Active</span>
              </div>
              <span className="font-mono text-sm font-bold text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-700/60">
                {formatTimer(remainingSeconds)}
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Seat is held exclusively by your Redis lock. Click Confirm & Pay to finalize your booking before the timer expires.
            </p>
          </div>
        )}

        {/* Normal Available State: Payment Simulator Controls */}
        {seat.status === 'Available' && !confirmedBookingRef && (
          <div className="rounded border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-300">
              <CreditCard className="h-4 w-4" />
              <span>Payment Simulator Mode</span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Simulates real-world payment gateway latency (1–8s) and non-deterministic outcomes.
            </p>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'success', label: 'Force Success (Demo)' },
                { id: 'random', label: 'Random (70/15/10/5)' },
                { id: 'failure', label: 'Force Decline' },
                { id: 'timeout', label: 'Force Timeout' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setForceOutcome(opt.id)}
                  className={`rounded px-2.5 py-1.5 text-left border text-[11px] transition-colors ${
                    forceOutcome === opt.id
                      ? 'border-neutral-200 bg-neutral-800 text-white font-medium'
                      : 'border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status Notification / Error Message */}
        {statusMessage && (
          <div
            className={`rounded border p-3 text-xs flex flex-col space-y-2 ${
              statusMessage.type === 'success'
                ? 'border-emerald-800/80 bg-emerald-950/20 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'border-red-900/80 bg-red-950/20 text-red-300'
                : 'border-neutral-700 bg-neutral-800/50 text-neutral-300'
            }`}
          >
            <div className="flex items-start space-x-2">
              {statusMessage.type === 'error' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              ) : statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>

            {/* If a collision occurred, provide a 1-click Waiting Queue button right inside the error */}
            {statusMessage.isCollision && onOpenQueue && (
              <button
                onClick={() => {
                  onClose();
                  onOpenQueue();
                }}
                className="mt-2 self-start flex items-center space-x-1.5 rounded bg-amber-500/20 border border-amber-600/80 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Join Waiting Queue for This Seat</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Action Buttons */}
      <div className="border-t border-neutral-800 p-6 space-y-2">
        {/* If Seat is Booked or Reserved by another user: Show Queue & Alternative options */}
        {seat.status === 'Booked' || (seat.status === 'Reserved' && !isReservedByMe) ? (
          <div className="space-y-2">
            {onOpenQueue && (
              <button
                onClick={() => {
                  onClose();
                  onOpenQueue();
                }}
                className="w-full rounded bg-amber-500 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-amber-400 flex items-center justify-center space-x-2 shadow-lg shadow-amber-950/40"
              >
                <Users className="h-4 w-4" />
                <span>Join Waiting Queue (Position Priority)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full rounded border border-neutral-800 py-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              Pick An Available Seat
            </button>
          </div>
        ) : !confirmedBookingRef ? (
          /* Seat is Available or Reserved by Current User */
          <>
            {!isReservedByMe ? (
              <>
                {/* 1-Click Instant Book */}
                <button
                  disabled={isReserving || isConfirming || seat.status !== 'Available'}
                  onClick={handleInstantBook}
                  className="w-full rounded bg-emerald-500 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/40"
                >
                  {isReserving || isConfirming ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>{isReserving ? 'Reserving...' : 'Confirming Booking...'}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 fill-black" />
                      <span>Instant 1-Click Book (${Number(seat.price).toFixed(2)})</span>
                    </>
                  )}
                </button>

                {/* Or Reserve Only (5-Min Hold) */}
                <button
                  disabled={isReserving || isConfirming || seat.status !== 'Available'}
                  onClick={handleReserve}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {isReserving ? 'Reserving...' : 'Reserve (5-Min Hold Only)'}
                </button>
              </>
            ) : (
              /* Already Reserved: Confirm & Pay */
              <button
                disabled={isConfirming || remainingSeconds <= 0}
                onClick={handleConfirm}
                className="w-full rounded bg-emerald-500 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/40"
              >
                {isConfirming ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Processing Transaction...</span>
                  </>
                ) : (
                  <span>Confirm & Pay (${Number(seat.price).toFixed(2)})</span>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full rounded border border-neutral-800 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              Cancel
            </button>
          </>
        ) : (
          /* Booking Confirmed */
          <button
            onClick={onClose}
            className="w-full rounded border border-neutral-800 py-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          >
            Close
          </button>
        )}
      </div>
    </div>
  </>
  );
};
