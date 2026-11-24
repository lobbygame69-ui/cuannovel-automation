'use client';

import React, { useState } from 'react';

export interface PipelineSlotState {
  id?: string;
  slot: number;
  projectId?: string | null;
  title?: string;
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
  onDeleteItem?: (slot: PipelineSlotState) => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  busy?: boolean;
  deletingSlot?: number | null;
}

const PIPELINE_STAGES = [
  { key: 'scout_research', label: '1. Riset', shortTitle: 'Riset Proyek' },
  { key: 'novelku_production', label: '2. Tulis Bab', shortTitle: 'Tulis Bab' },
  { key: 'formatting_kdp', label: '3. Audit & Rapikan', shortTitle: 'Audit & Rapikan' },
  { key: 'packaging_zip', label: '4. Kemas Paket', shortTitle: 'Kemas Paket' },
  { key: 'gdrive_upload', label: '5. Google Drive', shortTitle: 'Google Drive' }
];

function getStageIndex(stage: string, chaptersDone: number, totalChapters: number): number {
  const s = (stage || '').toLowerCase();
  if (s.includes('drive') || s.includes('upload') || s.includes('done') || s.includes('completed')) {
    return 4;
  }
  if (s.includes('pack') || s.includes('zip') || s.includes('export')) {
    return 3;
  }
  if (
    s.includes('audit') ||
    s.includes('format') ||
    s.includes('edit') ||
    s.includes('kdp') ||
    s.includes('cover')
  ) {
    return 2;
  }
  if (
    s.includes('novelku') ||
    s.includes('production') ||
    s.includes('write') ||
    chaptersDone > 0
  ) {
    if (totalChapters > 0 && chaptersDone >= totalChapters) return 2;
    return 1;
  }
  return 0;
}

function isSlotFinished(s: PipelineSlotState): boolean {
  const st = (s.stage || '').toLowerCase();
  return (
    st.includes('completed') ||
    st.includes('done') ||
    Boolean(s.driveUrl) ||
    Boolean(s.driveFileName)
  );
}

function pickSingleActiveSlot(slots: PipelineSlotState[]): PipelineSlotState | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  const running = slots.find((s) => s.isRunning);
  if (running) return running;

  const inProgress = slots.find((s) => {
    const st = (s.stage || '').toLowerCase();
    return (
      !isSlotFinished(s) &&
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

  const firstUnfinished = slots.find((s) => {
    const st = (s.stage || '').toLowerCase();
    return !isSlotFinished(s) && !st.includes('failed_purged');
  });
  return firstUnfinished || slots[0];
}

const SingleStationSvg: React.FC<{
  stationIndex: number;
  active: boolean;
  isError: boolean;
}> = ({ stationIndex, active, isError }) => {
  const stateCls = active ? 'is-live' : 'is-rest';

  if (stationIndex === 0) {
    return (
      <svg width="76" height="52" viewBox="0 0 76 52" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="6" y="10" width="34" height="24" rx="3" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.8" />
        <line x1="11" y1="17" x2="33" y2="17" stroke="#64748b" strokeWidth="2" />
        <line x1="11" y1="23" x2="35" y2="23" stroke="#94a3b8" strokeWidth="2" />
        <line x1="11" y1="29" x2="25" y2="29" stroke="#0284c7" strokeWidth="2" />
        <g className="st-anim-riset">
          <circle cx="50" cy="22" r="8.5" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2.5" />
          <line x1="56" y1="28" x2="64" y2="36" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" />
        </g>
        <rect x="4" y="42" width="68" height="4" rx="2" fill="#334155" />
      </svg>
    );
  }

  if (stationIndex === 1) {
    return (
      <svg width="76" height="52" viewBox="0 0 76 52" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="8" y="11" width="26" height="19" rx="2.5" fill="#0f172a" />
        <rect
          x="10.5"
          y="13.5"
          width="21"
          height="14"
          rx="1"
          fill={active && isError ? '#ef4444' : active ? '#10b981' : '#64748b'}
          className="st-anim-screen"
        />
        <rect x="19" y="30" width="4" height="12" fill="#64748b" />
        <g className="st-anim-tulis">
          <circle cx="48" cy="15" r="5" fill="#f59e0b" />
          <path d="M40 42 C40 27, 56 27, 56 42 Z" fill="#2563eb" />
          <circle cx="39" cy="34" r="2.2" fill="#fbbf24" className="st-anim-tangan" />
        </g>
        <rect x="4" y="42" width="68" height="4" rx="2" fill="#334155" />
      </svg>
    );
  }

  if (stationIndex === 2) {
    return (
      <svg width="76" height="52" viewBox="0 0 76 52" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="10" y="10" width="32" height="26" rx="3" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.8" />
        <line x1="15" y1="17" x2="36" y2="17" stroke="#94a3b8" strokeWidth="2" />
        <line x1="15" y1="23" x2="36" y2="23" stroke="#94a3b8" strokeWidth="2" />
        <line x1="15" y1="29" x2="29" y2="29" stroke="#94a3b8" strokeWidth="2" />
        <g className="st-anim-audit">
          <circle cx="56" cy="24" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="2.2" />
          <path d="M51 24 L54.5 27.5 L61.5 20" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <rect x="4" y="42" width="68" height="4" rx="2" fill="#334155" />
      </svg>
    );
  }

  if (stationIndex === 3) {
    return (
      <svg width="76" height="52" viewBox="0 0 76 52" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="10" y="12" width="14" height="18" rx="1.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" className="st-anim-kemas" />
        <rect x="34" y="18" width="28" height="24" rx="3" fill="#f59e0b" stroke="#b45309" strokeWidth="1.8" />
        <line x1="48" y1="18" x2="48" y2="42" stroke="#fef3c7" strokeWidth="2" />
        <rect x="4" y="42" width="68" height="4" rx="2" fill="#334155" />
      </svg>
    );
  }

  return (
    <svg width="76" height="52" viewBox="0 0 76 52" className={`st-svg ${stateCls}`} aria-hidden="true">
      <g className="st-anim-drive">
        <rect x="8" y="21" width="18" height="13" rx="2" fill="#2563eb" />
      </g>
      <path d="M38 14 H49 L52 18 H68 V38 H38 Z" fill="#16a34a" />
      <rect x="4" y="42" width="68" height="4" rx="2" fill="#334155" />
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
  onDeleteItem,
  autoRun,
  onToggleAutoRun,
  busy = false,
  deletingSlot = null
}) => {
  const [fileTab, setFileTab] = useState<'unfinished' | 'finished'>('unfinished');

  const activeSlot = pickSingleActiveSlot(slots);
  const finishedFiles = slots.filter((s) => isSlotFinished(s));
  const unfinishedFiles = slots.filter((s) => !isSlotFinished(s));
  const visibleFiles = fileTab === 'finished' ? finishedFiles : unfinishedFiles;

  return (
    <div className="cn-wrap">
      <style>{`
        .cn-wrap {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          padding: 20px;
          color: #0f172a;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
        }
        .cn-top {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding-bottom: 14px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 16px;
        }
        .cn-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 4px 0;
        }
        .cn-meta {
          font-size: 12.5px;
          color: #475569;
          line-height: 1.5;
        }
        .cn-meta code {
          background: #e2e8f0;
          padding: 2px 6px;
          border-radius: 5px;
          color: #0f172a;
        }
        .cn-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cn-btn {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          padding: 8px 13px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .cn-btn:hover:not(:disabled) {
          background: #f1f5f9;
        }
        .cn-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .cn-btn-green {
          background: #059669;
          border-color: #059669;
          color: #ffffff;
        }
        .cn-btn-amber {
          background: #d97706;
          border-color: #d97706;
          color: #ffffff;
        }
        .cn-btn-danger {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #991b1b;
          padding: 6px 10px;
          font-size: 12px;
        }
        .cn-btn-danger:hover:not(:disabled) {
          background: #fecaca;
        }

        /* 5 Kotak Stasiun Terpisah */
        .cn-stations-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(130px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        @media (max-width: 820px) {
          .cn-stations-grid {
            grid-template-columns: repeat(2, minmax(140px, 1fr));
          }
        }
        .cn-station-box {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          text-align: center;
          opacity: 0.65;
        }
        .cn-station-box.is-done {
          border-color: #86efac;
          background: #f0fdf4;
          opacity: 1;
        }
        .cn-station-box.is-current {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
          background: #eff6ff;
          opacity: 1;
        }
        .cn-station-box.is-current.is-stopped {
          border-color: #94a3b8;
          box-shadow: none;
          background: #f1f5f9;
          opacity: 0.92;
        }
        .cn-station-box.is-current.is-err {
          border-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
          background: #fef2f2;
        }
        .cn-station-label {
          font-size: 11px;
          font-weight: 700;
          margin-top: 4px;
          color: #0f172a;
        }
        .cn-station-state {
          font-size: 10px;
          font-weight: 700;
          margin-top: 2px;
          color: #475569;
        }
        .cn-station-box.is-current.is-stopped .cn-station-state {
          color: #475569;
        }

        /* Kartu 1 Novel Aktif */
        .cn-active-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
        }
        .cn-active-card.is-err {
          border-color: #ef4444;
        }
        .cn-row-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .cn-pill {
          display: inline-block;
          background: #0f172a;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 6px;
        }
        .cn-err-text {
          color: #b91c1c;
          font-size: 12px;
          font-weight: 600;
          margin-top: 6px;
        }
        .cn-bar-head {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
          margin: 12px 0 5px 0;
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
          transition: width 0.35s ease;
        }
        .cn-bar-fill.err {
          background: #ef4444;
        }

        /* Panel File Sudah Jadi & Belum Jadi */
        .cn-files-box {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
        }
        .cn-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .cn-tab {
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          color: #334155;
        }
        .cn-tab.active {
          background: #0f172a;
          border-color: #0f172a;
          color: #ffffff;
        }
        .cn-file-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 8px;
          background: #f8fafc;
        }
        .cn-file-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }
        .cn-file-sub {
          font-size: 11.5px;
          color: #475569;
          margin-top: 2px;
        }

        @keyframes animRiset {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-12px, 3px); }
        }
        @keyframes animTulis {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2.5px); }
        }
        @keyframes animTangan {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-2px, 2px); }
        }
        @keyframes animAudit {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(3px); }
        }
        @keyframes animKemas {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(11px, 4px); }
        }
        @keyframes animDrive {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(10px); }
        }
        @keyframes animBlink {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        .st-svg.is-live .st-anim-riset { animation: animRiset 1.3s ease-in-out infinite; }
        .st-svg.is-live .st-anim-tulis { animation: animTulis 0.55s ease-in-out infinite; }
        .st-svg.is-live .st-anim-tangan { animation: animTangan 0.3s ease-in-out infinite; }
        .st-svg.is-live .st-anim-screen { animation: animBlink 0.8s ease-in-out infinite; }
        .st-svg.is-live .st-anim-audit { animation: animAudit 1.1s ease-in-out infinite; }
        .st-svg.is-live .st-anim-kemas { animation: animKemas 1.2s ease-in-out infinite; }
        .st-svg.is-live .st-anim-drive { animation: animDrive 1.1s ease-in-out infinite; }

        .st-svg.is-rest * {
          animation: none !important;
        }
      `}</style>

      <div className="cn-top">
        <div>
          <h2 className="cn-title">CuanNovel — Ruang Kantor Pipeline (1 Novel Aktif)</h2>
          <div className="cn-meta">
            Batch: <code>{batchId}</code> · {authorPublisher} · Lolos: <strong>{passedCount}</strong> · Status:{' '}
            <strong>{statusText}</strong>
          </div>
        </div>

        <div className="cn-btns">
          <button type="button" onClick={onRefresh} disabled={busy} className="cn-btn">
            Refresh Status
          </button>
          <button type="button" onClick={onRunOneStep} disabled={busy} className="cn-btn cn-btn-green">
            {busy ? 'Worker Bekerja...' : 'Jalankan 1 Langkah Worker'}
          </button>
          <button
            type="button"
            onClick={onToggleAutoRun}
            className={`cn-btn ${autoRun ? 'cn-btn-amber' : ''}`}
          >
            {autoRun ? 'Hentikan Auto-Run' : 'Auto-Run Bertahap'}
          </button>
        </div>
      </div>

      {activeSlot && (() => {
        const total = Math.max(1, activeSlot.totalChapters || 20);
        const pct = Math.min(100, Math.round((activeSlot.chaptersDone / total) * 100));
        const isErr = Boolean(activeSlot.error);
        const activeStageIdx = getStageIndex(activeSlot.stage, activeSlot.chaptersDone, total);
        const canAnimate = Boolean(activeSlot.isRunning || autoRun);

        return (
          <>
            {/* 5 Stasiun Animasi Terpisah */}
            <div className="cn-stations-grid">
              {PIPELINE_STAGES.map((st, idx) => {
                const isDone = idx < activeStageIdx;
                const isCurrent = idx === activeStageIdx;
                const isStoppedHere = isCurrent && !canAnimate && !isErr;

                const boxCls = isCurrent
                  ? `cn-station-box is-current ${isErr ? 'is-err' : isStoppedHere ? 'is-stopped' : ''}`
                  : isDone
                    ? 'cn-station-box is-done'
                    : 'cn-station-box';

                const stateLabel = isCurrent
                  ? isErr
                    ? 'MENGULANG'
                    : canAnimate
                      ? 'SEDANG JALAN'
                      : 'DIHENTIKAN'
                  : isDone
                    ? 'SELESAI'
                    : 'MENUNGGU';

                return (
                  <div key={st.key} className={boxCls}>
                    <SingleStationSvg
                      stationIndex={idx}
                      active={isCurrent && canAnimate}
                      isError={isErr}
                    />
                    <div className="cn-station-label">{st.label}</div>
                    <div className="cn-station-state">{stateLabel}</div>
                  </div>
                );
              })}
            </div>

            {/* Ringkasan 1 Novel yang Sedang Dikerjakan */}
            <div className={`cn-active-card ${isErr ? 'is-err' : ''}`}>
              <div className="cn-row-between">
                <div>
                  <span className="cn-pill">Novel Aktif · Slot #{activeSlot.slot}</span>
                  <strong style={{ marginLeft: 10, fontSize: 14 }}>
                    {activeSlot.title || `Proyek Novel Slot #${activeSlot.slot}`}
                  </strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                    ({activeSlot.stage})
                  </span>
                </div>

                {onDeleteItem && (
                  <button
                    type="button"
                    disabled={busy || deletingSlot === activeSlot.slot}
                    onClick={() => onDeleteItem(activeSlot)}
                    className="cn-btn cn-btn-danger"
                  >
                    {deletingSlot === activeSlot.slot ? 'Menghapus...' : 'Hapus Novel Aktif'}
                  </button>
                )}
              </div>

              <div style={{ marginTop: 8, fontSize: 12.5, color: '#334155' }}>
                Tahap berjalan: <strong>{PIPELINE_STAGES[activeStageIdx]?.shortTitle}</strong>
                {typeof activeSlot.lastWords === 'number'
                  ? ` · Bab terakhir: ${activeSlot.lastWords} kata`
                  : ''}
                {activeSlot.provider ? ` · ${activeSlot.provider}` : ''}
              </div>

              {isErr && <div className="cn-err-text">{activeSlot.error}</div>}

              <div className="cn-bar-head">
                <span>Progres Bab</span>
                <span>
                  {activeSlot.chaptersDone}/{total} bab ({pct}%)
                </span>
              </div>
              <div className="cn-bar-track">
                <div className={`cn-bar-fill ${isErr ? 'err' : ''}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </>
        );
      })()}

      {/* Daftar Pilihan File: Sudah Jadi vs Belum Jadi + Tombol Hapus */}
      <div className="cn-files-box">
        <div className="cn-tabs">
          <button
            type="button"
            onClick={() => setFileTab('unfinished')}
            className={`cn-tab ${fileTab === 'unfinished' ? 'active' : ''}`}
          >
            Belum Jadi ({unfinishedFiles.length})
          </button>
          <button
            type="button"
            onClick={() => setFileTab('finished')}
            className={`cn-tab ${fileTab === 'finished' ? 'active' : ''}`}
          >
            Sudah Jadi ({finishedFiles.length})
          </button>
        </div>

        {visibleFiles.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#64748b' }}>
            {fileTab === 'finished'
              ? 'Belum ada novel yang selesai / masuk ke daftar sudah jadi.'
              : 'Tidak ada novel berstatus belum jadi.'}
          </div>
        ) : (
          visibleFiles.map((item) => (
            <div key={item.id || item.slot} className="cn-file-item">
              <div>
                <div className="cn-file-title">
                  Slot #{item.slot} — {item.title || item.driveFileName || `Novel_Slot_${item.slot}`}
                </div>
                <div className="cn-file-sub">
                  Bab: {item.chaptersDone}/{item.totalChapters || 20} · Stage: {item.stage}
                  {item.driveUrl ? (
                    <>
                      {' '}
                      ·{' '}
                      <a href={item.driveUrl} target="_blank" rel="noreferrer">
                        Buka di Google Drive
                      </a>
                    </>
                  ) : null}
                </div>
              </div>

              {onDeleteItem && (
                <button
                  type="button"
                  disabled={busy || deletingSlot === item.slot}
                  onClick={() => onDeleteItem(item)}
                  className="cn-btn cn-btn-danger"
                >
                  {deletingSlot === item.slot ? 'Menghapus...' : 'Hapus'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
