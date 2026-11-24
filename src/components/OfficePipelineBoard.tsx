import React from 'react';

export interface PipelineSlotState {
  slot: number;
  stage: string;
  chaptersDone: number;
  totalChapters: number;
  lastWords?: number;
  provider?: string;
  error?: string | null;
  isRunning?: boolean;
}

interface OfficePipelineBoardProps {
  batchId: string;
  statusText: string;
  authorPublisher: string;
  passedCount: string;
  slots: PipelineSlotState[];
  onRefresh: () => void;
  onRunOneStep: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  busy?: boolean;
}

export const OfficePipelineBoard: React.FC<OfficePipelineBoardProps> = ({
  batchId,
  statusText,
  authorPublisher,
  passedCount,
  slots,
  onRefresh,
  onRunOneStep,
  autoRun,
  onToggleAutoRun,
  busy = false
}) => {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-900">
      <style>{`
        @keyframes deskBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes sheetSlide {
          0%, 100% { transform: translateX(0px) rotate(0deg); opacity: 0.85; }
          50% { transform: translateX(6px) rotate(2deg); opacity: 1; }
        }
        .worker-active { animation: deskBob 0.7s ease-in-out infinite; }
        .sheet-active { animation: sheetSlide 1.1s ease-in-out infinite; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold">CuanNovel — Ruang Kantor Pipeline</h2>
          <p className="text-xs text-slate-600">
            Batch: <span className="font-mono">{batchId}</span> · {authorPublisher} · Lolos:{' '}
            <strong>{passedCount}</strong> · Status: <strong>{statusText}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
          >
            Refresh Status
          </button>
          <button
            type="button"
            onClick={onRunOneStep}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Worker Bekerja...' : 'Jalankan 1 Langkah Worker'}
          </button>
          <button
            type="button"
            onClick={onToggleAutoRun}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium ${
              autoRun
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            {autoRun ? 'Hentikan Auto-Run' : 'Auto-Run Bertahap'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {slots.map((s) => {
          const pct = Math.min(100, Math.round((s.chaptersDone / Math.max(1, s.totalChapters)) * 100));
          const isErr = Boolean(s.error);
          const badgeLabel = s.isRunning
            ? 'MENULIS NASKAH'
            : isErr
              ? 'PERLU ULANG'
              : s.stage === 'novelku_production'
                ? 'MEJA PRODUKSI'
                : 'MEJA RISET';

          const badgeClass = s.isRunning
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : isErr
              ? 'bg-rose-100 text-rose-800 border-rose-300'
              : 'bg-sky-100 text-sky-800 border-sky-300';

          return (
            <div
              key={s.slot}
              className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                isErr ? 'border-rose-300' : 'border-slate-200'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                    Slot #{s.slot}
                  </span>
                  <span className="font-mono text-xs text-slate-600">{s.stage}</span>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                  {badgeLabel}
                </span>
              </div>

              {/* Ilustrasi Meja Kerja Worker */}
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-100/80 p-3">
                <svg
                  width="76"
                  height="56"
                  viewBox="0 0 76 56"
                  className={s.isRunning ? 'worker-active' : ''}
                  aria-hidden="true"
                >
                  {/* Kursi & Meja Kantor */}
                  <rect x="8" y="34" width="60" height="5" rx="2" fill="#334155" />
                  <rect x="14" y="39" width="4" height="13" fill="#475569" />
                  <rect x="58" y="39" width="4" height="13" fill="#475569" />
                  {/* Monitor */}
                  <rect x="20" y="14" width="22" height="15" rx="2" fill="#0f172a" />
                  <rect x="22" y="16" width="18" height="11" rx="1" fill={isErr ? '#f43f5e' : '#10b981'} />
                  <rect x="29" y="29" width="4" height="5" fill="#64748b" />
                  {/* Karakter Worker */}
                  <circle cx="52" cy="15" r="5" fill="#f59e0b" />
                  <path d="M45 34 C45 24, 59 24, 59 34 Z" fill="#2563eb" />
                  {/* Lembaran Naskah */}
                  <g className={s.isRunning ? 'sheet-active' : ''}>
                    <rect x="44" y="26" width="11" height="8" rx="1" fill="#ffffff" stroke="#94a3b8" />
                  </g>
                </svg>

                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold text-slate-800">
                    {s.isRunning
                      ? 'Sedang menyusun draf bab & mengecek jumlah kata...'
                      : isErr
                        ? s.error
                        : `Progres bab: ${s.chaptersDone}/${s.totalChapters}`}
                  </div>
                  <div className="mt-1 text-slate-500">
                    {s.lastWords ? `Bab terakhir: ${s.lastWords} kata` : 'Belum ada hitungan kata'}
                    {s.provider ? ` · ${s.provider}` : ''}
                  </div>
                </div>
              </div>

              {/* Bar Progres Bab */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span>Bab</span>
                  <span>
                    {s.chaptersDone}/{s.totalChapters} ({pct}%)
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isErr ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
