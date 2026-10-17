import React from 'react';
import { CheckCircle2, XCircle, Ticket, Users, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PaymentSuccessModalProps {
  isOpen: boolean;
  bookingReference: string | null;
  seatNumber: string;
  tier: string;
  amount: number;
  onClose: () => void;
}

export const PaymentSuccessModal: React.FC<PaymentSuccessModalProps> = ({
  isOpen,
  bookingReference,
  seatNumber,
  tier,
  amount,
  onClose,
}) => {
  const navigate = useNavigate();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-[#12141a] p-6 text-neutral-100 shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/80 border border-emerald-600/60 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Payment Successful!</h2>
          <p className="text-xs text-neutral-400">
            Your concert ticket has been permanently confirmed via ACID row-level locking.
          </p>
        </div>

        {/* Ticket Receipt Card */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 font-mono text-xs space-y-2.5">
          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-500">Booking Reference</span>
            <span className="font-bold text-white tracking-wider">{bookingReference || 'BKG-CONFIRMED'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Seat Number</span>
            <span className="font-semibold text-emerald-400">Seat {seatNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Tier / Section</span>
            <span className="text-neutral-200">{tier}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-800 pt-2 text-sm">
            <span className="text-neutral-400">Total Paid</span>
            <span className="font-bold text-white">${Number(amount).toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              onClose();
              navigate('/history');
            }}
            className="w-full flex items-center justify-center space-x-2 rounded-lg bg-white py-2.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            <Ticket className="h-4 w-4" />
            <span>View in My Bookings</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

interface PaymentDeclinedModalProps {
  isOpen: boolean;
  seatNumber: string;
  reason?: string;
  onClose: () => void;
  onJoinQueue?: () => void;
  onPickAnother: () => void;
}

export const PaymentDeclinedModal: React.FC<PaymentDeclinedModalProps> = ({
  isOpen,
  seatNumber,
  reason,
  onClose,
  onJoinQueue,
  onPickAnother,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-[#12141a] p-6 text-neutral-100 shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-950/80 border border-red-600/60 text-red-400">
            <XCircle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Payment Declined</h2>
          <p className="text-xs text-neutral-400">
            {reason || 'Your payment transaction was declined or timed out.'}
          </p>
        </div>

        {/* Explanation Note */}
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3.5 text-xs text-neutral-300 space-y-1 font-mono">
          <div className="text-red-400 font-semibold">Seat Released:</div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            The temporary hold on <strong>Seat {seatNumber}</strong> has been released immediately and returned to the pool for other students or the waiting queue.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {onJoinQueue && (
            <button
              onClick={() => {
                onClose();
                onJoinQueue();
              }}
              className="w-full flex items-center justify-center space-x-2 rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-black hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <Users className="h-4 w-4" />
              <span>Join Waiting Queue for This Tier</span>
            </button>
          )}
          <button
            onClick={() => {
              onClose();
              onPickAnother();
            }}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800 cursor-pointer"
          >
            Pick Another Available Seat
          </button>
        </div>
      </div>
    </div>
  );
};
