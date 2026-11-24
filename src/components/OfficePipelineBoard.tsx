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
  onJumpToPackaging?: (slot: PipelineSlotState) => void;
  onClearLog?: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  busy?: boolean;
  deletingSlot?: number | null;
}

interface WorkerRoleConfig {
  key: string;
  stationLabel: string;
  shortTitle: string;
  roleTitle: string;
  workBubble: string;
  idleBubble: string;
  shirtColor: string;
  hairColor: string;
  roamAnimClass: string;
}

const WORKER_ROLES: WorkerRoleConfig[] = [
  {
    key: 'scout_research',
    stationLabel: '1. Riset',
    shortTitle: 'Riset Proyek',
    roleTitle: 'Riset Novel',
    workBubble: 'Riset ide & sinopsis...',
    idleBubble: 'Mondar-mandir cari ide...',
    shirtColor: '#0ea5e9',
    hairColor: '#1e293b',
    roamAnimClass: 'roam-a'
  },
  {
    key: 'novelku_production',
    stationLabel: '2. Tulis Bab',
    shortTitle: 'Tulis Bab',
    roleTitle: 'Penulis Bab',
    workBubble: 'Mengetik bab cerita...',
    idleBubble: 'Jalan-jalan cari inspirasi...',
    shirtColor: '#2563eb',
    hairColor: '#7c2d12',
    roamAnimClass: 'roam-b'
  },
  {
    key: 'formatting_kdp',
    stationLabel: '3. Audit & Rapikan',
    shortTitle: 'Audit & Rapikan',
    roleTitle: 'Auditor KDP',
    workBubble: 'Cek skor & tata letak...',
    idleBubble: 'Mondar-mandir santai...',
    shirtColor: '#10b981',
    hairColor: '#334155',
    roamAnimClass: 'roam-c'
  },
  {
    key: 'cover_generation',
    stationLabel: '4. Cover & Kemas',
    shortTitle: 'Cover & Kemas Paket',
    roleTitle: 'Desainer Cover',
    workBubble: 'Desain cover & kemas...',
    idleBubble: 'Jalan-jalan cek katalog...',
    shirtColor: '#8b5cf6',
    hairColor: '#d97706',
    roamAnimClass: 'roam-d'
  },
  {
    key: 'gdrive_upload',
    stationLabel: '5. Google Drive',
    shortTitle: 'Google Drive',
    roleTitle: 'Kurir Drive',
    workBubble: 'Kirim ke Google Drive...',
    idleBubble: 'Mondar-mandir istirahat...',
    shirtColor: '#f59e0b',
    hairColor: '#0f172a',
    roamAnimClass: 'roam-e'
  }
];

function getStageIndex(stage: string, chaptersDone: number, totalChapters: number): number {
  const s = (stage || '').toLowerCase();
  if (s.includes('drive') || s.includes('upload') || s.includes('done') || s.includes('completed')) {
    return 4;
  }
  if (s.includes('pack') || s.includes('zip') || s.includes('export') || s.includes('cover')) {
    return 3;
  }
  if (s.includes('audit') || s.includes('format') || s.includes('edit') || s.includes('kdp')) {
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
        st.includes('cover') ||
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

const WorkerCharacterSvg: React.FC<{
  workerIndex: number;
  shirtColor: string;
  hairColor: string;
  workingHere: boolean;
  roamingNow: boolean;
}> = ({ workerIndex, shirtColor, hairColor, workingHere, roamingNow }) => {
  return (
    <svg width="56" height="58" viewBox="0 0 56 58" aria-hidden="true">
      {/* Bayangan di lantai */}
      <ellipse cx="28" cy="54" rx="13" ry="3" fill="#0f172a" opacity="0.16" />

      <g className={workingHere ? 'wk-work-bounce' : roamingNow ? 'wk-walk-bob' : ''}>
        {/* Kaki kiri & kanan */}
        <line
          x1="23"
          y1="40"
          x2="23"
          y2="52"
          stroke="#1e293b"
          strokeWidth="3.4"
          strokeLinecap="round"
          className={roamingNow ? 'wk-leg-a' : ''}
        />
        <line
          x1="33"
          y1="40"
          x2="33"
          y2="52"
          stroke="#1e293b"
          strokeWidth="3.4"
          strokeLinecap="round"
          className={roamingNow ? 'wk-leg-b' : ''}
        />

        {/* Badan */}
        <rect x="18" y="25" width="20" height="16" rx="5" fill={shirtColor} />

        {/* Aksesori khas tiap pekerja */}
        {workerIndex === 0 && (
          <circle cx="42" cy="31" r="4.2" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.8" />
        )}
        {workerIndex === 1 && (
          <rect x="39" y="27" width="8" height="10" rx="1.2" fill="#ffffff" stroke="#64748b" strokeWidth="1.2" />
        )}
        {workerIndex === 2 && (
          <circle cx="42" cy="29" r="4.5" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5" />
        )}
        {workerIndex === 3 && (
          <rect x="39" y="27" width="9" height="11" rx="1.5" fill="#1e293b" stroke="#fbbf24" strokeWidth="1.2" />
        )}
        {workerIndex === 4 && (
          <rect x="38" y="28" width="10" height="9" rx="1.5" fill="#f59e0b" stroke="#92400e" strokeWidth="1.2" />
        )}

        {/* Tangan */}
        <line
          x1="18"
          y1="29"
          x2="12"
          y2="36"
          stroke="#fcd34d"
          strokeWidth="3"
          strokeLinecap="round"
          className={workingHere ? 'wk-arm-work' : roamingNow ? 'wk-arm-walk' : ''}
        />
        <line
          x1="38"
          y1="29"
          x2="44"
          y2="36"
          stroke="#fcd34d"
          strokeWidth="3"
          strokeLinecap="round"
          className={workingHere ? 'wk-arm-work-alt' : roamingNow ? 'wk-arm-walk-alt' : ''}
        />

        {/* Kepala */}
        <rect x="19" y="9" width="18" height="16" rx="5" fill="#fde68a" stroke="#d97706" strokeWidth="1.2" />
        <path d="M19 14 C19 8, 37 8, 37 14 Z" fill={hairColor} />

        {/* Mata */}
        <circle cx="24.5" cy="18" r="1.7" fill="#0f172a" />
        <circle cx="31.5" cy="18" r="1.7" fill="#0f172a" />
      </g>
    </svg>
  );
};

const FiveWorkersOfficeFloor: React.FC<{
  isAnyWorking: boolean;
  activeStageIdx: number;
  lastWords?: number;
  chaptersDone: number;
  totalChapters: number;
}> = ({ isAnyWorking, activeStageIdx, lastWords, chaptersDone, totalChapters }) => {
  const getDynamicWorkText = (idx: number, defaultText: string) => {
    if (idx === 1 && chaptersDone > 0) {
      return `Bab ${chaptersDone}/${totalChapters}${lastWords ? ` (${lastWords}k)` : ''}`;
    }
    return defaultText;
  };

  return (
    <div className={`cn-floor-panel ${isAnyWorking ? 'is-busy' : 'is-idle'}`}>
      <div className="cn-floor-head">
        <div>
          <strong>Ruang 5 Pekerja CuanNovel</strong>
          <span className="cn-floor-sub">
            {isAnyWorking
              ? `Pekerja aktif di stasiun #${activeStageIdx + 1} (${WORKER_ROLES[activeStageIdx]?.roleTitle}) — pekerja lain bersiaga.`
              : 'Tidak ada kerjaan berjalan — semua 5 pekerja mondar-mandir santai di ruang kantor.'}
          </span>
        </div>
        <span className={`cn-floor-chip ${isAnyWorking ? 'chip-work' : 'chip-idle'}`}>
          {isAnyWorking ? 'MODE KERJA AKTIF' : 'MODE MONDAR-MANDIR (IDLE)'}
        </span>
      </div>

      <div className="cn-floor-stage">
        {WORKER_ROLES.map((w, idx) => {
          const workingHere = isAnyWorking && idx === activeStageIdx;
          const roamingNow = !isAnyWorking;
          const bubbleText = workingHere
            ? getDynamicWorkText(idx, w.workBubble)
            : roamingNow
              ? w.idleBubble
              : 'Siaga di meja';

          return (
            <div
              key={w.key}
              className={`cn-worker-lane ${workingHere ? 'is-working-lane' : ''} ${
                roamingNow ? w.roamAnimClass : ''
              }`}
            >
              <div className={`cn-speech-bubble ${workingHere ? 'bubble-active' : ''}`}>
                {bubbleText}
              </div>

              <div className="cn-worker-visual">
                <WorkerCharacterSvg
                  workerIndex={idx}
                  shirtColor={w.shirtColor}
                  hairColor={w.hairColor}
                  workingHere={workingHere}
                  roamingNow={roamingNow}
                />
                {!roamingNow && (
                  <div className="cn-mini-desk">
                    <div className="cn-mini-monitor" />
                  </div>
                )}
              </div>

              <div className="cn-worker-tag">
                <span className="cn-dot" style={{ background: workingHere ? '#10b981' : w.shirtColor }} />
                <span>{w.roleTitle}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
  onJumpToPackaging,
  onClearLog,
  autoRun,
  onToggleAutoRun,
  busy = false,
  deletingSlot = null
}) => {
  const [fileTab, setFileTab] = useState<'unfinished' | 'finished'>('unfinished');
  const [copiedBatch, setCopiedBatch] = useState(false);

  const activeSlot = pickSingleActiveSlot(slots);
  const finishedFiles = slots.filter((s) => isSlotFinished(s));
  const unfinishedFiles = slots.filter((s) => !isSlotFinished(s));
  const visibleFiles = fileTab === 'finished' ? finishedFiles : unfinishedFiles;

  const isAnyWorking = Boolean(busy || autoRun || activeSlot?.isRunning);
  const totalChapters = Math.max(1, activeSlot?.totalChapters || 20);
  const activeStageIdx = activeSlot
    ? getStageIndex(activeSlot.stage, activeSlot.chaptersDone, totalChapters)
    : 0;

  const handleCopyBatchId = () => {
    if (!batchId || batchId === '-') return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(batchId);
      setCopiedBatch(true);
      setTimeout(() => setCopiedBatch(false), 1800);
    }
  };

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
          margin-bottom: 14px;
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
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
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
        .cn-btn-green:hover:not(:disabled) {
          background: #047857;
        }
        .cn-btn-amber {
          background: #d97706;
          border-color: #d97706;
          color: #ffffff;
        }
        .cn-btn-blue {
          background: #eff6ff;
          border-color: #93c5fd;
          color: #1d4ed8;
          padding: 6px 10px;
          font-size: 12px;
        }
        .cn-btn-blue:hover:not(:disabled) {
          background: #dbeafe;
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

        /* Panel Ruang 5 Pekerja + Mondar-Mandir */
        .cn-floor-panel {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 16px;
        }
        .cn-floor-panel.is-busy {
          border-color: #34d399;
          background: #f0fdf4;
        }
        .cn-floor-head {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .cn-floor-sub {
          display: block;
          font-size: 12px;
          color: #475569;
          margin-top: 2px;
        }
        .cn-floor-chip {
          font-size: 11px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 999px;
        }
        .chip-work {
          background: #059669;
          color: #ffffff;
        }
        .chip-idle {
          background: #e0f2fe;
          color: #0369a1;
        }

        .cn-floor-stage {
          display: grid;
          grid-template-columns: repeat(5, minmax(120px, 1fr));
          gap: 10px;
          padding: 12px 8px 10px 8px;
          border-radius: 10px;
          background: repeating-linear-gradient(
            90deg,
            #f8fafc 0px,
            #f8fafc 36px,
            #f1f5f9 36px,
            #f1f5f9 72px
          );
          border: 1px dashed #cbd5e1;
          overflow: hidden;
        }
        @media (max-width: 820px) {
          .cn-floor-stage {
            grid-template-columns: repeat(2, minmax(140px, 1fr));
          }
        }

        .cn-worker-lane {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          min-height: 118px;
          padding: 4px;
          border-radius: 8px;
        }
        .cn-worker-lane.is-working-lane {
          background: rgba(16, 185, 129, 0.12);
          outline: 1.5px solid #10b981;
        }

        .cn-speech-bubble {
          background: #ffffff;
          border: 1px solid #94a3b8;
          color: #0f172a;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 7px;
          border-radius: 999px;
          white-space: nowrap;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          box-shadow: 0 2px 5px rgba(15, 23, 42, 0.08);
        }
        .cn-speech-bubble.bubble-active {
          background: #0f172a;
          border-color: #0f172a;
          color: #ffffff;
        }

        .cn-worker-visual {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 2px;
          margin-top: 4px;
        }
        .cn-mini-desk {
          width: 16px;
          height: 22px;
          border-bottom: 3px solid #475569;
          border-left: 2px solid #94a3b8;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 2px;
        }
        .cn-mini-monitor {
          width: 10px;
          height: 8px;
          background: #38bdf8;
          border-radius: 1.5px;
        }

        .cn-worker-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
          margin-top: 4px;
        }
        .cn-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          display: inline-block;
        }

        @keyframes roamLeftRightA {
          0% { transform: translateX(-10px) scaleX(1); }
          45% { transform: translateX(14px) scaleX(1); }
          50% { transform: translateX(14px) scaleX(-1); }
          95% { transform: translateX(-10px) scaleX(-1); }
          100% { transform: translateX(-10px) scaleX(1); }
        }
        @keyframes roamLeftRightB {
          0% { transform: translateX(12px) scaleX(-1); }
          45% { transform: translateX(-12px) scaleX(-1); }
          50% { transform: translateX(-12px) scaleX(1); }
          95% { transform: translateX(12px) scaleX(1); }
          100% { transform: translateX(12px) scaleX(-1); }
        }
        @keyframes wkBounce {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes wkLegSwing {
          0%, 100% { transform: rotate(-18deg); transform-origin: 23px 40px; }
          50% { transform: rotate(18deg); transform-origin: 23px 40px; }
        }
        @keyframes wkArmSwing {
          0%, 100% { transform: rotate(-15deg); transform-origin: 18px 29px; }
          50% { transform: rotate(15deg); transform-origin: 18px 29px; }
        }

        .roam-a, .roam-c, .roam-e {
          animation: roamLeftRightA 5.2s ease-in-out infinite;
        }
        .roam-b, .roam-d {
          animation: roamLeftRightB 5.8s ease-in-out infinite;
        }
        .wk-work-bounce {
          animation: wkBounce 0.55s ease-in-out infinite;
        }
        .wk-leg-a, .wk-leg-b {
          animation: wkLegSwing 0.45s ease-in-out infinite;
        }
        .wk-arm-work, .wk-arm-work-alt {
          animation: wkArmSwing 0.35s ease-in-out infinite;
        }

        .cn-stations-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(120px, 1fr));
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
          opacity: 0.72;
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
        .cn-station-label {
          font-size: 11.5px;
          font-weight: 700;
          color: #0f172a;
        }
        .cn-station-state {
          font-size: 10px;
          font-weight: 800;
          margin-top: 3px;
          color: #475569;
        }

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
        .cn-action-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
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
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
        }
        .cn-tab-group {
          display: flex;
          gap: 8px;
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
          <button type="button" onClick={handleCopyBatchId} disabled={batchId === '-'} className="cn-btn">
            {copiedBatch ? 'Batch ID Tersalin' : 'Salin Batch ID'}
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

      <FiveWorkersOfficeFloor
        isAnyWorking={isAnyWorking}
        activeStageIdx={activeStageIdx}
        lastWords={activeSlot?.lastWords}
        chaptersDone={activeSlot?.chaptersDone || 0}
        totalChapters={totalChapters}
      />

      <div className="cn-stations-grid">
        {WORKER_ROLES.map((st, idx) => {
          const isDone = activeSlot ? idx < activeStageIdx : false;
          const isCurrent = activeSlot ? idx === activeStageIdx : false;
          const stateLabel = isCurrent
            ? isAnyWorking
              ? 'SEDANG JALAN'
              : 'SIAGA'
            : isDone
              ? 'SELESAI'
              : 'MENUNGGU';

          return (
            <div
              key={st.key}
              className={`cn-station-box ${isCurrent ? 'is-current' : isDone ? 'is-done' : ''}`}
            >
              <div className="cn-station-label">{st.stationLabel}</div>
              <div className="cn-station-state">{stateLabel}</div>
            </div>
          );
        })}
      </div>

      {activeSlot && (() => {
        const pct = Math.min(100, Math.round((activeSlot.chaptersDone / totalChapters) * 100));
        const isErr = Boolean(activeSlot.error);

        return (
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

              <div className="cn-action-group">
                {onJumpToPackaging && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onJumpToPackaging(activeSlot)}
                    className="cn-btn cn-btn-blue"
                  >
                    Kemas &amp; Upload Sekarang
                  </button>
                )}
                {activeSlot.driveUrl && (
                  <a
                    href={activeSlot.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cn-btn cn-btn-blue"
                  >
                    Buka Drive
                  </a>
                )}
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
            </div>

            <div style={{ marginTop: 8, fontSize: 12.5, color: '#334155' }}>
              Tahap berjalan: <strong>{WORKER_ROLES[activeStageIdx]?.shortTitle}</strong>
              {typeof activeSlot.lastWords === 'number'
                ? ` · Bab terakhir: ${activeSlot.lastWords} kata`
                : ''}
              {activeSlot.provider ? ` · ${activeSlot.provider}` : ''}
            </div>

            {isErr && <div className="cn-err-text">{activeSlot.error}</div>}

            <div className="cn-bar-head">
              <span>Progres Bab</span>
              <span>
                {activeSlot.chaptersDone}/{totalChapters} bab ({pct}%)
              </span>
            </div>
            <div className="cn-bar-track">
              <div className={`cn-bar-fill ${isErr ? 'err' : ''}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}

      <div className="cn-files-box">
        <div className="cn-tabs">
          <div className="cn-tab-group">
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

          {onClearLog && (
            <button
              type="button"
              onClick={onClearLog}
              className="cn-btn"
              style={{ padding: '5px 10px', fontSize: 12 }}
            >
              Bersihkan Log
            </button>
          )}
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

              <div className="cn-action-group">
                {onJumpToPackaging && !isSlotFinished(item) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onJumpToPackaging(item)}
                    className="cn-btn cn-btn-blue"
                  >
                    Kemas
                  </button>
                )}
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
            </div>
          ))
        )}
      </div>
    </div>
  );
};
