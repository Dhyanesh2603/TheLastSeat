import React, { useState } from 'react';
import type { Seat } from '../types';

interface SeatGridProps {
  seats: Seat[];
  selectedSeat: Seat | null;
  myReservationSeatId: number | null;
  onSelectSeat: (seat: Seat) => void;
  isLoading: boolean;
}

export const SeatGrid: React.FC<SeatGridProps> = ({
  seats,
  selectedSeat,
  myReservationSeatId,
  onSelectSeat,
  isLoading
}) => {
  const [filterTier, setFilterTier] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Group seats by row_identifier (A to T)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

  const filteredSeats = seats.filter((s) => {
    if (filterTier !== 'ALL' && s.tier !== filterTier) return false;
    if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
    if (searchQuery && !s.seat_number.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getSeatColor = (seat: Seat) => {
    const isSelected = selectedSeat?.id === seat.id;
    const isMyReservation = myReservationSeatId === seat.id;

    if (isSelected) {
      return 'bg-white text-black border-white ring-2 ring-white/50 z-10 font-bold';
    }

    if (isMyReservation) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/80 animate-pulse';
    }

    switch (seat.status) {
      case 'Available':
        if (seat.tier === 'VIP') {
          return 'bg-[#18191f] text-neutral-200 border-neutral-700/80 hover:border-emerald-400 hover:bg-[#22242c] cursor-pointer';
        }
        return 'bg-[#121316] text-neutral-300 border-neutral-800 hover:border-emerald-500 hover:bg-[#1a1c22] cursor-pointer';
      case 'Reserved':
        return 'bg-amber-950/30 text-amber-400/90 border-dashed border-amber-800/80 hover:border-amber-500 hover:bg-amber-950/60 cursor-pointer';
      case 'Booked':
        return 'bg-[#0a0a0c] text-neutral-500 border-neutral-900 hover:border-neutral-700 hover:bg-neutral-900 line-through cursor-pointer';
      case 'Unavailable':
      default:
        return 'bg-red-950/20 text-neutral-600 border-neutral-900 hover:border-neutral-700 cursor-pointer';
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-neutral-400 uppercase tracking-wider text-[11px]">Filter Tier:</span>
          {['ALL', 'VIP', 'Standard', 'Balcony'].map((tier) => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className={`rounded px-2.5 py-1 transition-colors ${
                filterTier === tier
                  ? 'bg-neutral-200 text-black font-medium'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {tier}
            </button>
          ))}

          <span className="ml-2 font-mono text-neutral-400 uppercase tracking-wider text-[11px]">Status:</span>
          {['ALL', 'Available', 'Reserved', 'Booked'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`rounded px-2.5 py-1 transition-colors ${
                filterStatus === st
                  ? 'bg-neutral-200 text-black font-medium'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search (e.g. A-05)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Stage Banner */}
      <div className="flex flex-col items-center justify-center my-2">
        <div className="w-full max-w-xl h-6 rounded-t border-t border-x border-neutral-700 bg-neutral-900/60 flex items-center justify-center">
          <span className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            STAGE // FRONT OF HOUSE
          </span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto rounded border border-neutral-800 bg-[#0e0f13] p-4">
        {isLoading ? (
          <div className="flex h-96 items-center justify-center font-mono text-xs text-neutral-500">
            Syncing seat states from PostgreSQL & Redis lock cache...
          </div>
        ) : (
          <div className="min-w-[760px] space-y-1.5">
            {rows.map((row) => {
              const rowSeats = filteredSeats.filter((s) => s.row_identifier === row);
              if (rowSeats.length === 0) return null;

              return (
                <div key={row} className="flex items-center space-x-1">
                  {/* Row Letter Header */}
                  <span className="w-6 font-mono text-[11px] font-bold text-neutral-400 text-center">
                    {row}
                  </span>

                  {/* 25 Seats in Row */}
                  <div className="flex flex-1 items-center space-x-1">
                    {rowSeats.map((seat) => (
                      <button
                        key={seat.id}
                        onClick={() => onSelectSeat(seat)}
                        title={`${seat.seat_number} - ${seat.tier} - $${seat.price} (${seat.status}) - Click to inspect`}
                        className={`h-7 flex-1 min-w-[24px] rounded-[3px] border text-[10px] font-mono transition-all duration-150 flex items-center justify-center ${getSeatColor(
                          seat
                        )}`}
                      >
                        {seat.column_number}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-800/80 pt-3 text-xs text-neutral-400 font-mono">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-neutral-700 bg-[#121316]" />
            <span>Available</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-dashed border-neutral-700 bg-neutral-800/40" />
            <span>Reserved (5m lock)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-neutral-900 bg-[#0a0a0c]" />
            <span>Booked (Permanent)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-amber-500 bg-amber-500/20" />
            <span>Your Hold</span>
          </div>
        </div>

        <div className="text-[11px] text-neutral-400">
          VIP Rows A-D ($150) • Standard Rows E-N ($75) • Balcony Rows O-T ($45)
        </div>
      </div>
    </div>
  );
};
