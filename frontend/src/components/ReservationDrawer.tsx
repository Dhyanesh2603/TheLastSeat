import React, { useState, useEffect } from 'react';
import type { Seat, Reservation } from '../types';
import { seatsApi, generateIdempotencyKey } from '../services/api';
import { Clock, AlertTriangle, CheckCircle2, X, RefreshCw, Zap, Users, AlertOctagon } from 'lucide-react';

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
        <div className="flex items-center justify-between border-b border-neutral-800 bg-[#111317] px-6 py-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                Ticket Checkout
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">
              Seat {seat.seat_number} - <span className="text-neutral-200">${Number(seat.price).toFixed(2)}</span>
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
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          {/* Seat Summary Card */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2.5 font-mono text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Section</span>
              <span className="font-semibold text-white">{seat.tier} Tier</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Location</span>
              <span className="text-neutral-200">Row {seat.row_identifier}, Seat {seat.column_number}</span>
            </div>
            <div className="flex justify-between text-neutral-400 pt-2 border-t border-neutral-800/80">
              <span>Ticket Price</span>
              <span className="font-bold text-emerald-400 text-sm">${Number(seat.price).toFixed(2)}</span>
            </div>
          </div>

          {/* EDGE CASE: Seat is BOOKED by someone else */}
          {seat.status === 'Booked' && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-4 space-y-3">
              <div className="flex items-center space-x-2 text-red-400">
                <AlertOctagon className="h-4 w-4 shrink-0" />
                <span className="font-semibold text-xs">Seat Already Booked</span>
              </div>
              <p className="text-xs text-neutral-300">
                Seat <strong>{seat.seat_number}</strong> was confirmed by another attendee.
              </p>
              {onOpenQueue && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenQueue();
                  }}
                  className="w-full rounded bg-amber-500 py-2 text-xs font-semibold text-black hover:bg-amber-400 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Join Waiting Queue</span>
                </button>
              )}
            </div>
          )}

          {/* EDGE CASE: Seat is RESERVED by someone else */}
          {seat.status === 'Reserved' && !isReservedByMe && (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center space-x-2 text-amber-400">
                <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                <span className="font-semibold text-xs">Under 5-Minute Hold</span>
              </div>
              <p className="text-xs text-neutral-300">
                Another student is in checkout. If abandoned or payment fails, it will release automatically.
              </p>
              {onOpenQueue && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenQueue();
                  }}
                  className="w-full rounded bg-amber-500 py-2 text-xs font-semibold text-black hover:bg-amber-400 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Join Waiting Queue</span>
                </button>
              )}
            </div>
          )}

          {/* Confirmed Receipt Box */}
          {confirmedBookingRef && (
            <div className="rounded-lg border border-emerald-900/80 bg-emerald-950/20 p-4 space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-semibold text-xs">Booking Confirmed</span>
              </div>
              <div className="rounded bg-black/40 p-2.5 font-mono text-xs space-y-0.5">
                <div className="text-neutral-500 text-[10px]">REFERENCE NUMBER</div>
                <div className="text-sm font-bold text-white tracking-widest">{confirmedBookingRef}</div>
              </div>
            </div>
          )}

          {/* Active 5-min hold by current user */}
          {isReservedByMe && !confirmedBookingRef && (
            <div className="rounded-lg border border-amber-800/80 bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 text-amber-400 font-semibold">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Your Hold Active</span>
                </div>
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-700/60">
                  {formatTimer(remainingSeconds)}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Seat reserved exclusively. Confirm payment before timer expires.
              </p>
            </div>
          )}

          {/* Payment Simulator Selector (Only when Available) */}
          {seat.status === 'Available' && !confirmedBookingRef && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Payment Simulation</span>
                <span className="font-mono text-[10px] text-neutral-500">Gateway Mode</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                {[
                  { id: 'success', label: 'Success' },
                  { id: 'random', label: 'Random' },
                  { id: 'failure', label: 'Decline' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setForceOutcome(opt.id)}
                    className={`rounded px-2 py-1 text-center border text-[11px] transition-colors cursor-pointer ${
                      forceOutcome === opt.id
                        ? 'border-neutral-200 bg-neutral-800 text-white font-medium'
                        : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`rounded-lg border p-3 text-xs flex items-start space-x-2 ${
                statusMessage.type === 'success'
                  ? 'border-emerald-800/80 bg-emerald-950/20 text-emerald-300'
                  : statusMessage.type === 'error'
                  ? 'border-red-900/80 bg-red-950/20 text-red-300'
                  : 'border-neutral-700 bg-neutral-800/50 text-neutral-300'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              ) : statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="border-t border-neutral-800 p-5 space-y-2">
          {seat.status === 'Booked' || (seat.status === 'Reserved' && !isReservedByMe) ? (
            <button
              onClick={onClose}
              className="w-full rounded border border-neutral-800 py-2.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white cursor-pointer"
            >
              Choose Another Seat
            </button>
          ) : !confirmedBookingRef ? (
            <>
              {!isReservedByMe ? (
                <>
                  <button
                    disabled={isReserving || isConfirming || seat.status !== 'Available'}
                    onClick={handleInstantBook}
                    className="w-full rounded-md bg-white py-2.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-neutral-200 active:scale-95 disabled:bg-neutral-800 disabled:text-neutral-500 flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
                  >
                    {isReserving || isConfirming ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-black" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 fill-black" />
                        <span>Book Seat (${Number(seat.price).toFixed(2)})</span>
                      </>
                    )}
                  </button>
                  <button
                    disabled={isReserving || isConfirming || seat.status !== 'Available'}
                    onClick={handleReserve}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 py-2 text-xs font-medium text-neutral-300 hover:border-neutral-500 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    {isReserving ? 'Holding...' : 'Hold for 5 Minutes'}
                  </button>
                </>
              ) : (
                <button
                  disabled={isConfirming || remainingSeconds <= 0}
                  onClick={handleConfirm}
                  className="w-full rounded-md bg-white py-2.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-neutral-200 active:scale-95 disabled:bg-neutral-800 disabled:text-neutral-500 flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
                >
                  {isConfirming ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin text-black" />
                      <span>Processing Payment...</span>
                    </>
                  ) : (
                    <span>Confirm & Pay (${Number(seat.price).toFixed(2)})</span>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full rounded border border-neutral-800 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full rounded border border-neutral-800 py-2.5 text-xs text-neutral-200 hover:bg-neutral-800 hover:text-white cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
    </div>
  </>
  );
};
