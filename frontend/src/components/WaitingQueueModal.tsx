import React, { useState } from 'react';
import type { WaitingQueueStatus } from '../types';
import { queueApi } from '../services/api';
import { Users, ArrowRight, CheckCircle, X } from 'lucide-react';

interface WaitingQueueModalProps {
  queueStatus: WaitingQueueStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelectSeatId?: (seatId: number) => void;
}

export const WaitingQueueModal: React.FC<WaitingQueueModalProps> = ({
  queueStatus,
  isOpen,
  onClose,
  onRefresh,
  onSelectSeatId
}) => {
  const [isJoining, setIsJoining] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleJoin = async () => {
    setIsJoining(true);
    setFeedback(null);
    try {
      const res = await queueApi.join();
      setFeedback(res.message);
      onRefresh();
    } catch (err: any) {
      setFeedback(err.response?.data?.detail || 'Failed to join queue.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#0e0f13] p-6 text-neutral-200 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-neutral-400" />
            <h3 className="font-semibold text-white text-sm">Redis Waiting Queue</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Opportunity Banner (if seat released!) */}
        {queueStatus?.opportunity_seat_id ? (
          <div className="rounded border border-emerald-800 bg-emerald-950/30 p-4 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
              <CheckCircle className="h-4 w-4" />
              <span>SEAT OPPORTUNITY GRANTED!</span>
            </div>
            <p className="text-xs text-neutral-300">
              A reservation expired or was cancelled. Seat #{queueStatus.opportunity_seat_id} is reserved exclusively for you for 3 minutes!
            </p>
            {onSelectSeatId && (
              <button
                onClick={() => {
                  onSelectSeatId(queueStatus.opportunity_seat_id!);
                  onClose();
                }}
                className="mt-2 flex items-center space-x-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400"
              >
                <span>Claim Seat #{queueStatus.opportunity_seat_id}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          /* Normal Queue Info */
          <div className="space-y-4">
            <p className="text-xs text-neutral-400 leading-relaxed">
              When high-demand concerts sell out or all seats are held by temporary reservations, you can join the FIFO waiting queue. As soon as a 5-minute reservation expires or a booking is cancelled, the head of the queue is granted an exclusive reservation opportunity window.
            </p>

            <div className="rounded border border-neutral-800 bg-neutral-900/60 p-4 space-y-2 font-mono text-xs">
              <div className="flex justify-between border-b border-neutral-800 pb-2">
                <span className="text-neutral-400">Total in Queue</span>
                <span className="font-bold text-white">{queueStatus?.total_in_queue || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-400">Your Position</span>
                <span className="font-bold text-emerald-400">
                  {queueStatus?.is_in_queue ? `#${queueStatus.position}` : 'Not in queue'}
                </span>
              </div>
            </div>

            {feedback && (
              <div className="rounded border border-neutral-700 bg-neutral-800 p-2.5 text-xs text-neutral-200">
                {feedback}
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end space-x-2 border-t border-neutral-800 pt-4 text-xs">
          <button
            onClick={onClose}
            className="rounded border border-neutral-800 px-3 py-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            Close
          </button>
          {!queueStatus?.is_in_queue && !queueStatus?.opportunity_seat_id && (
            <button
              disabled={isJoining}
              onClick={handleJoin}
              className="rounded bg-white px-4 py-1.5 font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {isJoining ? 'Joining...' : 'Join Waitlist'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
