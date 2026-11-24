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
  coffeeTexts: string[];
  smokeTexts: string[];
  roamTexts: string[];
  shirtColor: string;
  shirtShadow: string;
  hairColor: string;
  deskRatioX: number;
  deskRatioY: number;
  preferredIdleBehavior: 'coffee' | 'smoke' | 'roam';
}

const WORKER_SPECS: WorkerSpec[] = [
  {
    key: 'scout_research',
    stationLabel: '1. Riset',
    shortTitle: 'Riset Proyek',
    roleTitle: 'Riset Novel',
    workText: 'Riset ide & sinopsis',
    coffeeTexts: ['Ngopi dulu cari ide...', 'Kopi hitam mantap'],
    smokeTexts: ['Ngerokok santai dulu', 'Hisap pelan sambil mikir'],
    roamTexts: ['Mondar-mandir cari ide', 'Keliling cek suasana'],
    shirtColor: '#0ea5e9',
    shirtShadow: '#0369a1',
    hairColor: '#1e293b',
    deskRatioX: 0.16,
    deskRatioY: 0.38,
    preferredIdleBehavior: 'coffee'
  },
  {
    key: 'novelku_production',
    stationLabel: '2. Tulis Bab',
    shortTitle: 'Tulis Bab',
    roleTitle: 'Penulis Bab',
    workText: 'Menulis bab novel',
    coffeeTexts: ['Ngopi biar makin ngebut', 'Secangkir kopi inspirasi'],
    smokeTexts: ['Ngerokok dulu lepas penat', 'Ngebul santai sejenak'],
    roamTexts: ['Jalan-jalan cari plot', 'Peregangan dulu'],
    shirtColor: '#3b82f6',
    shirtShadow: '#1d4ed8',
    hairColor: '#7c2d12',
    deskRatioX: 0.37,
    deskRatioY: 0.38,
    preferredIdleBehavior: 'smoke'
  },
  {
    key: 'formatting_kdp',
    stationLabel: '3. Audit & Rapikan',
    shortTitle: 'Audit & Rapikan',
    roleTitle: 'Auditor KDP',
    workText: 'Audit bab & layout',
    coffeeTexts: ['Ngopi sambil santai', 'Kopi susu dulu'],
    smokeTexts: ['Ngerokok di area santai', 'Istirahat ngerokok'],
    roamTexts: ['Mondar-mandir santai', 'Cek area kantor'],
    shirtColor: '#10b981',
    shirtShadow: '#047857',
    hairColor: '#334155',
    deskRatioX: 0.58,
    deskRatioY: 0.38,
    preferredIdleBehavior: 'coffee'
  },
  {
    key: 'cover_generation',
    stationLabel: '4. Cover & Kemas',
    shortTitle: 'Cover & Kemas Paket',
    roleTitle: 'Desainer Cover',
    workText: 'Desain cover & kemas',
    coffeeTexts: ['Ngopi cek palet warna', 'Santai ngopi dulu'],
    smokeTexts: ['Ngerokok cari konsep', 'Duduk ngerokok santai'],
    roamTexts: ['Jalan-jalan cuci mata', 'Mondar-mandir'],
    shirtColor: '#a855f7',
    shirtShadow: '#7e22ce',
    hairColor: '#d97706',
    deskRatioX: 0.24,
    deskRatioY: 0.72,
    preferredIdleBehavior: 'roam'
  },
  {
    key: 'gdrive_upload',
    stationLabel: '5. Google Drive',
    shortTitle: 'Google Drive',
    roleTitle: 'Kurir Drive',
    workText: 'Upload ke Drive',
    coffeeTexts: ['Ngopi sebelum kirim', 'Santai minum kopi'],
    smokeTexts: ['Ngerokok sambil duduk', 'Ngebul santai dulu'],
    roamTexts: ['Mondar-mandir santai', 'Jalan keliling ruang'],
    shirtColor: '#f59e0b',
    shirtShadow: '#b45309',
    hairColor: '#0f172a',
    deskRatioX: 0.48,
    deskRatioY: 0.72,
    preferredIdleBehavior: 'smoke'
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

type IdleActivity = 'coffee' | 'smoke' | 'roam';

interface OfficeAgent {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  activity: IdleActivity;
  seated: boolean;
  activityTimer: number;
  bubbleIndex: number;
  bubbleTimer: number;
  stepPhase: number;
  puffPhase: number;
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 11, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ea580c';
  drawRoundedRect(ctx, x - 7, y + 1, 14, 11, 2.5);
  ctx.fill();

  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.arc(x - 5.5, y - 4, 7.2, 0, Math.PI * 2);
  ctx.arc(x + 5.5, y - 4, 7.2, 0, Math.PI * 2);
  ctx.arc(x, y - 10.5, 8.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(x - 2, y - 9.5, 3.8, 0, Math.PI * 2);
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

    const coffeeSeats = [
      { x: 0.77, y: 0.34 },
      { x: 0.87, y: 0.34 }
    ];
    const smokeSeats = [
      { x: 0.75, y: 0.72 },
      { x: 0.87, y: 0.72 }
    ];

    const agents: OfficeAgent[] = WORKER_SPECS.map((w, i) => ({
      x: 140 + i * 120,
      y: i < 3 ? 170 : 260,
      targetX: 200 + i * 90,
      targetY: 210,
      activity: w.preferredIdleBehavior,
      seated: false,
      activityTimer: 5 + i * 1.4,
      bubbleIndex: i,
      bubbleTimer: 0,
      stepPhase: i * 1.3,
      puffPhase: i * 0.9
    }));

    let rafId = 0;
    let lastTime = performance.now();

    const assignIdleSpot = (
      idx: number,
      act: IdleActivity,
      logicalW: number,
      logicalH: number,
      nowMs: number
    ) => {
      if (act === 'coffee') {
        const seat = coffeeSeats[idx % coffeeSeats.length];
        return { x: seat.x * logicalW, y: seat.y * logicalH, seated: true };
      }
      if (act === 'smoke') {
        const seat = smokeSeats[idx % smokeSeats.length];
        return { x: seat.x * logicalW, y: seat.y * logicalH, seated: true };
      }
      const minX = logicalW * 0.12;
      const maxX = logicalW * 0.64;
      const minY = logicalH * 0.48;
      const maxY = logicalH * 0.85;
      const seed = (idx * 89 + Math.floor(nowMs / 650)) % 997;
      const rx = ((seed * 41) % 1000) / 1000;
      const ry = ((seed * 73) % 1000) / 1000;
      return {
        x: minX + rx * (maxX - minX),
        y: minY + ry * (maxY - minY),
        seated: false
      };
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const parentWidth = canvas.parentElement?.clientWidth || 860;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const logicalW = Math.max(380, parentWidth);
      const logicalH = 365;

      if (canvas.width !== Math.round(logicalW * dpr) || canvas.height !== Math.round(logicalH * dpr)) {
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Dinding atas hangat & jendela
      const wallGrad = ctx.createLinearGradient(0, 0, 0, logicalH * 0.25);
      wallGrad.addColorStop(0, '#cbd5e1');
      wallGrad.addColorStop(1, '#f8fafc');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, logicalW, logicalH * 0.25);

      [0.2, 0.48, 0.78].forEach((ratio) => {
        const wx = logicalW * ratio;
        ctx.fillStyle = '#bae6fd';
        drawRoundedRect(ctx, wx - 34, 14, 68, 42, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = 'rgba(254, 249, 195, 0.28)';
        ctx.beginPath();
        ctx.moveTo(wx - 34, 56);
        ctx.lineTo(wx + 34, 56);
        ctx.lineTo(wx + 58, logicalH * 0.52);
        ctx.lineTo(wx - 58, logicalH * 0.52);
        ctx.closePath();
        ctx.fill();
      });

      // 2. Lantai kayu hangat
      const floorGrad = ctx.createLinearGradient(0, logicalH * 0.24, 0, logicalH);
      floorGrad.addColorStop(0, '#f3e5ab');
      floorGrad.addColorStop(1, '#e2c58d');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, logicalH * 0.24, logicalW, logicalH * 0.76);

      ctx.strokeStyle = 'rgba(120, 53, 15, 0.13)';
      ctx.lineWidth = 1;
      for (let py = logicalH * 0.26; py < logicalH; py += 26) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(logicalW, py);
        ctx.stroke();
      }

      // 3. Zona A: Karpet Ruang Kerja Utama (kiri-tengah)
      const workZoneX = logicalW * 0.04;
      const workZoneY = logicalH * 0.27;
      const workZoneW = logicalW * 0.64;
      const workZoneH = logicalH * 0.67;
      ctx.fillStyle = '#1e3a8a';
      drawRoundedRect(ctx, workZoneX, workZoneY, workZoneW, workZoneH, 14);
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#bfdbfe';
      ctx.fillText('AREA KERJA PIPELINE', workZoneX + 12, workZoneY + 16);

      // 4. Zona B: Area Ngopi & Pantry (kanan atas)
      const coffeeX = logicalW * 0.71;
      const coffeeY = logicalH * 0.27;
      const coffeeW = logicalW * 0.25;
      const coffeeH = logicalH * 0.31;
      ctx.fillStyle = '#fef3c7';
      drawRoundedRect(ctx, coffeeX, coffeeY, coffeeW, coffeeH, 14);
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#92400e';
      ctx.fillText('AREA NGOPI', coffeeX + 12, coffeeY + 16);

      // Meja bar kopi & mesin kopi / cangkir
      const barX = coffeeX + coffeeW * 0.5;
      const barY = coffeeY + coffeeH * 0.42;
      ctx.fillStyle = '#78350f';
      drawRoundedRect(ctx, barX - 34, barY - 7, 68, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(barX - 12, barY - 8, 4.5, 0, Math.PI * 2);
      ctx.arc(barX + 12, barY - 8, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // 5. Zona C: Area Istirahat & Smoking Area (kanan bawah)
      const smokeX = logicalW * 0.71;
      const smokeY = logicalH * 0.61;
      const smokeW = logicalW * 0.25;
      const smokeH = logicalH * 0.33;
      ctx.fillStyle = '#ecfdf5';
      drawRoundedRect(ctx, smokeX, smokeY, smokeW, smokeH, 14);
      ctx.fill();
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#065f46';
      ctx.fillText('ISTIRAHAT & SMOKING', smokeX + 12, smokeY + 16);

      // Sofa & meja asbak di smoking area
      const sofaX = smokeX + smokeW * 0.5;
      const sofaY = smokeY + smokeH * 0.42;
      ctx.fillStyle = '#047857';
      drawRoundedRect(ctx, sofaX - 36, sofaY - 8, 72, 18, 5);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(sofaX, sofaY + 12, 5, 0, Math.PI * 2);
      ctx.fill();

      drawPottedPlant(ctx, workZoneX + 20, workZoneY + workZoneH - 18);
      drawPottedPlant(ctx, smokeX + smokeW - 18, smokeY + smokeH - 18);

      const {
        isAnyWorking: working,
        activeStageIdx: activeIdx,
        chaptersDone: chDone,
        totalChapters: totCh,
        lastWords: lw
      } = stateRef.current;

      // 6. Gambar 5 meja kerja utama
      WORKER_SPECS.forEach((w, idx) => {
        const dx = w.deskRatioX * logicalW;
        const dy = w.deskRatioY * logicalH;
        const isFocus = working && idx === activeIdx;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
        drawRoundedRect(ctx, dx - 28, dy - 7, 56, 20, 5);
        ctx.fill();

        ctx.fillStyle = isFocus ? '#fde047' : '#d97706';
        drawRoundedRect(ctx, dx - 28, dy - 10, 56, 18, 5);
        ctx.fill();
        ctx.strokeStyle = isFocus ? '#eab308' : '#92400e';
        ctx.lineWidth = isFocus ? 2.2 : 1.4;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        drawRoundedRect(ctx, dx - 10, dy - 19, 20, 11, 2);
        ctx.fill();
        ctx.fillStyle = isFocus ? '#4ade80' : '#38bdf8';
        ctx.fillRect(dx - 8, dy - 17, 16, 7);
      });

      // 7. Update posisi & aktivitas pekerja
      agents.forEach((ag, idx) => {
        const spec = WORKER_SPECS[idx];
        const isWorkerActive = working && idx === activeIdx;

        let goalX = ag.targetX;
        let goalY = ag.targetY;

        if (isWorkerActive) {
          goalX = spec.deskRatioX * logicalW;
          goalY = spec.deskRatioY * logicalH + 22;
          ag.seated = false;
        } else if (working) {
          goalX = spec.deskRatioX * logicalW + 18;
          goalY = spec.deskRatioY * logicalH + 24;
          ag.seated = false;
        } else {
          ag.activityTimer -= dt;
          if (ag.activityTimer <= 0) {
            const cycle: IdleActivity[] = ['coffee', 'smoke', 'roam'];
            const currentPos = cycle.indexOf(ag.activity);
            const nextAct = cycle[(currentPos + 1) % cycle.length];
            ag.activity = nextAct;
            ag.activityTimer = nextAct === 'roam' ? 4.5 : 6.5;
            const spot = assignIdleSpot(idx, nextAct, logicalW, logicalH, now);
            ag.targetX = spot.x;
            ag.targetY = spot.y;
            ag.seated = false;
          }
        }

        const dx = goalX - ag.x;
        const dy = goalY - ag.y;
        const dist = Math.hypot(dx, dy);

        let isMoving = false;
        if (dist > 3.5) {
          const speed = isWorkerActive ? 105 : 54;
          const step = Math.min(dist, speed * dt);
          ag.x += (dx / dist) * step;
          ag.y += (dy / dist) * step;
          ag.stepPhase += dt * 9.5;
          isMoving = true;
          ag.seated = false;
        } else if (!working && (ag.activity === 'coffee' || ag.activity === 'smoke')) {
          ag.seated = true;
        }

        // Jarak antar pekerja saat berjalan bebas
        if (!working && !ag.seated) {
          agents.forEach((other, j) => {
            if (idx === j || other.seated) return;
            const ox = ag.x - other.x;
            const oy = ag.y - other.y;
            const odist = Math.hypot(ox, oy);
            const minSep = 68;
            if (odist > 0.1 && odist < minSep) {
              const push = ((minSep - odist) / minSep) * 42 * dt;
              ag.x += (ox / odist) * push;
              ag.y += (oy / odist) * push;
            }
          });
        }

        ag.x = Math.max(28, Math.min(logicalW - 28, ag.x));
        ag.y = Math.max(logicalH * 0.34, Math.min(logicalH - 22, ag.y));
        ag.puffPhase += dt * 2.4;

        ag.bubbleTimer += dt;
        if (ag.bubbleTimer >= 3.2) {
          ag.bubbleTimer = 0;
          ag.bubbleIndex = (ag.bubbleIndex + 1) % 2;
        }
      });

      // Gambar karakter berurutan sesuai Y
      const drawOrder = agents.map((ag, idx) => ({ ag, idx })).sort((a, b) => a.ag.y - b.ag.y);
      const placedBubbles: Array<{ x: number; y: number; w: number; h: number }> = [];

      drawOrder.forEach(({ ag, idx }) => {
        const spec = WORKER_SPECS[idx];
        const isWorkerActive = working && idx === activeIdx;
        const isMoving = Math.hypot(ag.targetX - ag.x, ag.targetY - ag.y) > 3.5;
        const isSmokingIdle = !working && ag.activity === 'smoke' && ag.seated;
        const isCoffeeIdle = !working && ag.activity === 'coffee' && ag.seated;

        const bobY = isMoving
          ? Math.abs(Math.sin(ag.stepPhase)) * -3.5
          : isWorkerActive
            ? Math.sin(now / 130) * -2
            : ag.seated
              ? Math.sin(now / 450 + idx) * -1.2
              : 0;

        const px = ag.x;
        const py = ag.y + bobY;

        // Bayangan
        ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ag.x, ag.y + 17, 11, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Kaki (lebih pendek/ditekuk saat duduk santai)
        const legSwing = isMoving ? Math.sin(ag.stepPhase) * 5 : 0;
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (ag.seated) {
          ctx.moveTo(px - 4, py + 7);
          ctx.lineTo(px - 6, py + 13);
          ctx.moveTo(px + 4, py + 7);
          ctx.lineTo(px + 6, py + 13);
        } else {
          ctx.moveTo(px - 4, py + 7);
          ctx.lineTo(px - 4 + legSwing, py + 16.5);
          ctx.moveTo(px + 4, py + 7);
          ctx.lineTo(px + 4 - legSwing, py + 16.5);
        }
        ctx.stroke();

        // Badan
        ctx.fillStyle = spec.shirtColor;
        drawRoundedRect(ctx, px - 8.5, py - 6, 17, 13.5, 4.5);
        ctx.fill();
        ctx.strokeStyle = spec.shirtShadow;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Tangan + cangkir kopi / rokok
        const armSwing = isMoving ? -legSwing * 0.7 : isWorkerActive ? Math.cos(now / 100) * 3.5 : 0;
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(px - 8.5, py - 2);
        ctx.lineTo(px - 12.5, py + 4 + armSwing);
        ctx.moveTo(px + 8.5, py - 2);
        ctx.lineTo(px + 12.5, py + 4 - armSwing);
        ctx.stroke();

        if (isCoffeeIdle) {
          ctx.fillStyle = '#ffffff';
          drawRoundedRect(ctx, px + 10, py - 1, 7, 6, 1.5);
          ctx.fill();
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Uap kopi hangat
          const steamOffset = (ag.puffPhase % 1) * 8;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px + 13.5, py - 3 - steamOffset * 0.4);
          ctx.quadraticCurveTo(px + 16, py - 6 - steamOffset * 0.7, px + 13, py - 9 - steamOffset);
          ctx.stroke();
        }

        if (isSmokingIdle) {
          // Batang rokok kecil
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 6, py - 11);
          ctx.lineTo(px + 11, py - 11);
          ctx.stroke();

          // Kepulan asap rokok
          for (let p = 0; p < 3; p++) {
            const prog = ((ag.puffPhase * 0.45 + p * 0.33) % 1);
            const sx = px + 13 + prog * 12;
            const sy = py - 13 - prog * 18;
            const sr = 2.2 + prog * 4;
            ctx.fillStyle = `rgba(226, 232, 240, ${(1 - prog) * 0.75})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Kepala & rambut
        ctx.fillStyle = '#fde68a';
        drawRoundedRect(ctx, px - 7.5, py - 20.5, 15, 14.5, 5);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.fillStyle = spec.hairColor;
        drawRoundedRect(ctx, px - 7.8, py - 22, 15.6, 5, 2.8);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(px - 3.2, py - 13.5, 1.4, 0, Math.PI * 2);
        ctx.arc(px + 3.2, py - 13.5, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Label peran di bawah kaki
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'center';
        const tagText = spec.roleTitle;
        const tagW = ctx.measureText(tagText).width + 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        drawRoundedRect(ctx, px - tagW / 2, py + 19.5, tagW, 13.5, 6.5);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillText(tagText, px, py + 29);

        // Speech bubble anti-tumpuk
        let bubbleText = spec.roamTexts[ag.bubbleIndex % spec.roamTexts.length];
        if (isWorkerActive) {
          bubbleText =
            idx === 1 && chDone > 0
              ? `Bab ${chDone}/${totCh}${lw ? ` (${lw}k)` : ''}`
              : spec.workText;
        } else if (working) {
          bubbleText = 'Siaga di meja';
        } else if (isCoffeeIdle) {
          bubbleText = spec.coffeeTexts[ag.bubbleIndex % spec.coffeeTexts.length];
        } else if (isSmokingIdle) {
          bubbleText = spec.smokeTexts[ag.bubbleIndex % spec.smokeTexts.length];
        }

        ctx.font = 'bold 9.5px sans-serif';
        const textW = Math.min(152, ctx.measureText(bubbleText).width + 14);
        const bh = 18.5;
        let bx = Math.max(8, Math.min(logicalW - textW - 8, px - textW / 2));
        let by = Math.max(8, py - 44);

        for (let attempt = 0; attempt < 4; attempt++) {
          const overlaps = placedBubbles.some(
            (b) =>
              bx < b.x + b.w + 4 &&
              bx + textW + 4 > b.x &&
              by < b.y + b.h + 3 &&
              by + bh + 3 > b.y
          );
          if (!overlaps) break;
          by = Math.max(6, by - 20.5);
        }
        placedBubbles.push({ x: bx, y: by, w: textW, h: bh });

        ctx.fillStyle = isWorkerActive ? '#0f172a' : '#ffffff';
        drawRoundedRect(ctx, bx, by, textW, bh, 9);
        ctx.fill();
        ctx.strokeStyle = isWorkerActive ? '#34d399' : isSmokingIdle ? '#059669' : '#64748b';
        ctx.lineWidth = isWorkerActive ? 1.5 : 1.1;
        ctx.stroke();

        ctx.fillStyle = isWorkerActive ? '#ffffff' : '#0f172a';
        ctx.fillText(bubbleText, bx + textW / 2, by + 12.2);
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
        height: 365,
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
          background: #fef3c7;
          color: #92400e;
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
                ? `Pekerja aktif bekerja di stasiun #${activeStageIdx + 1} (${WORKER_SPECS[activeStageIdx]?.roleTitle}).`
                : 'Tidak ada pekerjaan — pekerja bisa jalan-jalan, ngopi di pantry, atau duduk merokok di smoking area.'}
            </span>
          </div>
          <span className={`cn-floor-chip ${isAnyWorking ? 'chip-work' : 'chip-idle'}`}>
            {isAnyWorking ? 'MODE KERJA AKTIF' : 'MODE SANTAI · NGOPI & SMOKING'}
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
