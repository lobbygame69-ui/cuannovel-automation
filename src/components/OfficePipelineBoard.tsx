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
  shirtShadow: string;
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
    idleTexts: ['Cari ide cerita...', 'Cek tren genre', 'Jalan santai'],
    shirtColor: '#0ea5e9',
    shirtShadow: '#0369a1',
    hairColor: '#1e293b',
    deskRatioX: 0.2,
    deskRatioY: 0.42
  },
  {
    key: 'novelku_production',
    stationLabel: '2. Tulis Bab',
    shortTitle: 'Tulis Bab',
    roleTitle: 'Penulis Bab',
    workText: 'Menulis bab novel',
    idleTexts: ['Cari inspirasi...', 'Peregangan dulu', 'Keliling ruang'],
    shirtColor: '#3b82f6',
    shirtShadow: '#1d4ed8',
    hairColor: '#7c2d12',
    deskRatioX: 0.5,
    deskRatioY: 0.42
  },
  {
    key: 'formatting_kdp',
    stationLabel: '3. Audit & Rapikan',
    shortTitle: 'Audit & Rapikan',
    roleTitle: 'Auditor KDP',
    workText: 'Audit bab & layout',
    idleTexts: ['Cek standar KDP', 'Mondar-mandir', 'Santai sejenak'],
    shirtColor: '#10b981',
    shirtShadow: '#047857',
    hairColor: '#334155',
    deskRatioX: 0.8,
    deskRatioY: 0.42
  },
  {
    key: 'cover_generation',
    stationLabel: '4. Cover & Kemas',
    shortTitle: 'Cover & Kemas Paket',
    roleTitle: 'Desainer Cover',
    workText: 'Desain cover & kemas',
    idleTexts: ['Cek palet cover', 'Jalan-jalan santai', 'Cuci mata dulu'],
    shirtColor: '#a855f7',
    shirtShadow: '#7e22ce',
    hairColor: '#d97706',
    deskRatioX: 0.34,
    deskRatioY: 0.74
  },
  {
    key: 'gdrive_upload',
    stationLabel: '5. Google Drive',
    shortTitle: 'Google Drive',
    roleTitle: 'Kurir Drive',
    workText: 'Upload ke Drive',
    idleTexts: ['Siap kirim paket', 'Mondar-mandir', 'Jalan santai'],
    shirtColor: '#f59e0b',
    shirtShadow: '#b45309',
    hairColor: '#0f172a',
    deskRatioX: 0.68,
    deskRatioY: 0.74
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

function drawPottedPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#c2410c';
  drawRoundedRect(ctx, x - 7, y + 1, 14, 11, 2);
  ctx.fill();

  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(x - 5, y - 4, 7, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 4, 7, 0, Math.PI * 2);
  ctx.arc(x, y - 10, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(x - 2, y - 9, 4, 0, Math.PI * 2);
  ctx.fill();
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
      x: 130 + i * 145,
      y: i < 3 ? 175 : 265,
      targetX: 180 + ((i * 173) % 480),
      targetY: i % 2 === 0 ? 170 : 265,
      bubbleIndex: i,
      bubbleTimer: 0,
      pauseTimer: 0,
      stepPhase: i * 1.5
    }));

    let rafId = 0;
    let lastTime = performance.now();

    const pickNextWaypoint = (idx: number, width: number, height: number): { tx: number; ty: number } => {
      const minX = Math.max(85, Math.round(width * 0.12));
      const maxX = Math.max(minX + 100, Math.round(width * 0.88));
      const minY = Math.max(145, Math.round(height * 0.44));
      const maxY = Math.max(minY + 60, Math.round(height * 0.84));

      const seed = (idx * 97 + Math.floor(performance.now() / 700)) % 997;
      const rx = ((seed * 43) % 1000) / 1000;
      const ry = ((seed * 67) % 1000) / 1000;

      return {
        tx: minX + rx * (maxX - minX),
        ty: minY + ry * (maxY - minY)
      };
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const parentWidth = canvas.parentElement?.clientWidth || 820;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const logicalW = Math.max(360, parentWidth);
      const logicalH = 340;

      if (canvas.width !== Math.round(logicalW * dpr) || canvas.height !== Math.round(logicalH * dpr)) {
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Dinding atas hangat + jendela cahaya
      const wallGrad = ctx.createLinearGradient(0, 0, 0, logicalH * 0.28);
      wallGrad.addColorStop(0, '#e2e8f0');
      wallGrad.addColorStop(1, '#f8fafc');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, logicalW, logicalH * 0.28);

      // Jendela kantor
      const winPositions = [logicalW * 0.22, logicalW * 0.5, logicalW * 0.78];
      winPositions.forEach((wx) => {
        ctx.fillStyle = '#bae6fd';
        drawRoundedRect(ctx, wx - 36, 16, 72, 46, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Cahaya matahari masuk
        ctx.fillStyle = 'rgba(254, 249, 195, 0.32)';
        ctx.beginPath();
        ctx.moveTo(wx - 36, 62);
        ctx.lineTo(wx + 36, 62);
        ctx.lineTo(wx + 65, logicalH * 0.55);
        ctx.lineTo(wx - 65, logicalH * 0.55);
        ctx.closePath();
        ctx.fill();
      });

      // 2. Lantai kayu hangat + papan garis parket
      const floorGrad = ctx.createLinearGradient(0, logicalH * 0.26, 0, logicalH);
      floorGrad.addColorStop(0, '#f3e5ab');
      floorGrad.addColorStop(1, '#e6cfa0');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, logicalH * 0.26, logicalW, logicalH * 0.74);

      ctx.strokeStyle = 'rgba(146, 64, 14, 0.14)';
      ctx.lineWidth = 1;
      for (let py = logicalH * 0.28; py < logicalH; py += 26) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(logicalW, py);
        ctx.stroke();
      }

      // 3. Karpet ruang kerja biru tua berbingkai
      const rugX = logicalW * 0.06;
      const rugY = logicalH * 0.31;
      const rugW = logicalW * 0.88;
      const rugH = logicalH * 0.62;
      const rugGrad = ctx.createLinearGradient(0, rugY, 0, rugY + rugH);
      rugGrad.addColorStop(0, '#1e3a8a');
      rugGrad.addColorStop(1, '#172554');
      ctx.fillStyle = rugGrad;
      drawRoundedRect(ctx, rugX, rugY, rugW, rugH, 16);
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Tanaman hias di sudut
      drawPottedPlant(ctx, rugX + 26, rugY + 24);
      drawPottedPlant(ctx, rugX + rugW - 26, rugY + 24);

      const {
        isAnyWorking: working,
        activeStageIdx: activeIdx,
        chaptersDone: chDone,
        totalChapters: totCh,
        lastWords: lw
      } = stateRef.current;

      // 4. Gambar 5 meja kerja + monitor berwarna
      WORKER_SPECS.forEach((w, idx) => {
        const dx = w.deskRatioX * logicalW;
        const dy = w.deskRatioY * logicalH;
        const isFocus = working && idx === activeIdx;

        // Bayangan meja
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        drawRoundedRect(ctx, dx - 32, dy - 7, 64, 24, 6);
        ctx.fill();

        // Permukaan meja kayu
        ctx.fillStyle = isFocus ? '#fde68a' : '#d97706';
        drawRoundedRect(ctx, dx - 32, dy - 10, 64, 22, 6);
        ctx.fill();
        ctx.strokeStyle = isFocus ? '#f59e0b' : '#92400e';
        ctx.lineWidth = isFocus ? 2.5 : 1.5;
        ctx.stroke();

        // Monitor
        ctx.fillStyle = '#0f172a';
        drawRoundedRect(ctx, dx - 12, dy - 21, 24, 13, 2.5);
        ctx.fill();

        ctx.fillStyle = isFocus ? '#4ade80' : '#38bdf8';
        ctx.fillRect(dx - 9.5, dy - 18.5, 19, 8);

        // Cahaya layar ke meja saat aktif
        if (isFocus) {
          ctx.fillStyle = 'rgba(74, 222, 128, 0.22)';
          ctx.beginPath();
          ctx.moveTo(dx - 10, dy - 10);
          ctx.lineTo(dx + 10, dy - 10);
          ctx.lineTo(dx + 22, dy + 10);
          ctx.lineTo(dx - 22, dy + 10);
          ctx.closePath();
          ctx.fill();
        }
      });

      // 5. Update pergerakan & jarak aman antar pekerja
      agents.forEach((ag, idx) => {
        const spec = WORKER_SPECS[idx];
        const isWorkerActive = working && idx === activeIdx;

        let goalX = ag.targetX;
        let goalY = ag.targetY;

        if (isWorkerActive) {
          goalX = spec.deskRatioX * logicalW;
          goalY = spec.deskRatioY * logicalH + 24;
        } else if (working) {
          goalX = spec.deskRatioX * logicalW + 22;
          goalY = spec.deskRatioY * logicalH + 26;
        }

        const dx = goalX - ag.x;
        const dy = goalY - ag.y;
        const dist = Math.hypot(dx, dy);

        let isMoving = false;
        if (ag.pauseTimer > 0) {
          ag.pauseTimer -= dt;
        } else if (dist > 4) {
          const speed = isWorkerActive ? 105 : 52;
          const step = Math.min(dist, speed * dt);
          ag.x += (dx / dist) * step;
          ag.y += (dy / dist) * step;
          ag.stepPhase += dt * 9.5;
          isMoving = true;
        } else if (!working) {
          ag.pauseTimer = 0.7;
          const nextWp = pickNextWaypoint(idx, logicalW, logicalH);
          ag.targetX = nextWp.tx;
          ag.targetY = nextWp.ty;
        }

        // Tolak-menolak halus agar tidak saling menumpuk saat mondar-mandir
        if (!working) {
          agents.forEach((other, j) => {
            if (idx === j) return;
            const ox = ag.x - other.x;
            const oy = ag.y - other.y;
            const odist = Math.hypot(ox, oy);
            const minSep = 74;
            if (odist > 0.1 && odist < minSep) {
              const push = ((minSep - odist) / minSep) * 48 * dt;
              ag.x += (ox / odist) * push;
              ag.y += (oy / odist) * push;
            }
          });
        }

        ag.x = Math.max(rugX + 26, Math.min(rugX + rugW - 26, ag.x));
        ag.y = Math.max(rugY + 42, Math.min(rugY + rugH - 18, ag.y));

        ag.bubbleTimer += dt;
        if (ag.bubbleTimer >= 3.2) {
          ag.bubbleTimer = 0;
          ag.bubbleIndex = (ag.bubbleIndex + 1) % spec.idleTexts.length;
        }
      });

      // Urutkan gambar berdasarkan posisi Y agar karakter depan/belakang terlihat alami
      const drawOrder = agents
        .map((ag, idx) => ({ ag, idx }))
        .sort((a, b) => a.ag.y - b.ag.y);

      const placedBubbles: Array<{ x: number; y: number; w: number; h: number }> = [];

      drawOrder.forEach(({ ag, idx }) => {
        const spec = WORKER_SPECS[idx];
        const isWorkerActive = working && idx === activeIdx;
        const isMoving = Math.hypot(ag.targetX - ag.x, ag.targetY - ag.y) > 4 && !working;

        const bobY = isMoving
          ? Math.abs(Math.sin(ag.stepPhase)) * -3.5
          : isWorkerActive
            ? Math.sin(now / 130) * -2
            : 0;

        const px = ag.x;
        const py = ag.y + bobY;

        // Bayangan karakter
        ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ag.x, ag.y + 18, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Kaki & sepatu
        const legSwing = isMoving ? Math.sin(ag.stepPhase) * 5.5 : 0;
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - 4.5, py + 7);
        ctx.lineTo(px - 4.5 + legSwing, py + 17);
        ctx.moveTo(px + 4.5, py + 7);
        ctx.lineTo(px + 4.5 - legSwing, py + 17);
        ctx.stroke();

        // Badan kemeja berwarna
        ctx.fillStyle = spec.shirtColor;
        drawRoundedRect(ctx, px - 9, py - 6, 18, 14, 4.5);
        ctx.fill();
        ctx.strokeStyle = spec.shirtShadow;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Tangan
        const armSwing = isMoving ? -legSwing * 0.75 : isWorkerActive ? Math.cos(now / 100) * 3.5 : 0;
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(px - 9, py - 2);
        ctx.lineTo(px - 13, py + 4 + armSwing);
        ctx.moveTo(px + 9, py - 2);
        ctx.lineTo(px + 13, py + 4 - armSwing);
        ctx.stroke();

        // Kepala
        ctx.fillStyle = '#fde68a';
        drawRoundedRect(ctx, px - 8, py - 21, 16, 15, 5.5);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Rambut
        ctx.fillStyle = spec.hairColor;
        drawRoundedRect(ctx, px - 8.2, py - 22.5, 16.4, 5.5, 3);
        ctx.fill();

        // Mata
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(px - 3.5, py - 13.5, 1.5, 0, Math.PI * 2);
        ctx.arc(px + 3.5, py - 13.5, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Badge nama peran di bawah kaki
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        const tagText = spec.roleTitle;
        const tagW = ctx.measureText(tagText).width + 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        drawRoundedRect(ctx, px - tagW / 2, py + 21, tagW, 14, 7);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillText(tagText, px, py + 31);

        // Speech bubble anti-tumpuk di atas kepala
        let bubbleText = spec.idleTexts[ag.bubbleIndex];
        if (isWorkerActive) {
          bubbleText =
            idx === 1 && chDone > 0
              ? `Bab ${chDone}/${totCh}${lw ? ` (${lw}k)` : ''}`
              : spec.workText;
        } else if (working) {
          bubbleText = 'Siaga';
        }

        ctx.font = 'bold 9.5px sans-serif';
        const textW = Math.min(144, ctx.measureText(bubbleText).width + 14);
        const bh = 19;
        let bx = Math.max(8, Math.min(logicalW - textW - 8, px - textW / 2));
        let by = Math.max(8, py - 45);

        // Geser ke atas jika beririsan dengan bubble lain
        for (let attempt = 0; attempt < 4; attempt++) {
          const overlaps = placedBubbles.some(
            (b) =>
              bx < b.x + b.w + 4 &&
              bx + textW + 4 > b.x &&
              by < b.y + b.h + 3 &&
              by + bh + 3 > b.y
          );
          if (!overlaps) break;
          by = Math.max(6, by - 21);
        }
        placedBubbles.push({ x: bx, y: by, w: textW, h: bh });

        ctx.fillStyle = isWorkerActive ? '#0f172a' : '#ffffff';
        drawRoundedRect(ctx, bx, by, textW, bh, 9.5);
        ctx.fill();
        ctx.strokeStyle = isWorkerActive ? '#34d399' : '#64748b';
        ctx.lineWidth = isWorkerActive ? 1.6 : 1.2;
        ctx.stroke();

        ctx.fillStyle = isWorkerActive ? '#ffffff' : '#0f172a';
        ctx.fillText(bubbleText, bx + textW / 2, by + 12.5);
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
        height: 340,
        display: 'block',
        borderRadius: 12,
        border: '1px solid #cbd5e1',
        boxShadow: 'inset 0 2px 8px rgba(15, 23, 42, 0.08)'
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
