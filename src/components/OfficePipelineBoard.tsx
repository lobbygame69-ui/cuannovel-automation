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
  { key: 'scout_research', label: '1. Riset', caption: 'Meriset premis, tokoh & kerangka novel' },
  { key: 'novelku_production', label: '2. Tulis Bab', caption: 'Menulis naskah bab (min. 1.000 kata/bab)' },
  { key: 'formatting_kdp', label: '3. Audit & Rapikan', caption: 'Memeriksa kelayakan bab & tata naskah' },
  { key: 'packaging_zip', label: '4. Kemas Paket', caption: 'Menyusun paket naskah & metadata siap kirim' },
  { key: 'gdrive_upload', label: '5. Google Drive', caption: 'Mengunggah paket novel ke folder Google Drive' }
];

function getStageIndex(stage: string, chaptersDone: number, totalChapters: number): number {
  const s = (stage || '').toLowerCase();
  if (s.includes('drive') || s.includes('upload') || s.includes('done') || s.includes('completed')) {
    return 4;
  }
  if (s.includes('pack') || s.includes('zip') || s.includes('export')) {
    return 3;
  }
  if (s.includes('audit') || s.includes('format') || s.includes('edit') || s.includes('kdp') || s.includes('cover')) {
    return 2;
  }
  if (s.includes('novelku') || s.includes('production') || s.includes('write') || chaptersDone > 0) {
    if (totalChapters > 0 && chaptersDone >= totalChapters) return 2;
    return 1;
  }
  return 0;
}

function pickSingleActiveSlot(slots: PipelineSlotState[]): PipelineSlotState | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  const running = slots.find((s) => s.isRunning);
  if (running) return running;

  const inProgress = slots.find((s) => {
    const st = (s.stage || '').toLowerCase();
    return (
      !st.includes('completed') &&
      !st.includes('done') &&
      !st.includes('failed_purged') &&
      (s.chaptersDone > 0 ||
        st.includes('novelku') ||
        st.includes('production') ||
        st.includes('audit') ||
        st.includes('pack') ||
        st.includes('drive'))
    );
  });
  if (inProgress) return inProgress;

  const firstPending = slots.find((s) => {
    const st = (s.stage || '').toLowerCase();
    return !st.includes('completed') && !st.includes('done') && !st.includes('failed_purged');
  });
  return firstPending || slots[0];
}

const StageAnimationArt: React.FC<{
  stageIndex: number;
  isRunning: boolean;
  isError: boolean;
}> = ({ stageIndex, isRunning, isError }) => {
  const animClass = isRunning ? 'is-animating' : 'is-paused';

  if (stageIndex === 0) {
    // Animasi 1: Riset Proyek (lensa pembesar memindai kartu ide & catatan riset)
    return (
      <svg width="112" height="72" viewBox="0 0 112 72" className={`cn-svg ${animClass}`} aria-hidden="true">
        <rect x="8" y="48" width="96" height="5" rx="2" fill="#1e293b" />
        <rect x="14" y="14" width="44" height="28" rx="4" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
        <line x1="20" y1="22" x2="46" y2="22" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="20" y1="29" x2="50" y2="29" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="20" y1="36" x2="38" y2="36" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        <g className="cn-research-scan">
          <circle cx="72" cy="28" r="11" fill="#e0f2fe" fillOpacity="0.85" stroke="#0284c7" strokeWidth="3" />
          <line x1="80" y1="36" x2="90" y2="45" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" />
        </g>
        <text x="16" y="65" fontSize="9" fontWeight="700" fill="#0369a1">RISET PROYEK</text>
      </svg>
    );
  }

  if (stageIndex === 1) {
    // Animasi 2: Tulis Bab (penulis mengetik di monitor & halaman bab bertambah)
    return (
      <svg width="112" height="72" viewBox="0 0 112 72" className={`cn-svg ${animClass}`} aria-hidden="true">
        <rect x="8" y="48" width="96" height="5" rx="2" fill="#1e293b" />
        <rect x="14" y="14" width="34" height="24" rx="3" fill="#0f172a" />
        <rect
          x="17"
          y="17"
          width="28"
          height="17"
          rx="1.5"
          fill={isError ? '#ef4444' : '#10b981'}
          className="cn-write-screen"
        />
        <rect x="29" y="38" width="4" height="10" fill="#64748b" />
        <g className="cn-write-author">
          <circle cx="64" cy="20" r="6" fill="#f59e0b" />
          <path d="M55 48 C55 32, 73 32, 73 48 Z" fill="#2563eb" />
          <circle cx="53" cy="40" r="2.8" fill="#fbbf24" className="cn-write-hand" />
        </g>
        <rect x="79" y="22" width="18" height="22" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" className="cn-write-page" />
        <text x="16" y="65" fontSize="9" fontWeight="700" fill={isError ? '#b91c1c' : '#047857'}>
          {isError ? 'ULANG BAB (<1K)' : 'MENULIS BAB'}
        </text>
      </svg>
    );
  }

  if (stageIndex === 2) {
    // Animasi 3: Audit & Rapikan (pemeriksaan kualitas & centang kelayakan)
    return (
      <svg width="112" height="72" viewBox="0 0 112 72" className={`cn-svg ${animClass}`} aria-hidden="true">
        <rect x="8" y="48" width="96" height="5" rx="2" fill="#1e293b" />
        <rect x="20" y="12" width="44" height="32" rx="3" fill="#ffffff" stroke="#64748b" strokeWidth="2" />
        <line x1="27" y1="20" x2="55" y2="20" stroke="#94a3b8" strokeWidth="2" />
        <line x1="27" y1="27" x2="55" y2="27" stroke="#94a3b8" strokeWidth="2" />
        <line x1="27" y1="34" x2="46" y2="34" stroke="#94a3b8" strokeWidth="2" />
        <g className="cn-audit-stamp">
          <circle cx="80" cy="29" r="13" fill="#dcfce7" stroke="#16a34a" strokeWidth="2.5" />
          <path d="M74 29 L78 33 L86 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="16" y="65" fontSize="9" fontWeight="700" fill="#15803d">AUDITOR &amp; TATA LETAK</text>
      </svg>
    );
  }

  if (stageIndex === 3) {
    // Animasi 4: Kemas Paket (naskah masuk ke kotak paket tersegel)
    return (
      <svg width="112" height="72" viewBox="0 0 112 72" className={`cn-svg ${animClass}`} aria-hidden="true">
        <rect x="8" y="48" width="96" height="5" rx="2" fill="#1e293b" />
        <rect x="22" y="14" width="16" height="20" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" className="cn-pack-sheet" />
        <g className="cn-pack-box">
          <rect x="52" y="22" width="34" height="26" rx="3" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
          <line x1="69" y1="22" x2="69" y2="48" stroke="#fef3c7" strokeWidth="2.5" />
        </g>
        <text x="16" y="65" fontSize="9" fontWeight="700" fill="#b45309">MENGEMAS PAKET</text>
      </svg>
    );
  }

  // Animasi 5: Unggah Google Drive (paket meluncur ke folder/awan Drive)
  return (
    <svg width="112" height="72" viewBox="0 0 112 72" className={`cn-svg ${animClass}`} aria-hidden="true">
      <rect x="8" y="48" width="96" height="5" rx="2" fill="#1e293b" />
      <g className="cn-drive-packet">
        <rect x="18" y="26" width="22" height="16" rx="2" fill="#2563eb" />
        <path d="M44 34 H56" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d="M62 20 H74 L77 24 H94 V46 H62 Z" fill="#16a34a" />
      <text x="16" y="65" fontSize="9" fontWeight="700" fill="#15803d">TERKIRIM KE GOOGLE DRIVE</text>
    </svg>
  );
};

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
  const activeSlot = pickSingleActiveSlot(slots);

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
        .cn-single-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05);
        }
        .cn-single-card.is-running {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
        }
        .cn-single-card.is-error {
          border-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.14);
        }
        .cn-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .cn-slot-tag {
          background: #0f172a;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 10px;
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
          gap: 14px;
          background: #f1f5f9;
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 14px;
        }
        .cn-desk-status {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .cn-desk-sub {
          font-size: 12px;
          color: #475569;
          margin-top: 4px;
        }
        .cn-desk-err {
          font-size: 12px;
          color: #b91c1c;
          font-weight: 600;
          margin-top: 5px;
        }
        .cn-steps {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
          margin-bottom: 14px;
        }
        .cn-step-pill {
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          padding: 7px 4px;
          border-radius: 7px;
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
          margin-bottom: 6px;
        }
        .cn-bar-track {
          width: 100%;
          height: 11px;
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
          margin-top: 12px;
          padding: 9px 12px;
          border-radius: 8px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          font-size: 12px;
          color: #1e3a8a;
        }

        @keyframes cnScanMove {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-18px, 3px); }
        }
        @keyframes cnBodyBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2.5px); }
        }
        @keyframes cnHandTap {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-2px, 2px); }
        }
        @keyframes cnStampPress {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(3px) scale(0.96); }
        }
        @keyframes cnPackSlide {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(12px, 4px); }
        }
        @keyframes cnDriveFly {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(10px); }
        }
        @keyframes cnPulse {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }

        .cn-svg.is-animating .cn-research-scan {
          animation: cnScanMove 1.4s ease-in-out infinite;
        }
        .cn-svg.is-animating .cn-write-author {
          animation: cnBodyBob 0.55s ease-in-out infinite;
        }
        .cn-svg.is-animating .cn-write-hand {
          animation: cnHandTap 0.3s ease-in-out infinite;
        }
        .cn-svg.is-animating .cn-write-screen {
          animation: cnPulse 0.8s ease-in-out infinite;
        }
        .cn-svg.is-animating .cn-audit-stamp {
          animation: cnStampPress 1.1s ease-in-out infinite;
        }
        .cn-svg.is-animating .cn-pack-sheet {
          animation: cnPackSlide 1.3s ease-in-out infinite;
        }
        .cn-svg.is-animating .cn-drive-packet {
          animation: cnDriveFly 1.1s ease-in-out infinite;
        }
      `}</style>

      <div className="cn-header">
        <div>
          <h2 className="cn-title">CuanNovel — Ruang Kantor Pipeline (1 Novel Aktif)</h2>
          <div className="cn-meta">
            Batch: <code>{batchId}</code> · {authorPublisher} · Lolos: <strong>{passedCount}</strong> · Status:{' '}
            <strong>{statusText}</strong>
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
            {busy ? 'Worker Bekerja...' : 'Jalankan 1 Langkah Worker'}
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

      {!activeSlot ? (
        <div className="cn-single-card">
          Tidak ada slot novel aktif saat ini. Klik <strong>Refresh Status</strong> untuk memuat batch terbaru.
        </div>
      ) : (
        (() => {
          const total = Math.max(1, activeSlot.totalChapters || 20);
          const pct = Math.min(100, Math.round((activeSlot.chaptersDone / total) * 100));
          const isErr = Boolean(activeSlot.error);
          const stageIdx = getStageIndex(activeSlot.stage, activeSlot.chaptersDone, total);
          const stageMeta = PIPELINE_STAGES[stageIdx] || PIPELINE_STAGES[0];

          const badgeText = activeSlot.isRunning
            ? 'SEDANG DIPROSES'
            : isErr
              ? 'PERLU ULANG'
              : stageIdx === 4
                ? 'DI GOOGLE DRIVE'
                : 'AKTIF';

          const badgeClass = activeSlot.isRunning
            ? 'cn-badge cn-badge-run'
            : isErr
              ? 'cn-badge cn-badge-err'
              : 'cn-badge cn-badge-idle';

          return (
            <div
              className={`cn-single-card ${activeSlot.isRunning ? 'is-running' : ''} ${
                isErr ? 'is-error' : ''
              }`}
            >
              <div className="cn-card-top">
                <div>
                  <span className="cn-slot-tag">Novel Aktif · Slot #{activeSlot.slot}</span>
                  <span className="cn-stage-text">{activeSlot.stage}</span>
                </div>
                <span className={badgeClass}>{badgeText}</span>
              </div>

              <div className="cn-desk-box">
                <StageAnimationArt
                  stageIndex={stageIdx}
                  isRunning={Boolean(activeSlot.isRunning || autoRun)}
                  isError={isErr}
                />

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cn-desk-status">
                    {activeSlot.isRunning
                      ? `${stageMeta.label} — Sedang memproses...`
                      : `Tahap aktif: ${stageMeta.label}`}
                  </div>
                  <div className="cn-desk-sub">
                    {stageMeta.caption}
                    {typeof activeSlot.lastWords === 'number'
                      ? ` · Bab terakhir: ${activeSlot.lastWords} kata`
                      : ''}
                    {activeSlot.provider ? ` · ${activeSlot.provider}` : ''}
                  </div>
                  {isErr && <div className="cn-desk-err">{activeSlot.error}</div>}
                </div>
              </div>

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

              <div>
                <div className="cn-bar-head">
                  <span>Progres Bab Novel</span>
                  <span>
                    {activeSlot.chaptersDone}/{total} bab ({pct}%)
                  </span>
                </div>
                <div className="cn-bar-track">
                  <div
                    className={`cn-bar-fill ${isErr ? 'err' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {(activeSlot.driveFileName || activeSlot.driveUrl || stageIdx === 4) && (
                <div className="cn-drive-box">
                  Paket Google Drive:{' '}
                  <strong>
                    {activeSlot.driveFileName || `Paket_Novel_Slot_${activeSlot.slot}.zip`}
                  </strong>
                  {activeSlot.driveUrl ? (
                    <>
                      {' '}
                      ·{' '}
                      <a href={activeSlot.driveUrl} target="_blank" rel="noreferrer">
                        Buka Folder Drive
                      </a>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
};
