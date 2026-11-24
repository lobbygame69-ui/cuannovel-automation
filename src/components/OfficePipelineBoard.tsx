'use client';

import React from 'react';

export interface PipelineSlotState {
  slot: number;
  stage: string;
  chaptersDone: number;
  totalChapters: number;
  lastWords?: number;
  provider?: string;
  driveFileName?: string;
  driveUrl?: string;
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

const PIPELINE_STAGES = [
  { key: 'scout_research', label: '1. Riset' },
  { key: 'novelku_production', label: '2. Tulis Bab' },
  { key: 'formatting_kdp', label: '3. Rapikan' },
  { key: 'packaging_zip', label: '4. Kemas Paket' },
  { key: 'gdrive_upload', label: '5. Google Drive' }
];

function getStageIndex(stage: string, chaptersDone: number, totalChapters: number): number {
  const s = (stage || '').toLowerCase();
  if (s.includes('drive') || s.includes('upload') || s.includes('done') || s.includes('completed')) {
    return 4;
  }
  if (s.includes('pack') || s.includes('zip') || s.includes('export')) {
    return 3;
  }
  if (s.includes('format') || s.includes('edit') || s.includes('kdp') || s.includes('cover')) {
    return 2;
  }
  if (s.includes('novelku') || s.includes('production') || s.includes('write') || chaptersDone > 0) {
    if (totalChapters > 0 && chaptersDone >= totalChapters) return 2;
    return 1;
  }
  return 0;
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
  const activeSlot = slots.find((s) => s.isRunning) || null;

  return (
    <div className="cn-office-wrap">
      <style>{`
        .cn-office-wrap {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          padding: 20px;
          color: #0f172a;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
        }
        .cn-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 18px;
        }
        .cn-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 6px 0;
          color: #0f172a;
        }
        .cn-meta {
          font-size: 13px;
          color: #475569;
          line-height: 1.5;
        }
        .cn-meta code {
          background: #e2e8f0;
          padding: 2px 6px;
          border-radius: 5px;
          font-size: 12px;
          color: #0f172a;
        }
        .cn-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cn-btn {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          padding: 9px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .cn-btn:hover:not(:disabled) {
          background: #f1f5f9;
        }
        .cn-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .cn-btn-primary {
          background: #059669;
          border-color: #059669;
          color: #ffffff;
        }
        .cn-btn-primary:hover:not(:disabled) {
          background: #047857;
        }
        .cn-btn-warn {
          background: #d97706;
          border-color: #d97706;
          color: #ffffff;
        }
        .cn-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
          gap: 16px;
        }
        .cn-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
        }
        .cn-card.is-running {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
        }
        .cn-card.is-error {
          border-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.14);
        }
        .cn-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .cn-slot-tag {
          background: #0f172a;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 6px;
        }
        .cn-stage-text {
          font-family: monospace;
          font-size: 12px;
          color: #475569;
          margin-left: 8px;
        }
        .cn-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid transparent;
        }
        .cn-badge-run {
          background: #d1fae5;
          color: #065f46;
          border-color: #34d399;
        }
        .cn-badge-err {
          background: #fee2e2;
          color: #991b1b;
          border-color: #f87171;
        }
        .cn-badge-idle {
          background: #e0f2fe;
          color: #075985;
          border-color: #7dd3fc;
        }
        .cn-desk-box {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #f1f5f9;
          border-radius: 10px;
          padding: 10px 12px;
          margin-bottom: 12px;
        }
        .cn-desk-status {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }
        .cn-desk-sub {
          font-size: 12px;
          color: #475569;
          margin-top: 3px;
        }
        .cn-desk-err {
          font-size: 12px;
          color: #b91c1c;
          font-weight: 600;
          margin-top: 4px;
        }
        .cn-steps {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
          margin-bottom: 12px;
        }
        .cn-step-pill {
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          padding: 5px 3px;
          border-radius: 6px;
          background: #f1f5f9;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .cn-step-pill.done {
          background: #dcfce7;
          color: #166534;
          border-color: #86efac;
        }
        .cn-step-pill.current {
          background: #2563eb;
          color: #ffffff;
          border-color: #1d4ed8;
        }
        .cn-bar-head {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 5px;
        }
        .cn-bar-track {
          width: 100%;
          height: 10px;
          background: #e2e8f0;
          border-radius: 999px;
          overflow: hidden;
        }
        .cn-bar-fill {
          height: 100%;
          background: #10b981;
          transition: width 0.4s ease;
        }
        .cn-bar-fill.err {
          background: #ef4444;
        }
        .cn-drive-box {
          margin-top: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          font-size: 12px;
          color: #1e3a8a;
        }
        @keyframes cnWorkerType {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes cnHandTap {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-2px, 2px); }
        }
        @keyframes cnDocFlow {
          0% { transform: translateX(0px); opacity: 0.9; }
          50% { transform: translateX(9px); opacity: 1; }
          100% { transform: translateX(0px); opacity: 0.9; }
        }
        @keyframes cnScreenPulse {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        .cn-anim-body {
          animation: cnWorkerType 0.55s ease-in-out infinite;
          transform-origin: center;
        }
        .cn-anim-hand {
          animation: cnHandTap 0.32s ease-in-out infinite;
        }
        .cn-anim-doc {
          animation: cnDocFlow 1.2s ease-in-out infinite;
        }
        .cn-anim-screen {
          animation: cnScreenPulse 0.9s ease-in-out infinite;
        }
      `}</style>

      <div className="cn-header">
        <div>
          <h2 className="cn-title">CuanNovel — Ruang Kantor Pipeline</h2>
          <div className="cn-meta">
            Batch: <code>{batchId}</code> · {authorPublisher} · Lolos: <strong>{passedCount}</strong> · Status:{' '}
            <strong>{statusText}</strong>
            {activeSlot ? ` · Sedang bekerja di Slot #${activeSlot.slot}` : ''}
          </div>
        </div>

        <div className="cn-controls">
          <button type="button" onClick={onRefresh} disabled={busy} className="cn-btn">
            Refresh Status
          </button>
          <button
            type="button"
            onClick={onRunOneStep}
            disabled={busy}
            className="cn-btn cn-btn-primary"
          >
            {busy ? 'Worker Menulis...' : 'Jalankan 1 Langkah Worker'}
          </button>
          <button
            type="button"
            onClick={onToggleAutoRun}
            className={`cn-btn ${autoRun ? 'cn-btn-warn' : ''}`}
          >
            {autoRun ? 'Hentikan Auto-Run' : 'Auto-Run Bertahap'}
          </button>
        </div>
      </div>

      <div className="cn-grid">
        {slots.map((s) => {
          const total = Math.max(1, s.totalChapters || 20);
          const pct = Math.min(100, Math.round((s.chaptersDone / total) * 100));
          const isErr = Boolean(s.error);
          const stageIdx = getStageIndex(s.stage, s.chaptersDone, total);

          const badgeText = s.isRunning
            ? 'SEDANG MENULIS'
            : isErr
              ? 'PERLU ULANG'
              : stageIdx === 4
                ? 'DI GOOGLE DRIVE'
                : 'SIAP JALAN';

          const badgeClass = s.isRunning
            ? 'cn-badge cn-badge-run'
            : isErr
              ? 'cn-badge cn-badge-err'
              : 'cn-badge cn-badge-idle';

          return (
            <div
              key={s.slot}
              className={`cn-card ${s.isRunning ? 'is-running' : ''} ${isErr ? 'is-error' : ''}`}
            >
              <div className="cn-card-top">
                <div>
                  <span className="cn-slot-tag">Slot #{s.slot}</span>
                  <span className="cn-stage-text">{s.stage}</span>
                </div>
                <span className={badgeClass}>{badgeText}</span>
              </div>

              <div className="cn-desk-box">
                <svg
                  width="96"
                  height="64"
                  viewBox="0 0 96 64"
                  style={{ flexShrink: 0 }}
                  aria-hidden="true"
                >
                  {/* Lantai & Meja Kerja */}
                  <rect x="6" y="42" width="60" height="5" rx="2" fill="#1e293b" />
                  <rect x="12" y="47" width="4" height="13" fill="#475569" />
                  <rect x="56" y="47" width="4" height="13" fill="#475569" />

                  {/* Monitor */}
                  <rect x="14" y="16" width="24" height="17" rx="2" fill="#0f172a" />
                  <rect
                    x="16"
                    y="18"
                    width="20"
                    height="12"
                    rx="1"
                    fill={isErr ? '#ef4444' : s.isRunning ? '#10b981' : '#38bdf8'}
                    className={s.isRunning ? 'cn-anim-screen' : ''}
                  />
                  <rect x="24" y="33" width="4" height="9" fill="#64748b" />

                  {/* Staf Worker */}
                  <g className={s.isRunning ? 'cn-anim-body' : ''}>
                    <circle cx="48" cy="17" r="5.5" fill="#f59e0b" />
                    <path d="M40 42 C40 28, 56 28, 56 42 Z" fill="#2563eb" />
                    <g className={s.isRunning ? 'cn-anim-hand' : ''}>
                      <circle cx="39" cy="37" r="2.5" fill="#fbbf24" />
                    </g>
                  </g>

                  {/* Dokumen & Tujuan Google Drive */}
                  <g className={s.isRunning ? 'cn-anim-doc' : ''}>
                    <rect x="53" y="31" width="11" height="8" rx="1" fill="#ffffff" stroke="#94a3b8" />
                  </g>

                  {/* Ikon Folder / Drive */}
                  <path
                    d="M72 25 H79 L81 28 H90 V42 H72 Z"
                    fill={stageIdx === 4 ? '#16a34a' : '#3b82f6'}
                  />
                  <text x="75" y="54" fontSize="8" fontWeight="700" fill="#334155">
                    DRIVE
                  </text>
                </svg>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cn-desk-status">
                    {s.isRunning
                      ? `Menulis Bab ${s.chaptersDone + 1} via NOVELKU AI...`
                      : `Tahap aktif: ${PIPELINE_STAGES[stageIdx]?.label || s.stage}`}
                  </div>
                  <div className="cn-desk-sub">
                    {typeof s.lastWords === 'number'
                      ? `Bab terakhir: ${s.lastWords} kata`
                      : 'Menunggu hitungan kata bab berikutnya'}
                    {s.provider ? ` · ${s.provider}` : ''}
                  </div>
                  {isErr && <div className="cn-desk-err">{s.error}</div>}
                </div>
              </div>

              {/* Indikator 5 Tahap Sampai Google Drive */}
              <div className="cn-steps">
                {PIPELINE_STAGES.map((st, idx) => {
                  const pillClass =
                    idx < stageIdx
                      ? 'cn-step-pill done'
                      : idx === stageIdx
                        ? 'cn-step-pill current'
                        : 'cn-step-pill';
                  return (
                    <div key={st.key} className={pillClass}>
                      {st.label}
                    </div>
                  );
                })}
              </div>

              {/* Bar Progres Bab */}
              <div>
                <div className="cn-bar-head">
                  <span>Progres Naskah</span>
                  <span>
                    {s.chaptersDone}/{total} bab ({pct}%)
                  </span>
                </div>
                <div className="cn-bar-track">
                  <div
                    className={`cn-bar-fill ${isErr ? 'err' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {(s.driveFileName || stageIdx === 4) && (
                <div className="cn-drive-box">
                  Paket Google Drive:{' '}
                  <strong>{s.driveFileName || `Paket_Novel_Slot_${s.slot}.zip`}</strong>
                  {s.driveUrl ? (
                    <>
                      {' '}
                      ·{' '}
                      <a href={s.driveUrl} target="_blank" rel="noreferrer">
                        Buka di Drive
                      </a>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
