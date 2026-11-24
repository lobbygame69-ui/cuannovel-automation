'use client';

import React, { useEffect, useRef, useState } from 'react';

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

interface WorkerSpec {
  key: string;
  stationLabel: string;
  shortTitle: string;
  roleTitle: string;
  workText: string;
  idleTexts: string[];
  shirtColor: string;
  hairColor: string;
  deskRatioX: number;
  deskRatioY: number;
}

const WORKER_SPECS: WorkerSpec[] = [
  {
    key: 'scout_research',
    stationLabel: '1. Riset',
    shortTitle: 'Riset Proyek',
    roleTitle: 'Riset Novel',
    workText: 'Riset ide & sinopsis',
    idleTexts: ['Mondar-mandir cari ide', 'Cek tren cerita', 'Jalan santai'],
    shirtColor: '#0ea5e9',
    hairColor: '#1e293b',
    deskRatioX: 0.16,
    deskRatioY: 0.34
  },
  {
    key: 'novelku_production',
    stationLabel: '2. Tulis Bab',
    shortTitle: 'Tulis Bab',
    roleTitle: 'Penulis Bab',
    workText: 'Menulis bab novel',
    idleTexts: ['Jalan-jalan cari inspirasi', 'Peregangan sejenak', 'Keliling ruang'],
    shirtColor: '#2563eb',
    hairColor: '#7c2d12',
    deskRatioX: 0.38,
    deskRatioY: 0.34
  },
  {
    key: 'formatting_kdp',
    stationLabel: '3. Audit & Rapikan',
    shortTitle: 'Audit & Rapikan',
    roleTitle: 'Auditor KDP',
    workText: 'Audit bab & tata letak',
    idleTexts: ['Mondar-mandir santai', 'Cek catatan KDP', 'Jalan-jalan'],
    shirtColor: '#10b981',
    hairColor: '#334155',
    deskRatioX: 0.6,
    deskRatioY: 0.34
  },
  {
    key: 'cover_generation',
    stationLabel: '4. Cover & Kemas',
    shortTitle: 'Cover & Kemas Paket',
    roleTitle: 'Desainer Cover',
    workText: 'Desain cover & kemas',
    idleTexts: ['Jalan-jalan cek warna', 'Istirahat sebentar', 'Mondar-mandir'],
    shirtColor: '#8b5cf6',
    hairColor: '#d97706',
    deskRatioX: 0.28,
    deskRatioY: 0.68
  },
  {
    key: 'gdrive_upload',
    stationLabel: '5. Google Drive',
    shortTitle: 'Google Drive',
    roleTitle: 'Kurir Drive',
    workText: 'Kirim ke Google Drive',
    idleTexts: ['Mondar-mandir santai', 'Siap antar file', 'Jalan keliling'],
    shirtColor: '#f59e0b',
    hairColor: '#0f172a',
    deskRatioX: 0.66,
    deskRatioY: 0.68
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

interface RoamAgent {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  bubbleIndex: number;
  bubbleTimer: number;
  pauseTimer: number;
  stepPhase: number;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const VirtualOfficeFloorCanvas: React.FC<{
  isAnyWorking: boolean;
  activeStageIdx: number;
  chaptersDone: number;
  totalChapters: number;
  lastWords?: number;
}> = ({ isAnyWorking, activeStageIdx, chaptersDone, totalChapters, lastWords }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    isAnyWorking,
    activeStageIdx,
    chaptersDone,
    totalChapters,
    lastWords
  });

  stateRef.current = {
    isAnyWorking,
    activeStageIdx,
    chaptersDone,
    totalChapters,
    lastWords
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const agents: RoamAgent[] = WORKER_SPECS.map((w, i) => ({
      x: 120 + i * 130,
      y: i < 3 ? 130 : 230,
      targetX: 160 + ((i * 157) % 520),
      targetY: i % 2 === 0 ? 115 : 235,
      bubbleIndex: i,
      bubbleTimer: 0,
      pauseTimer: 0,
      stepPhase: i * 1.4
    }));

    let rafId = 0;
    let lastTime = performance.now();

    const pickNextWaypoint = (idx: number, width: number, height: number): { tx: number; ty: number } => {
      const minX = Math.max(60, Math.round(width * 0.08));
      const maxX = Math.max(minX + 80, Math.round(width * 0.92));
      const minY = Math.max(76, Math.round(height * 0.24));
      const maxY = Math.max(minY + 60, Math.round(height * 0.86));

      const seed = (idx * 73 + Math.floor(performance.now() / 650)) % 997;
      const rx = ((seed * 37) % 1000) / 1000;
      const ry = ((seed * 61) % 1000) / 1000;

      return {
        tx: minX + rx * (maxX - minX),
        ty: minY + ry * (maxY - minY)
      };
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const parentWidth = canvas.parentElement?.clientWidth || 780;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const logicalW = Math.max(340, parentWidth);
      const logicalH = 310;

      if (canvas.width !== Math.round(logicalW * dpr) || canvas.height !== Math.round(logicalH * dpr)) {
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Latar lantai kantor & karpet area tengah
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, logicalW, logicalH);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < logicalW; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, logicalH);
        ctx.stroke();
      }
      for (let gy = 0; gy < logicalH; gy += 36) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(logicalW, gy);
        ctx.stroke();
      }

      const rugX = logicalW * 0.07;
      const rugY = logicalH * 0.2;
      const rugW = logicalW * 0.86;
      const rugH = logicalH * 0.7;
      ctx.fillStyle = '#dbeafe';
      drawRoundedRect(ctx, rugX, rugY, rugW, rugH, 14);
      ctx.fill();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gambar 5 meja kerja + monitor
      WORKER_SPECS.forEach((w, idx) => {
        const dx = w.deskRatioX * logicalW;
        const dy = w.deskRatioY * logicalH;
        const isFocus = stateRef.current.isAnyWorking && idx === stateRef.current.activeStageIdx;

        ctx.fillStyle = isFocus ? '#fef3c7' : '#ffffff';
        drawRoundedRect(ctx, dx - 28, dy - 10, 56, 22, 5);
        ctx.fill();
        ctx.strokeStyle = isFocus ? '#d97706' : '#94a3b8';
        ctx.lineWidth = isFocus ? 2 : 1.3;
        ctx.stroke();

        // Layar monitor kecil
        ctx.fillStyle = '#0f172a';
        drawRoundedRect(ctx, dx - 10, dy - 18, 20, 11, 2);
        ctx.fill();
        ctx.fillStyle = isFocus ? '#34d399' : '#38bdf8';
        ctx.fillRect(dx - 8, dy - 16, 16, 7);
      });

      const { isAnyWorking: working, activeStageIdx: activeIdx, chaptersDone: chDone, totalChapters: totCh, lastWords: lw } =
        stateRef.current;

      // Update posisi & gambar 5 pekerja
      agents.forEach((ag, idx) => {
        const spec = WORKER_SPECS[idx];
        const isWorkerActive = working && idx === activeIdx;

        let goalX = ag.targetX;
        let goalY = ag.targetY;

        if (isWorkerActive) {
          goalX = spec.deskRatioX * logicalW;
          goalY = spec.deskRatioY * logicalH + 22;
        } else if (working) {
          goalX = spec.deskRatioX * logicalW + 18;
          goalY = spec.deskRatioY * logicalH + 26;
        }

        const dx = goalX - ag.x;
        const dy = goalY - ag.y;
        const dist = Math.hypot(dx, dy);

        let isMoving = false;
        if (ag.pauseTimer > 0) {
          ag.pauseTimer -= dt;
        } else if (dist > 3) {
          const speed = isWorkerActive ? 95 : 54;
          const step = Math.min(dist, speed * dt);
          ag.x += (dx / dist) * step;
          ag.y += (dy / dist) * step;
          ag.stepPhase += dt * 9;
          isMoving = true;
        } else if (!working) {
          ag.pauseTimer = 0.65;
          const nextWp = pickNextWaypoint(idx, logicalW, logicalH);
          ag.targetX = nextWp.tx;
          ag.targetY = nextWp.ty;
        }

        ag.bubbleTimer += dt;
        if (ag.bubbleTimer >= 3.2) {
          ag.bubbleTimer = 0;
          ag.bubbleIndex = (ag.bubbleIndex + 1) % spec.idleTexts.length;
        }

        const bobY = isMoving
          ? Math.abs(Math.sin(ag.stepPhase)) * -3.5
          : isWorkerActive
            ? Math.sin(now / 140) * -1.8
            : 0;

        const px = ag.x;
        const py = ag.y + bobY;

        // Bayangan
        ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
        ctx.beginPath();
        ctx.ellipse(ag.x, ag.y + 18, 11, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Kaki berjalan
        const legSwing = isMoving ? Math.sin(ag.stepPhase) * 5 : 0;
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - 4, py + 7);
        ctx.lineTo(px - 4 + legSwing, py + 17);
        ctx.moveTo(px + 4, py + 7);
        ctx.lineTo(px + 4 - legSwing, py + 17);
        ctx.stroke();

        // Badan
        ctx.fillStyle = spec.shirtColor;
        drawRoundedRect(ctx, px - 8, py - 5, 16, 13, 4);
        ctx.fill();

        // Tangan
        const armSwing = isMoving ? -legSwing * 0.7 : isWorkerActive ? Math.cos(now / 110) * 3 : 0;
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(px - 8, py - 2);
        ctx.lineTo(px - 12, py + 4 + armSwing);
        ctx.moveTo(px + 8, py - 2);
        ctx.lineTo(px + 12, py + 4 - armSwing);
        ctx.stroke();

        // Kepala
        ctx.fillStyle = '#fde68a';
        drawRoundedRect(ctx, px - 7.5, py - 19, 15, 14, 5);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Rambut
        ctx.fillStyle = spec.hairColor;
        ctx.fillRect(px - 7.5, py - 20, 15, 4.5);

        // Mata
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(px - 4, py - 13, 2, 2.2);
        ctx.fillRect(px + 2, py - 13, 2, 2.2);

        // Label nama pekerja di bawah kaki
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(spec.roleTitle, px, py + 28);

        // Speech bubble tugas di atas kepala
        let bubbleText = spec.idleTexts[ag.bubbleIndex];
        if (isWorkerActive) {
          bubbleText =
            idx === 1 && chDone > 0
              ? `Bab ${chDone}/${totCh}${lw ? ` (${lw}k)` : ''}`
              : spec.workText;
        } else if (working) {
          bubbleText = 'Siaga di meja';
        }

        ctx.font = 'bold 9.5px sans-serif';
        const textW = Math.min(148, ctx.measureText(bubbleText).width + 12);
        const bx = Math.max(8, Math.min(logicalW - textW - 8, px - textW / 2));
        const by = Math.max(6, py - 42);

        ctx.fillStyle = isWorkerActive ? '#0f172a' : '#ffffff';
        drawRoundedRect(ctx, bx, by, textW, 18, 9);
        ctx.fill();
        ctx.strokeStyle = isWorkerActive ? '#0f172a' : '#94a3b8';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = isWorkerActive ? '#ffffff' : '#0f172a';
        ctx.fillText(bubbleText, bx + textW / 2, by + 12);
      });

      ctx.restore();
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: 310,
        display: 'block',
        borderRadius: 10,
        border: '1px solid #cbd5e1'
      }}
    />
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
          margin-bottom: 10px;
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

      <div className={`cn-floor-panel ${isAnyWorking ? 'is-busy' : ''}`}>
        <div className="cn-floor-head">
          <div>
            <strong>Virtual Kantor 5 Pekerja CuanNovel</strong>
            <span className="cn-floor-sub">
              {isAnyWorking
                ? `Pekerja aktif menuju & bekerja di stasiun #${activeStageIdx + 1} (${WORKER_SPECS[activeStageIdx]?.roleTitle}).`
                : 'Tidak ada kerjaan berjalan — semua 5 pekerja berjalan bebas keliling ruangan.'}
            </span>
          </div>
          <span className={`cn-floor-chip ${isAnyWorking ? 'chip-work' : 'chip-idle'}`}>
            {isAnyWorking ? 'MODE KERJA AKTIF' : 'MODE BERJALAN BEBAS (IDLE)'}
          </span>
        </div>

        <VirtualOfficeFloorCanvas
          isAnyWorking={isAnyWorking}
          activeStageIdx={activeStageIdx}
          chaptersDone={activeSlot?.chaptersDone || 0}
          totalChapters={totalChapters}
          lastWords={activeSlot?.lastWords}
        />
      </div>

      <div className="cn-stations-grid">
        {WORKER_SPECS.map((st, idx) => {
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
              Tahap berjalan: <strong>{WORKER_SPECS[activeStageIdx]?.shortTitle}</strong>
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
