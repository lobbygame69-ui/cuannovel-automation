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

const PIPELINE_STAGES = [
  { key: 'scout_research', label: '1. Riset', shortTitle: 'Riset Proyek' },
  { key: 'novelku_production', label: '2. Tulis Bab', shortTitle: 'Tulis Bab' },
  { key: 'formatting_kdp', label: '3. Audit & Rapikan', shortTitle: 'Audit & Rapikan' },
  { key: 'cover_generation', label: '4. Cover & Kemas', shortTitle: 'Cover & Kemas Paket' },
  { key: 'gdrive_upload', label: '5. Google Drive', shortTitle: 'Google Drive' }
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

const AiWorkerRobotBanner: React.FC<{
  isWorking: boolean;
  stageLabel: string;
}> = ({ isWorking, stageLabel }) => {
  const [idleMode, setIdleMode] = useState<'roam' | 'rest'>('roam');

  return (
    <div className={`cn-robot-bay ${isWorking ? 'is-working' : 'is-idle'}`}>
      <div className="cn-robot-info">
        <span className={`cn-robot-badge ${isWorking ? 'work' : 'idle'}`}>
          {isWorking ? 'ROBOT AI · BEKERJA' : idleMode === 'roam' ? 'ROBOT AI · JALAN-JALAN' : 'ROBOT AI · ISTIRAHAT'}
        </span>
        <span className="cn-robot-desc">
          {isWorking
            ? `Sedang mengeksekusi tugas worker di tahap: ${stageLabel}`
            : idleMode === 'roam'
              ? 'Tidak ada antrean berjalan — Robot AI jalan-jalan santai di ruang kantor.'
              : 'Tidak ada antrean berjalan — Robot AI duduk istirahat mengisi baterai.'}
        </span>
      </div>

      {!isWorking && (
        <button
          type="button"
          onClick={() => setIdleMode((prev) => (prev === 'roam' ? 'rest' : 'roam'))}
          className="cn-btn cn-btn-sm"
        >
          {idleMode === 'roam' ? 'Mode Istirahat' : 'Mode Jalan-Jalan'}
        </button>
      )}

      <div className="cn-robot-track">
        <div
          className={`cn-robot-actor ${
            isWorking ? 'act-work' : idleMode === 'roam' ? 'act-roam' : 'act-rest'
          }`}
        >
          <svg width="64" height="54" viewBox="0 0 64 54" aria-hidden="true">
            {/* Antena Robot */}
            <line x1="32" y1="5" x2="32" y2="12" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <circle
              cx="32"
              cy="4.5"
              r="3.2"
              fill={isWorking ? '#10b981' : '#38bdf8'}
              className="rb-ant"
            />
            {/* Kepala */}
            <rect x="18" y="12" width="28" height="17" rx="5" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
            {/* Mata */}
            <circle cx="26.5" cy="20.5" r="2.6" fill={isWorking ? '#34d399' : '#7dd3fc'} className="rb-eye" />
            <circle cx="37.5" cy="20.5" r="2.6" fill={isWorking ? '#34d399' : '#7dd3fc'} className="rb-eye" />
            {/* Badan */}
            <rect x="21" y="30" width="22" height="14" rx="4" fill="#0284c7" />
            <rect x="26" y="34" width="12" height="5" rx="1.5" fill="#e0f2fe" opacity="0.85" />
            {/* Lengan */}
            <line x1="20" y1="33" x2="13" y2="39" stroke="#334155" strokeWidth="2.8" strokeLinecap="round" className="rb-arm-l" />
            <line x1="44" y1="33" x2="51" y2="39" stroke="#334155" strokeWidth="2.8" strokeLinecap="round" className="rb-arm-r" />
            {/* Kaki */}
            <line x1="26" y1="44" x2="26" y2="51" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" className="rb-leg-l" />
            <line x1="38" y1="44" x2="38" y2="51" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" className="rb-leg-r" />
          </svg>
        </div>
      </div>
    </div>
  );
};

const SingleStationSvg: React.FC<{
  stationIndex: number;
  active: boolean;
  isError: boolean;
}> = ({ stationIndex, active, isError }) => {
  const stateCls = active ? 'is-live' : 'is-rest';

  if (stationIndex === 0) {
    return (
      <svg width="92" height="62" viewBox="0 0 92 62" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="6" y="49" width="80" height="4.5" rx="2.2" fill="#334155" />
        <rect x="12" y="15" width="32" height="22" rx="3" fill="#0f172a" stroke="#475569" strokeWidth="1.8" />
        <rect x="14.5" y="17.5" width="27" height="16" rx="1.5" fill="#38bdf8" className="st-anim-screen" />
        <line x1="17.5" y1="21.5" x2="34" y2="21.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="17.5" y1="25.5" x2="38" y2="25.5" stroke="#e0f2fe" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="17.5" y1="29.5" x2="29" y2="29.5" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
        <rect x="25" y="37" width="6" height="12" fill="#64748b" />
        <rect x="16" y="45" width="18" height="3.5" rx="1.5" fill="#94a3b8" />

        <g className="st-anim-riset-body">
          <circle cx="56" cy="18" r="6.2" fill="#fbbf24" />
          <path d="M50 16.5 C50 11.5, 62 11.5, 62 16.5 Z" fill="#1e293b" />
          <path d="M46 49 C46 31, 66 31, 66 49 Z" fill="#0284c7" />
          <path d="M49 34 L36 44" stroke="#fbbf24" strokeWidth="3.2" strokeLinecap="round" className="st-anim-ketik-l" />
          <path d="M58 34 L42 45" stroke="#fbbf24" strokeWidth="3.2" strokeLinecap="round" className="st-anim-ketik-r" />
        </g>

        <g className="st-anim-lup">
          <circle cx="72" cy="24" r="7.5" fill="#e0f2fe" fillOpacity="0.85" stroke="#0369a1" strokeWidth="2.4" />
          <line x1="77.5" y1="29.5" x2="84" y2="36" stroke="#0369a1" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
    );
  }

  if (stationIndex === 1) {
    return (
      <svg width="92" height="62" viewBox="0 0 92 62" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="6" y="49" width="80" height="4.5" rx="2.2" fill="#334155" />
        <rect x="11" y="13" width="32" height="23" rx="3" fill="#0f172a" />
        <rect
          x="13.5"
          y="15.5"
          width="27"
          height="17"
          rx="1.5"
          fill={active && isError ? '#ef4444' : active ? '#10b981' : '#64748b'}
          className="st-anim-screen"
        />
        <rect x="24" y="36" width="6" height="13" fill="#64748b" />
        <rect x="15" y="45" width="18" height="3.5" rx="1.5" fill="#94a3b8" />

        <g className="st-anim-tulis">
          <circle cx="56" cy="17" r="6" fill="#f59e0b" />
          <path d="M46 49 C46 31, 66 31, 66 49 Z" fill="#2563eb" />
          <circle cx="44" cy="40" r="3" fill="#fde68a" className="st-anim-tangan" />
        </g>

        <g className="st-anim-kertas">
          <rect x="69" y="14" width="15" height="20" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.6" />
          <line x1="72" y1="19" x2="81" y2="19" stroke="#475569" strokeWidth="1.6" />
          <line x1="72" y1="24" x2="81" y2="24" stroke="#475569" strokeWidth="1.6" />
          <line x1="72" y1="29" x2="78" y2="29" stroke="#10b981" strokeWidth="2" />
        </g>
      </svg>
    );
  }

  if (stationIndex === 2) {
    return (
      <svg width="92" height="62" viewBox="0 0 92 62" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="6" y="49" width="80" height="4.5" rx="2.2" fill="#334155" />
        <rect x="14" y="11" width="36" height="32" rx="3.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
        <line x1="20" y1="19" x2="43" y2="19" stroke="#64748b" strokeWidth="2" />
        <line x1="20" y1="26" x2="43" y2="26" stroke="#64748b" strokeWidth="2" />
        <line x1="20" y1="33" x2="35" y2="33" stroke="#94a3b8" strokeWidth="2" />

        <g className="st-anim-audit">
          <circle cx="65" cy="29" r="12.5" fill="#dcfce7" stroke="#16a34a" strokeWidth="2.5" />
          <path
            d="M59 29 L63.5 33.5 L72 24"
            fill="none"
            stroke="#16a34a"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    );
  }

  if (stationIndex === 3) {
    return (
      <svg width="92" height="62" viewBox="0 0 92 62" className={`st-svg ${stateCls}`} aria-hidden="true">
        <rect x="6" y="49" width="80" height="4.5" rx="2.2" fill="#334155" />
        <g className="st-anim-kemas">
          <rect x="12" y="12" width="18" height="23" rx="2" fill="#1e293b" stroke="#fbbf24" strokeWidth="1.6" />
          <circle cx="21" cy="22" r="4" fill="#fbbf24" opacity="0.85" />
          <line x1="15" y1="30" x2="27" y2="30" stroke="#f8fafc" strokeWidth="1.6" />
        </g>
        <rect x="44" y="21" width="32" height="28" rx="3.5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
        <path d="M44 21 L50 15 H70 L76 21" fill="#fbbf24" stroke="#b45309" strokeWidth="1.8" />
        <line x1="60" y1="15" x2="60" y2="49" stroke="#fef3c7" strokeWidth="2.2" />
      </svg>
    );
  }

  return (
    <svg width="92" height="62" viewBox="0 0 92 62" className={`st-svg ${stateCls}`} aria-hidden="true">
      <rect x="6" y="49" width="80" height="4.5" rx="2.2" fill="#334155" />
      <g className="st-anim-drive">
        <rect x="11" y="23" width="21" height="15" rx="2.5" fill="#2563eb" />
        <path d="M16 30.5 H27 M23 27 L27 30.5 L23 34" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M46 15 H59 L63 20 H81 V45 H46 Z" fill="#16a34a" stroke="#15803d" strokeWidth="1.6" />
      <rect x="51" y="25" width="25" height="15" rx="2" fill="#dcfce7" opacity="0.9" />
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

  const isWorking = Boolean(busy || autoRun || activeSlot?.isRunning);
  const activeStageIdx = activeSlot
    ? getStageIndex(activeSlot.stage, activeSlot.chaptersDone, Math.max(1, activeSlot.totalChapters || 20))
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
        .cn-btn-sm {
          padding: 5px 10px;
          font-size: 11.5px;
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

        .cn-robot-bay {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 14px;
          margin-bottom: 14px;
        }
        .cn-robot-bay.is-working {
          border-color: #34d399;
          background: #ecfdf5;
        }
        .cn-robot-info {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .cn-robot-badge {
          font-size: 11px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 999px;
        }
        .cn-robot-badge.work {
          background: #059669;
          color: #ffffff;
        }
        .cn-robot-badge.idle {
          background: #e0f2fe;
          color: #0369a1;
        }
        .cn-robot-desc {
          font-size: 12px;
          color: #334155;
        }
        .cn-robot-track {
          position: relative;
          height: 56px;
          border-radius: 8px;
          background: repeating-linear-gradient(
            90deg,
            #f8fafc 0px,
            #f8fafc 48px,
            #f1f5f9 48px,
            #f1f5f9 96px
          );
          border-bottom: 2px solid #cbd5e1;
          overflow: hidden;
        }
        .cn-robot-actor {
          position: absolute;
          bottom: 0;
          left: 16px;
        }

        @keyframes robotWorkBounce {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes robotRoamWalk {
          0% { transform: translateX(0px) scaleX(1); }
          45% { transform: translateX(260px) scaleX(1); }
          50% { transform: translateX(260px) scaleX(-1); }
          95% { transform: translateX(0px) scaleX(-1); }
          100% { transform: translateX(0px) scaleX(1); }
        }
        @keyframes robotLegSwing {
          0%, 100% { transform: rotate(-16deg); transform-origin: 26px 44px; }
          50% { transform: rotate(16deg); transform-origin: 26px 44px; }
        }
        @keyframes robotArmWork {
          0%, 100% { transform: rotate(-12deg); transform-origin: 20px 33px; }
          50% { transform: rotate(14deg); transform-origin: 20px 33px; }
        }
        @keyframes robotRestBreath {
          0%, 100% { transform: translateY(2px) scaleY(0.96); }
          50% { transform: translateY(0px) scaleY(1); }
        }

        .act-work {
          animation: robotWorkBounce 0.55s ease-in-out infinite;
        }
        .act-work .rb-arm-l,
        .act-work .rb-arm-r {
          animation: robotArmWork 0.35s ease-in-out infinite;
        }
        .act-roam {
          animation: robotRoamWalk 6.5s linear infinite;
        }
        .act-roam .rb-leg-l,
        .act-roam .rb-leg-r {
          animation: robotLegSwing 0.45s ease-in-out infinite;
        }
        .act-rest {
          animation: robotRestBreath 2.2s ease-in-out infinite;
        }

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
          opacity: 0.68;
          transition: transform 0.2s ease, border-color 0.2s ease;
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
          transform: translateY(-2px);
        }
        .cn-station-box.is-current.is-stopped {
          border-color: #94a3b8;
          box-shadow: none;
          background: #f1f5f9;
          opacity: 0.92;
          transform: none;
        }
        .cn-station-box.is-current.is-err {
          border-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
          background: #fef2f2;
        }
        .cn-station-label {
          font-size: 11.5px;
          font-weight: 700;
          margin-top: 4px;
          color: #0f172a;
        }
        .cn-station-state {
          font-size: 10px;
          font-weight: 800;
          margin-top: 2px;
          color: #475569;
          letter-spacing: 0.3px;
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

        @keyframes animRisetBody {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(-1.5deg); }
        }
        @keyframes animKetikL {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2.5px); }
        }
        @keyframes animKetikR {
          0%, 100% { transform: translateY(-2.5px); }
          50% { transform: translateY(0px); }
        }
        @keyframes animLup {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          35% { transform: translate(-10px, 2px) rotate(-6deg); }
          70% { transform: translate(-4px, -3px) rotate(5deg); }
        }
        @keyframes animTulis {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes animTangan {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-2.5px, 2px); }
        }
        @keyframes animKertas {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3.5px); }
        }
        @keyframes animAudit {
          0%, 100% { transform: scale(1) translateY(0px); }
          50% { transform: scale(1.08) translateY(-2px); }
        }
        @keyframes animKemas {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(14px, 6px) scale(0.92); }
        }
        @keyframes animDrive {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(11px); }
        }
        @keyframes animBlink {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }

        .st-svg.is-live .st-anim-riset-body { animation: animRisetBody 1.1s ease-in-out infinite; }
        .st-svg.is-live .st-anim-ketik-l { animation: animKetikL 0.28s ease-in-out infinite; }
        .st-svg.is-live .st-anim-ketik-r { animation: animKetikR 0.28s ease-in-out infinite; }
        .st-svg.is-live .st-anim-lup { animation: animLup 1.8s ease-in-out infinite; }
        .st-svg.is-live .st-anim-tulis { animation: animTulis 0.55s ease-in-out infinite; }
        .st-svg.is-live .st-anim-tangan { animation: animTangan 0.26s ease-in-out infinite; }
        .st-svg.is-live .st-anim-kertas { animation: animKertas 1.2s ease-in-out infinite; }
        .st-svg.is-live .st-anim-screen { animation: animBlink 0.75s ease-in-out infinite; }
        .st-svg.is-live .st-anim-audit { animation: animAudit 1.15s ease-in-out infinite; }
        .st-svg.is-live .st-anim-kemas { animation: animKemas 1.3s ease-in-out infinite; }
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

      <AiWorkerRobotBanner
        isWorking={isWorking}
        stageLabel={PIPELINE_STAGES[activeStageIdx]?.shortTitle || 'Riset Proyek'}
      />

      {activeSlot && (() => {
        const total = Math.max(1, activeSlot.totalChapters || 20);
        const pct = Math.min(100, Math.round((activeSlot.chaptersDone / total) * 100));
        const isErr = Boolean(activeSlot.error);
        const canAnimate = Boolean(activeSlot.isRunning || autoRun);

        return (
          <>
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
            <button type="button" onClick={onClearLog} className="cn-btn" style={{ padding: '5px 10px', fontSize: 12 }}>
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
