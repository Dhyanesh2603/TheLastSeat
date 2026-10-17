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
      return 'bg-white text-black border-2 border-emerald-400 ring-4 ring-emerald-500/40 font-black scale-125 z-30 shadow-xl';
    }

    if (isMyReservation) {
      return 'bg-amber-400 text-black border-2 border-white ring-2 ring-amber-400 font-extrabold animate-pulse z-20';
    }

    switch (seat.status) {
      case 'Available':
        if (seat.tier === 'VIP') {
          return 'bg-emerald-950/80 text-emerald-200 border border-emerald-400/90 hover:bg-emerald-400 hover:text-black hover:scale-125 hover:z-20 shadow-md shadow-emerald-950 font-bold cursor-pointer ring-1 ring-emerald-400/40';
        }
        return 'bg-emerald-950/50 text-emerald-300 border border-emerald-600/70 hover:bg-emerald-400 hover:text-black hover:scale-125 hover:z-20 shadow-sm shadow-emerald-950/40 font-semibold cursor-pointer';
      case 'Reserved':
        return 'bg-amber-950/60 text-amber-300 border-dashed border-amber-500 hover:bg-amber-400 hover:text-black hover:scale-110 cursor-pointer animate-pulse font-medium';
      case 'Booked':
        return 'bg-red-950/20 text-red-400/40 border border-red-900/40 hover:border-red-500 hover:bg-red-950/50 hover:text-red-300 line-through cursor-pointer opacity-70';
      case 'Unavailable':
      default:
        return 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed';
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

      {/* Stage Banner with Acoustic Styling */}
      <div className="flex flex-col items-center justify-center my-3">
        <div className="w-full max-w-2xl h-9 rounded-t-lg border-t-2 border-x border-emerald-500/50 bg-gradient-to-b from-emerald-950/40 via-neutral-900 to-[#0e0f13] flex items-center justify-between px-6 shadow-lg shadow-emerald-950/20">
          <div className="flex items-center space-x-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono text-[10px] tracking-wider text-emerald-400 uppercase font-semibold">STAGE AUDIO MONITOR</span>
          </div>
          <span className="font-mono text-[11px] tracking-widest text-neutral-200 uppercase font-bold">
            STAGE & MAIN PERFORMANCE AREA
          </span>
          <span className="font-mono text-[10px] text-neutral-500">FRONT OF HOUSE</span>
        </div>
        <div className="w-full max-w-2xl h-0.5 bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent shadow-sm shadow-emerald-400" />
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

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-800/80 pt-3 text-xs text-neutral-300 font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-1.5">
            <span className="h-3.5 w-3.5 rounded-[2px] border border-emerald-500 bg-emerald-950/70 shadow-xs shadow-emerald-500" />
            <span className="text-emerald-300 font-semibold">Available (Click to Book)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3.5 w-3.5 rounded-[2px] border border-dashed border-amber-500 bg-amber-950/60 animate-pulse" />
            <span className="text-amber-300">Reserved (5m Hold)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3.5 w-3.5 rounded-[2px] border border-red-900/60 bg-red-950/20" />
            <span className="text-red-400 line-through">Booked (Permanent)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3.5 w-3.5 rounded-[2px] border-2 border-white bg-amber-400" />
            <span className="text-amber-200 font-bold">Your Active Hold</span>
          </div>
        </div>

        <div className="text-[11px] text-neutral-400">
          <span className="text-amber-300">VIP Rows A-D ($150)</span> • Standard Rows E-N ($75) • Balcony Rows O-T ($45)
        </div>
      </div>
    </div>
  );
};
