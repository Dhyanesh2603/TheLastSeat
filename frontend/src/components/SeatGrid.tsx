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
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Group seats by row_identifier (A to T)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

  const filteredSeats = seats.filter((s) => {
    if (filterTier !== 'ALL' && s.tier !== filterTier) return false;
    if (searchQuery && !s.seat_number.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getSeatColor = (seat: Seat) => {
    const isSelected = selectedSeat?.id === seat.id;
    const isMyReservation = myReservationSeatId === seat.id;

    if (isSelected) {
      return 'bg-white text-black font-bold border border-white ring-2 ring-neutral-400 scale-110 z-20 shadow-md';
    }

    if (isMyReservation) {
      return 'bg-amber-400 text-black font-bold border border-white scale-105 z-10 shadow-sm';
    }

    switch (seat.status) {
      case 'Available':
        if (seat.tier === 'VIP') {
          return 'bg-[#141a17] text-emerald-300 border border-emerald-800/60 hover:border-emerald-500 hover:bg-[#1a251f] hover:text-white cursor-pointer font-medium';
        }
        return 'bg-[#101412] text-emerald-400/90 border border-emerald-900/50 hover:border-emerald-600 hover:bg-[#17201a] hover:text-white cursor-pointer';
      case 'Reserved':
        return 'bg-[#1c1710] text-amber-300/80 border border-amber-900/50 hover:border-amber-700 cursor-pointer';
      case 'Booked':
        return 'bg-neutral-900/90 text-neutral-600 border border-neutral-800/80 line-through cursor-pointer opacity-60';
      case 'Unavailable':
      default:
        return 'bg-neutral-950 text-neutral-700 border border-neutral-900 cursor-not-allowed';
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="font-mono text-neutral-500 uppercase tracking-wider text-[11px] mr-1">Section:</span>
          {['ALL', 'VIP', 'Standard', 'Balcony'].map((tier) => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className={`rounded px-2.5 py-1 text-[11px] font-mono transition-colors cursor-pointer ${
                filterTier === tier
                  ? 'bg-neutral-200 text-black font-semibold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {tier}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search seat (e.g. A-05)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none w-48 font-mono text-[11px]"
        />
      </div>

      {/* Minimal Stage Bar */}
      <div className="flex flex-col items-center justify-center my-2">
        <div className="w-full max-w-xl py-1.5 rounded-t border-t border-x border-neutral-700/80 bg-neutral-900/40 text-center">
          <span className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase font-semibold">
            STAGE
          </span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-[#0a0b0e] p-4 sm:p-5 shadow-inner">
        {isLoading ? (
          <div className="flex h-96 items-center justify-center font-mono text-xs text-neutral-400 animate-pulse">
            Syncing 500 seat states from PostgreSQL & Redis lock cache...
          </div>
        ) : (
          <div className="min-w-[780px] space-y-1.5">
            {rows.map((row) => {
              const rowSeats = filteredSeats.filter((s) => s.row_identifier === row);
              if (rowSeats.length === 0) return null;

              const isVipRow = ['A', 'B', 'C', 'D'].includes(row);
              const isBalconyRow = ['O', 'P', 'Q', 'R', 'S', 'T'].includes(row);

              return (
                <div key={row} className="flex items-center space-x-1.5">
                  {/* Row Letter Header */}
                  <span
                    className={`w-7 font-mono text-[11px] font-bold text-center py-1 rounded-[3px] ${
                      isVipRow
                        ? 'bg-amber-950/40 text-amber-300 border border-amber-800/60'
                        : isBalconyRow
                        ? 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                        : 'bg-neutral-800/40 text-neutral-300'
                    }`}
                  >
                    {row}
                  </span>

                  {/* 25 Seats in Row */}
                  <div className="flex flex-1 items-center space-x-1">
                    {rowSeats.map((seat) => (
                      <button
                        key={seat.id}
                        onClick={() => onSelectSeat(seat)}
                        title={`Seat ${seat.seat_number} • ${seat.tier} • $${seat.price} (${seat.status}) • Click to inspect / book`}
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

      {/* Minimal Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800/80 pt-3 text-[11px] text-neutral-400 font-mono">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="h-2.5 w-2.5 rounded-xs border border-emerald-500 bg-emerald-950/70" />
            <span className="text-emerald-400">Available</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2.5 w-2.5 rounded-xs border border-dashed border-amber-500 bg-amber-950/60" />
            <span className="text-amber-400">5m Hold</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2.5 w-2.5 rounded-xs border border-red-900/60 bg-red-950/20" />
            <span className="text-neutral-500 line-through">Booked</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2.5 w-2.5 rounded-xs border border-white bg-amber-400" />
            <span className="text-amber-300">Your Seat</span>
          </div>
        </div>

        <div className="text-neutral-500">
          VIP $150 (A-D) • Standard $75 (E-N) • Balcony $45 (O-T)
        </div>
      </div>
    </div>
  );
};
