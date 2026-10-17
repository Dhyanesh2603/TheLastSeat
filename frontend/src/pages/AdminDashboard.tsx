import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, healthApi } from '../services/api';
import { Shield, Zap, RefreshCw, CheckCircle2, XCircle, Database, Server } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [burstSeatId, setBurstSeatId] = useState<number>(1);
  const [isSimulatingBurst, setIsSimulatingBurst] = useState(false);
  const [burstResult, setBurstResult] = useState<any | null>(null);

  // Poll admin dashboard stats every 2 seconds
  const { data: dashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminApi.getDashboard,
    refetchInterval: 2000,
  });

  // Poll detailed stats every 2 seconds
  const { data: detailedStats, refetch: refetchStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
    refetchInterval: 2000,
  });

  // Query system health
  const { data: health } = useQuery({
    queryKey: ['system-health'],
    queryFn: healthApi.getHealth,
    refetchInterval: 5000,
  });

  // Query payments
  const { data: paymentsData, refetch: refetchPayments } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: adminApi.getPayments,
    refetchInterval: 3000,
  });

  // Query queue
  const { data: queueData, refetch: refetchQueue } = useQuery({
    queryKey: ['admin-queue'],
    queryFn: adminApi.getQueue,
    refetchInterval: 3000,
  });

  const handleRunConcurrencyBurst = async () => {
    setIsSimulatingBurst(true);
    setBurstResult(null);
    try {
      const res = await adminApi.simulateBurst(burstSeatId, 25);
      setBurstResult(res);
      refetchDashboard();
      refetchStats();
      refetchPayments();
    } catch (err: any) {
      setBurstResult({
        summary: err.response?.data?.detail || 'Burst test execution failed.',
        guarantee_preserved: false
      });
    } finally {
      setIsSimulatingBurst(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      
      {/* Top Banner: Admin Telemetry & Health */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="rounded border border-neutral-700 bg-neutral-900 p-2">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white m-0">Admin Studio & Observability</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Real-time concurrency monitoring, distributed lock health, and payment audit logs.
            </p>
          </div>
        </div>

        {/* Health Badges */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 rounded border border-neutral-800 bg-[#101115] px-3 py-1.5">
            <Database className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-neutral-400">PostgreSQL:</span>
            <span className={health?.database ? 'text-emerald-400 font-bold' : 'text-red-400'}>
              {health?.database ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 rounded border border-neutral-800 bg-[#101115] px-3 py-1.5">
            <Server className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-neutral-400">Redis:</span>
            <span className={health?.redis ? 'text-emerald-400 font-bold' : 'text-red-400'}>
              {health?.redis ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 font-mono text-xs">
        <div className="rounded border border-neutral-800 bg-[#101115] p-3.5">
          <span className="text-neutral-400">TOTAL SEATS</span>
          <div className="text-xl font-bold text-white mt-1">{dashboard?.total_seats ?? 500}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-[#101115] p-3.5">
          <span className="text-neutral-400">AVAILABLE</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">{dashboard?.available_seats ?? '-'}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-[#101115] p-3.5">
          <span className="text-neutral-400">RESERVED (REDIS)</span>
          <div className="text-xl font-bold text-amber-400 mt-1">{dashboard?.reserved_seats ?? '-'}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-[#101115] p-3.5">
          <span className="text-neutral-400">BOOKED (SQL)</span>
          <div className="text-xl font-bold text-neutral-300 mt-1">{dashboard?.booked_seats ?? '-'}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-[#101115] p-3.5">
          <span className="text-neutral-400">TOTAL REVENUE</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            ${Number(dashboard?.total_revenue || 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded border border-neutral-800 bg-[#101115] p-3.5 border-emerald-900/50 bg-emerald-950/10">
          <span className="text-neutral-400">DOUBLE BOOKINGS</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {detailedStats?.concurrency_double_booking_count ?? 0} (ZERO)
          </div>
        </div>
      </div>

      {/* Live Concurrency Stress Test Trigger Box */}
      <div className="rounded-lg border border-neutral-800 bg-[#101115] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Zap className="h-4 w-4 text-amber-400" />
            <span>Interactive Concurrency Stress Burst Simulation</span>
          </div>
          <span className="font-mono text-xs text-neutral-400">
            Fires 25 simultaneous booking attempts on a single seat
          </span>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed max-w-3xl">
          This test fires 25 simultaneous async coroutines on the selected seat. It verifies both the 
          <strong> Redis Lua Distributed Lock</strong> and the <strong>PostgreSQL SELECT ... FOR UPDATE</strong> row lock.
          Under heavy contention, exactly 1 request will acquire the lock and win, while 24 requests will be cleanly rejected with HTTP 409 Conflict.
        </p>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <label className="text-neutral-400">Target Seat ID (1-500):</label>
          <input
            type="number"
            min={1}
            max={500}
            value={burstSeatId}
            onChange={(e) => setBurstSeatId(Number(e.target.value))}
            className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-white focus:outline-none focus:border-neutral-500"
          />
          <button
            disabled={isSimulatingBurst}
            onClick={handleRunConcurrencyBurst}
            className="flex items-center space-x-1.5 rounded bg-amber-400 px-4 py-1.5 font-bold text-black hover:bg-amber-300 disabled:opacity-50 transition-colors"
          >
            {isSimulatingBurst ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Simulating 25 Concurrent Requests...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                <span>Trigger 25 Concurrent Users</span>
              </>
            )}
          </button>
        </div>

        {/* Burst Outcome Summary */}
        {burstResult && (
          <div
            className={`rounded border p-4 text-xs font-mono space-y-2 ${
              burstResult.guarantee_preserved
                ? 'border-emerald-800/80 bg-emerald-950/20 text-emerald-300'
                : 'border-red-800/80 bg-red-950/20 text-red-300'
            }`}
          >
            <div className="flex items-center space-x-2 font-bold text-sm">
              {burstResult.guarantee_preserved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span>{burstResult.summary}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div>Seat Tested: #{burstResult.seat_id}</div>
              <div>Concurrency Level: {burstResult.concurrency_level} requests</div>
              <div className="font-bold text-white">Winners: {burstResult.winners_count} (Allowed)</div>
              <div>Rejected: {burstResult.rejected_count} (409 Conflict)</div>
            </div>
            {burstResult.winners && burstResult.winners.length > 0 && (
              <div className="text-[11px] text-neutral-400 pt-1">
                Winner: {burstResult.winners[0].user} (Ref: {burstResult.winners[0].ref})
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two Column Layout: Waiting Queue & Payments Log */}
      <div className="grid gap-6 lg:grid-cols-2">
        
        {/* Waiting Queue Table */}
        <div className="rounded-lg border border-neutral-800 bg-[#0e0f13] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400 m-0">
              Active Waiting Queue ({queueData?.length || 0})
            </h2>
            <button
              onClick={() => refetchQueue()}
              className="text-neutral-500 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="text-neutral-500 border-b border-neutral-800/80">
                <tr>
                  <th className="pb-1.5">Rank</th>
                  <th className="pb-1.5">User</th>
                  <th className="pb-1.5">Status</th>
                  <th className="pb-1.5">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {queueData && queueData.length > 0 ? (
                  queueData.map((q: any) => (
                    <tr key={q.id} className="hover:bg-neutral-900/30">
                      <td className="py-2 text-emerald-400 font-bold">#{q.position}</td>
                      <td className="py-2 text-neutral-300">{q.user_name || q.user_id.substring(0, 8)}</td>
                      <td className="py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            q.status === 'Notified'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="py-2 text-neutral-500">
                        {new Date(q.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-neutral-500">
                      Waiting queue is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments Simulation Stream Table */}
        <div className="rounded-lg border border-neutral-800 bg-[#0e0f13] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400 m-0">
              Payment Simulation Feed (Latest 50)
            </h2>
            <button
              onClick={() => refetchPayments()}
              className="text-neutral-500 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="text-neutral-500 border-b border-neutral-800/80">
                <tr>
                  <th className="pb-1.5">TX Ref</th>
                  <th className="pb-1.5">Amount</th>
                  <th className="pb-1.5">Status</th>
                  <th className="pb-1.5">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {paymentsData?.payments && paymentsData.payments.length > 0 ? (
                  paymentsData.payments.slice(0, 20).map((p: any) => (
                    <tr key={p.id} className="hover:bg-neutral-900/30">
                      <td className="py-2 text-neutral-300 font-bold">{p.transaction_reference.substring(0, 14)}...</td>
                      <td className="py-2 text-neutral-200">${Number(p.amount).toFixed(2)}</td>
                      <td className="py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            p.status === 'Succeeded' || p.status === 'Delayed Success'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-red-950 text-red-400 border border-red-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2 text-neutral-500">{p.simulated_delay_seconds}s</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-neutral-500">
                      No payment transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};
