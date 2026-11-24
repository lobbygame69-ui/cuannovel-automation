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

type CharacterStyleType = 'glasses' | 'curly' | 'neat' | 'creative' | 'courier';
type IdleModeType = 'coffee' | 'smoke' | 'stroll';

interface WorkerProfile {
  key: string;
  stationLabel: string;
  shortTitle: string;
  roleTitle: string;
  workText: string;
  coffeeBubbles: string[];
  smokeBubbles: string[];
  strollBubbles: string[];
  shirtMain: string;
  shirtTrim: string;
  pantsColor: string;
  hairColor: string;
  styleType: CharacterStyleType;
  deskRatioX: number;
  deskRatioY: number;
  roamBox: { minX: number; maxX: number; minY: number; maxY: number };
}

const WORKER_PROFILES: WorkerProfile[] = [
  {
    key: 'scout_research',
    stationLabel: '1. Riset',
    shortTitle: 'Riset Proyek',
    roleTitle: 'Riset Novel',
    workText: 'Riset ide & sinopsis',
    coffeeBubbles: ['Sruput kopi dulu...', 'Kopi panas mantap!'],
    smokeBubbles: ['Ngerokok sambil mikir', 'Santai hisap dulu'],
    strollBubbles: ['Jalan cari ide baru', 'Cek sudut ruangan'],
    shirtMain: '#0284c7',
    shirtTrim: '#e0f2fe',
    pantsColor: '#1e293b',
    hairColor: '#0f172a',
    styleType: 'glasses',
    deskRatioX: 0.14,
    deskRatioY: 0.43,
    roamBox: { minX: 0.07, maxX: 0.22, minY: 0.56, maxY: 0.84 }
  },
  {
    key: 'novelku_production',
    stationLabel: '2. Tulis Bab',
    shortTitle: 'Tulis Bab',
    roleTitle: 'Penulis Bab',
    workText: 'Menulis bab novel',
    coffeeBubbles: ['Ngopi biar plot lancar', 'Secangkir inspirasi'],
    smokeBubbles: ['Ngerokok lepas penat', 'Ngebul santai dulu'],
    strollBubbles: ['Jalan mikirin konflik', 'Goyang santai dulu'],
    shirtMain: '#2563eb',
    shirtTrim: '#dbeafe',
    pantsColor: '#334155',
    hairColor: '#7c2d12',
    styleType: 'curly',
    deskRatioX: 0.34,
    deskRatioY: 0.43,
    roamBox: { minX: 0.24, maxX: 0.38, minY: 0.56, maxY: 0.84 }
  },
  {
    key: 'formatting_kdp',
    stationLabel: '3. Audit & Rapikan',
    shortTitle: 'Audit & Rapikan',
    roleTitle: 'Auditor KDP',
    workText: 'Audit bab & layout',
    coffeeBubbles: ['Ngopi cek ketelitian', 'Kopi susu dulu'],
    smokeBubbles: ['Santai ngerokok dulu', 'Ngebul pelan-pelan'],
    strollBubbles: ['Jalan santai keliling', 'Cek kerapian ruang'],
    shirtMain: '#059669',
    shirtTrim: '#d1fae5',
    pantsColor: '#1f2937',
    hairColor: '#334155',
    styleType: 'neat',
    deskRatioX: 0.54,
    deskRatioY: 0.43,
    roamBox: { minX: 0.4, maxX: 0.54, minY: 0.56, maxY: 0.84 }
  },
  {
    key: 'cover_generation',
    stationLabel: '4. Cover & Kemas',
    shortTitle: 'Cover & Kemas Paket',
    roleTitle: 'Desainer Cover',
    workText: 'Desain cover & kemas',
    coffeeBubbles: ['Ngopi cari estetika', 'Kopi dingin dulu'],
    smokeBubbles: ['Ngerokok cari konsep', 'Duduk ngebul santai'],
    strollBubbles: ['Jalan cuci mata', 'Mondar-mandir gaya'],
    shirtMain: '#9333ea',
    shirtTrim: '#f3e8ff',
    pantsColor: '#27272a',
    hairColor: '#eab308',
    styleType: 'creative',
    deskRatioX: 0.22,
    deskRatioY: 0.75,
    roamBox: { minX: 0.08, maxX: 0.25, minY: 0.54, maxY: 0.72 }
  },
  {
    key: 'gdrive_upload',
    stationLabel: '5. Google Drive',
    shortTitle: 'Google Drive',
    roleTitle: 'Kurir Drive',
    workText: 'Upload ke Drive',
    coffeeBubbles: ['Ngopi sebelum kirim', 'Santai minum kopi'],
    smokeBubbles: ['Ngerokok santai dulu', 'Ngebul sambil duduk'],
    strollBubbles: ['Jalan santai keliling', 'Siap antar berkas'],
    shirtMain: '#d97706',
    shirtTrim: '#fef3c7',
    pantsColor: '#1e293b',
    hairColor: '#111827',
    styleType: 'courier',
    deskRatioX: 0.46,
    deskRatioY: 0.75,
    roamBox: { minX: 0.36, maxX: 0.56, minY: 0.54, maxY: 0.72 }
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

interface SimAgent {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  mode: IdleModeType;
  atSpot: boolean;
  modeTimer: number;
  bubbleIdx: number;
  bubbleTimer: number;
  walkPhase: number;
  chillPhase: number;
  facing: 1 | -1;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawLushPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 13, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#b45309';
  roundRectPath(ctx, x - 8, y + 2, 16, 12, 3);
  ctx.fill();
  ctx.fillStyle = '#d97706';
  ctx.fillRect(x - 9, y + 1, 18, 3);

  const leaves = [
    { dx: -6, dy: -4, r: 7.5, c: '#15803d' },
    { dx: 6, dy: -3, r: 7, c: '#166534' },
    { dx: 0, dy: -10, r: 8.5, c: '#16a34a' },
    { dx: -3, dy: -8, r: 4.5, c: '#4ade80' }
  ];
  leaves.forEach((lf) => {
    ctx.fillStyle = lf.c;
    ctx.beginPath();
    ctx.arc(x + lf.dx, y + lf.dy, lf.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

const RealisticVirtualOfficeCanvas: React.FC<{
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

    // 5 kursi/titik ngopi terpisah & 5 kursi/titik smoking terpisah agar tidak pernah bertumpuk
    const coffeeSpots = [
      { rx: 0.72, ry: 0.37 },
      { rx: 0.79, ry: 0.45 },
      { rx: 0.86, ry: 0.37 },
      { rx: 0.91, ry: 0.46 },
      { rx: 0.76, ry: 0.49 }
    ];
    const smokeSpots = [
      { rx: 0.72, ry: 0.71 },
      { rx: 0.8, ry: 0.69 },
      { rx: 0.88, ry: 0.71 },
      { rx: 0.75, ry: 0.83 },
      { rx: 0.86, ry: 0.83 }
    ];

    const initialModes: IdleModeType[] = ['coffee', 'smoke', 'stroll', 'coffee', 'smoke'];

    const agents: SimAgent[] = WORKER_PROFILES.map((w, i) => ({
      x: 150 + i * 115,
      y: i < 3 ? 195 : 275,
      targetX: 210 + i * 85,
      targetY: 225,
      mode: initialModes[i],
      atSpot: false,
      modeTimer: 4.5 + i * 1.3,
      bubbleIdx: i,
      bubbleTimer: 0,
      walkPhase: i * 1.4,
      chillPhase: i * 0.8,
      facing: 1
    }));

    let rafId = 0;
    let lastTime = performance.now();

    const pickTargetForMode = (
      idx: number,
      mode: IdleModeType,
      w: number,
      h: number,
      nowMs: number
    ) => {
      if (mode === 'coffee') {
        const spot = coffeeSpots[idx % coffeeSpots.length];
        return { x: spot.rx * w, y: spot.ry * h };
      }
      if (mode === 'smoke') {
        const spot = smokeSpots[idx % smokeSpots.length];
        return { x: spot.rx * w, y: spot.ry * h };
      }
      const box = WORKER_PROFILES[idx].roamBox;
      const seed = (idx * 113 + Math.floor(nowMs / 600)) % 997;
      const rx = ((seed * 53) % 1000) / 1000;
      const ry = ((seed * 79) % 1000) / 1000;
      return {
        x: (box.minX + rx * (box.maxX - box.minX)) * w,
        y: (box.minY + ry * (box.maxY - box.minY)) * h
      };
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const parentWidth = canvas.parentElement?.clientWidth || 880;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const logicalW = Math.max(400, parentWidth);
      const logicalH = 390;

      if (canvas.width !== Math.round(logicalW * dpr) || canvas.height !== Math.round(logicalH * dpr)) {
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Dinding atas hangat & wainscoting
      const wallGrad = ctx.createLinearGradient(0, 0, 0, logicalH * 0.25);
      wallGrad.addColorStop(0, '#cbd5e1');
      wallGrad.addColorStop(1, '#f1f5f9');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, logicalW, logicalH * 0.25);

      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, logicalH * 0.19, logicalW, logicalH * 0.06);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, logicalH * 0.19);
      ctx.lineTo(logicalW, logicalH * 0.19);
      ctx.stroke();

      // Jendela berkisi + sinar matahari
      [0.19, 0.47, 0.78].forEach((ratio) => {
        const wx = logicalW * ratio;
        const wy = 13;
        const ww = 70;
        const wh = 44;

        ctx.fillStyle = '#7dd3fc';
        roundRectPath(ctx, wx - ww / 2, wy, ww, wh, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Awan kecil di jendela
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(wx - 10, wy + 16, 6, 0, Math.PI * 2);
        ctx.arc(wx - 4, wy + 14, 7, 0, Math.PI * 2);
        ctx.fill();

        // Palang kisi jendela
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx, wy + wh);
        ctx.moveTo(wx - ww / 2, wy + wh / 2);
        ctx.lineTo(wx + ww / 2, wy + wh / 2);
        ctx.stroke();

        // Cahaya matahari hangat miring
        const sunGrad = ctx.createLinearGradient(wx, wy + wh, wx + 25, logicalH * 0.65);
        sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
        sunGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.moveTo(wx - ww / 2, wy + wh);
        ctx.lineTo(wx + ww / 2, wy + wh);
        ctx.lineTo(wx + ww * 0.9, logicalH * 0.65);
        ctx.lineTo(wx - ww * 0.4, logicalH * 0.65);
        ctx.closePath();
        ctx.fill();
      });

      // 2. Lantai kayu hangat berpola papan
      const floorGrad = ctx.createLinearGradient(0, logicalH * 0.25, 0, logicalH);
      floorGrad.addColorStop(0, '#edd69e');
      floorGrad.addColorStop(1, '#d9b573');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, logicalH * 0.25, logicalW, logicalH * 0.75);

      ctx.strokeStyle = 'rgba(120, 53, 15, 0.14)';
      ctx.lineWidth = 1;
      for (let py = logicalH * 0.27; py < logicalH; py += 24) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(logicalW, py);
        ctx.stroke();
      }

      // 3. Zona Kerja Utama (kiri)
      const wzX = logicalW * 0.035;
      const wzY = logicalH * 0.28;
      const wzW = logicalW * 0.61;
      const wzH = logicalH * 0.67;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      roundRectPath(ctx, wzX + 3, wzY + 4, wzW, wzH, 16);
      ctx.fill();

      const carpetGrad = ctx.createLinearGradient(0, wzY, 0, wzY + wzH);
      carpetGrad.addColorStop(0, '#1e3a8a');
      carpetGrad.addColorStop(1, '#172554');
      ctx.fillStyle = carpetGrad;
      roundRectPath(ctx, wzX, wzY, wzW, wzH, 16);
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#93c5fd';
      ctx.fillText('STUDIO PIPELINE & MEJA KERJA', wzX + 14, wzY + 18);

      // 4. Area Ngopi & Pantry (kanan atas)
      const czX = logicalW * 0.67;
      const czY = logicalH * 0.28;
      const czW = logicalW * 0.295;
      const czH = logicalH * 0.31;

      ctx.fillStyle = '#fef3c7';
      roundRectPath(ctx, czX, czY, czW, czH, 15);
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#92400e';
      ctx.fillText('AREA NGOPI & PANTRY', czX + 12, czY + 17);

      // Meja counter kopi & mesin kopi
      const counterX = czX + czW * 0.5;
      const counterY = czY + czH * 0.34;
      ctx.fillStyle = '#78350f';
      roundRectPath(ctx, counterX - 42, counterY - 7, 84, 15, 4);
      ctx.fill();
      ctx.fillStyle = '#b45309';
      roundRectPath(ctx, counterX - 44, counterY - 9, 88, 5, 2.5);
      ctx.fill();

      // Mesin kopi merah/hitam + cangkir
      ctx.fillStyle = '#dc2626';
      roundRectPath(ctx, counterX - 24, counterY - 20, 14, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(counterX + 6, counterY - 14, 7, 6);
      ctx.fillRect(counterX + 18, counterY - 14, 7, 6);

      // 5. Area Istirahat & Smoking Area (kanan bawah)
      const szX = logicalW * 0.67;
      const szY = logicalH * 0.615;
      const szW = logicalW * 0.295;
      const szH = logicalH * 0.335;

      ctx.fillStyle = '#ecfdf5';
      roundRectPath(ctx, szX, szY, szW, szH, 15);
      ctx.fill();
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#065f46';
      ctx.fillText('ISTIRAHAT & SMOKING AREA', szX + 12, szY + 17);

      // Sofa santai & meja asbak
      const sofaX = szX + szW * 0.5;
      const sofaY = szY + szH * 0.36;
      ctx.fillStyle = '#047857';
      roundRectPath(ctx, sofaX - 42, sofaY - 8, 84, 16, 5);
      ctx.fill();
      ctx.fillStyle = '#34d399';
      roundRectPath(ctx, sofaX - 38, sofaY - 6, 36, 11, 3);
      ctx.fill();
      roundRectPath(ctx, sofaX + 2, sofaY - 6, 36, 11, 3);
      ctx.fill();

      // Meja bundar asbak
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(sofaX, sofaY + 20, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(sofaX, sofaY + 20, 4, 0, Math.PI * 2);
      ctx.fill();

      drawLushPlant(ctx, wzX + 20, wzY + wzH - 18);
      drawLushPlant(ctx, szX + szW - 18, szY + szH - 18);

      const {
        isAnyWorking: working,
        activeStageIdx: activeIdx,
        chaptersDone: chDone,
        totalChapters: totCh,
        lastWords: lw
      } = stateRef.current;

      // 6. Gambar 5 meja kerja utama dengan kursi & monitor
      WORKER_PROFILES.forEach((w, idx) => {
        const dx = w.deskRatioX * logicalW;
        const dy = w.deskRatioY * logicalH;
        const isFocus = working && idx === activeIdx;

        // Kursi di belakang meja
        ctx.fillStyle = '#334155';
        roundRectPath(ctx, dx - 11, dy - 22, 22, 10, 4);
        ctx.fill();

        // Bayangan meja
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        roundRectPath(ctx, dx - 30, dy - 7, 60, 20, 5);
        ctx.fill();

        // Permukaan meja kayu hangat
        ctx.fillStyle = isFocus ? '#fde047' : '#d97706';
        roundRectPath(ctx, dx - 30, dy - 10, 60, 17, 5);
        ctx.fill();
        ctx.strokeStyle = isFocus ? '#ca8a04' : '#78350f';
        ctx.lineWidth = isFocus ? 2.2 : 1.4;
        ctx.stroke();

        // Monitor + stand
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(dx - 3, dy - 11, 6, 4);
        roundRectPath(ctx, dx - 12, dy - 22, 24, 12, 2.5);
        ctx.fill();
        ctx.fillStyle = isFocus ? '#4ade80' : '#38bdf8';
        ctx.fillRect(dx - 9.5, dy - 19.5, 19, 7.5);
      });

      // 7. Update posisi & aktivitas santai/kerja 5 karakter
      agents.forEach((ag, idx) => {
        const prof = WORKER_PROFILES[idx];
        const isWorkerActive = working && idx === activeIdx;

        let goalX = ag.targetX;
        let goalY = ag.targetY;

        if (isWorkerActive) {
          goalX = prof.deskRatioX * logicalW;
          goalY = prof.deskRatioY * logicalH + 21;
          ag.atSpot = false;
        } else if (working) {
          goalX = prof.deskRatioX * logicalW + 18;
          goalY = prof.deskRatioY * logicalH + 24;
          ag.atSpot = false;
        } else {
          ag.modeTimer -= dt;
          if (ag.modeTimer <= 0) {
            const order: IdleModeType[] = ['coffee', 'smoke', 'stroll'];
            const nextMode = order[(order.indexOf(ag.mode) + 1) % order.length];
            ag.mode = nextMode;
            ag.modeTimer = nextMode === 'stroll' ? 4.2 : 6.8;
            const nextPos = pickTargetForMode(idx, nextMode, logicalW, logicalH, now);
            ag.targetX = nextPos.x;
            ag.targetY = nextPos.y;
            ag.atSpot = false;
          }
        }

        const dx = goalX - ag.x;
        const dy = goalY - ag.y;
        const dist = Math.hypot(dx, dy);

        let moving = false;
        if (dist > 3.5) {
          const speed = isWorkerActive ? 105 : 50;
          const step = Math.min(dist, speed * dt);
          ag.x += (dx / dist) * step;
          ag.y += (dy / dist) * step;
          ag.walkPhase += dt * 9;
          ag.facing = dx >= 0 ? 1 : -1;
          moving = true;
          ag.atSpot = false;
        } else if (!working && (ag.mode === 'coffee' || ag.mode === 'smoke')) {
          ag.atSpot = true;
        }

        ag.x = Math.max(30, Math.min(logicalW - 30, ag.x));
        ag.y = Math.max(logicalH * 0.34, Math.min(logicalH - 24, ag.y));
        ag.chillPhase += dt * 2.5;

        ag.bubbleTimer += dt;
        if (ag.bubbleTimer >= 3.2) {
          ag.bubbleTimer = 0;
          ag.bubbleIdx = (ag.bubbleIdx + 1) % 2;
        }

        // Simpan status gerak sementara di properti pada objek lewat closure map
        (ag as SimAgent & { _moving?: boolean })._moving = moving;
      });

      const drawList = agents.map((ag, idx) => ({ ag, idx })).sort((a, b) => a.ag.y - b.ag.y);
      const placedBubbles: Array<{ x: number; y: number; w: number; h: number }> = [];

      drawList.forEach(({ ag, idx }) => {
        const prof = WORKER_PROFILES[idx];
        const isWorkerActive = working && idx === activeIdx;
        const moving = Boolean((ag as SimAgent & { _moving?: boolean })._moving);
        const chillingCoffee = !working && ag.mode === 'coffee' && ag.atSpot;
        const chillingSmoke = !working && ag.mode === 'smoke' && ag.atSpot;

        const waddleTilt = moving ? Math.sin(ag.walkPhase) * 0.08 : 0;
        const bounceY = moving
          ? Math.abs(Math.sin(ag.walkPhase)) * -3.5
          : isWorkerActive
            ? Math.sin(now / 120) * -2
            : chillingCoffee || chillingSmoke
              ? Math.sin(ag.chillPhase) * -1.4
              : 0;

        const px = ag.x;
        const py = ag.y + bounceY;

        // Bayangan kaki
        ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ag.x, ag.y + 17, 11, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(waddleTilt);

        // Kaki & sepatu
        const legSwing = moving ? Math.sin(ag.walkPhase) * 5 : 0;
        ctx.strokeStyle = prof.pantsColor;
        ctx.lineWidth = 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (ag.atSpot) {
          ctx.moveTo(-4, 7);
          ctx.lineTo(-6, 13);
          ctx.moveTo(4, 7);
          ctx.lineTo(6, 13);
        } else {
          ctx.moveTo(-4, 7);
          ctx.lineTo(-4 + legSwing, 16.5);
          ctx.moveTo(4, 7);
          ctx.lineTo(4 - legSwing, 16.5);
        }
        ctx.stroke();

        // Sepatu kecil
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-7.5 + (moving ? legSwing : 0), ag.atSpot ? 12.5 : 15.5, 5, 2.5);
        ctx.fillRect(2.5 - (moving ? legSwing : 0), ag.atSpot ? 12.5 : 15.5, 5, 2.5);

        // Badan kemeja + kerah/saku
        ctx.fillStyle = prof.shirtMain;
        roundRectPath(ctx, -8.5, -6, 17, 13.5, 4.5);
        ctx.fill();
        ctx.fillStyle = prof.shirtTrim;
        ctx.fillRect(-3, -6, 6, 3);

        // Lengan & gestur santai/kerja
        const armWave = moving
          ? -legSwing * 0.75
          : isWorkerActive
            ? Math.cos(now / 95) * 3.5
            : chillingCoffee
              ? Math.sin(ag.chillPhase * 1.3) * 2.5
              : chillingSmoke
                ? Math.cos(ag.chillPhase * 0.9) * 2
                : Math.sin(ag.chillPhase) * 1.5;

        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2.7;
        ctx.beginPath();
        ctx.moveTo(-8.5, -2);
        ctx.lineTo(-12.5, 4 + armWave);
        ctx.moveTo(8.5, -2);
        ctx.lineTo(12.5, 4 - armWave);
        ctx.stroke();

        // Cangkir kopi + uap saat ngopi
        if (chillingCoffee) {
          ctx.fillStyle = '#ffffff';
          roundRectPath(ctx, 10, -1 + armWave * 0.4, 7.5, 6.5, 1.5);
          ctx.fill();
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1;
          ctx.stroke();

          const steam = (ag.chillPhase % 1) * 9;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(13.8, -3 - steam * 0.35);
          ctx.quadraticCurveTo(16.5, -6 - steam * 0.7, 13.5, -9 - steam);
          ctx.stroke();
        }

        // Rokok + kepulan asap santai saat di smoking area
        if (chillingSmoke) {
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(5, -11);
          ctx.lineTo(11, -11);
          ctx.stroke();

          ctx.fillStyle = '#f97316';
          ctx.fillRect(10.5, -11.8, 2, 1.6);

          for (let p = 0; p < 3; p++) {
            const prog = (ag.chillPhase * 0.35 + p * 0.33) % 1;
            const sx = 13 + prog * 13;
            const sy = -13 - prog * 19;
            const sr = 2.2 + prog * 4.2;
            ctx.fillStyle = `rgba(226, 232, 240, ${(1 - prog) * 0.78})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Kepala
        ctx.fillStyle = '#fde68a';
        roundRectPath(ctx, -7.8, -21, 15.6, 15, 5.2);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // Rambut / gaya khas karakter
        ctx.fillStyle = prof.hairColor;
        if (prof.styleType === 'curly') {
          ctx.beginPath();
          ctx.arc(-5, -20, 4.5, 0, Math.PI * 2);
          ctx.arc(0, -22, 5, 0, Math.PI * 2);
          ctx.arc(5, -20, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (prof.styleType === 'courier') {
          roundRectPath(ctx, -8.5, -23.5, 17, 5.5, 2.5);
          ctx.fill();
          ctx.fillRect(-10, -19.5, 20, 2);
        } else {
          roundRectPath(ctx, -8, -22.5, 16, 5.5, 2.8);
          ctx.fill();
        }

        // Mata & kacamata opsional
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-3.2, -13.5, 1.4, 0, Math.PI * 2);
        ctx.arc(3.2, -13.5, 1.4, 0, Math.PI * 2);
        ctx.fill();

        if (prof.styleType === 'glasses') {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.1;
          ctx.strokeRect(-6.2, -15.5, 5, 4);
          ctx.strokeRect(1.2, -15.5, 5, 4);
        }

        ctx.restore();

        // Label jabatan kecil di bawah kaki
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'center';
        const tagText = prof.roleTitle;
        const tagW = ctx.measureText(tagText).width + 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        roundRectPath(ctx, px - tagW / 2, py + 19.5, tagW, 13.5, 6.5);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillText(tagText, px, py + 29);

        // Speech bubble anti-tumpuk
        let bubbleText = prof.strollBubbles[ag.bubbleIdx % prof.strollBubbles.length];
        if (isWorkerActive) {
          bubbleText =
            idx === 1 && chDone > 0
              ? `Bab ${chDone}/${totCh}${lw ? ` (${lw}k)` : ''}`
              : prof.workText;
        } else if (working) {
          bubbleText = 'Siaga di meja';
        } else if (chillingCoffee) {
          bubbleText = prof.coffeeBubbles[ag.bubbleIdx % prof.coffeeBubbles.length];
        } else if (chillingSmoke) {
          bubbleText = prof.smokeBubbles[ag.bubbleIdx % prof.smokeBubbles.length];
        }

        ctx.font = 'bold 9.5px sans-serif';
        const textW = Math.min(156, ctx.measureText(bubbleText).width + 14);
        const bh = 18.5;
        let bx = Math.max(8, Math.min(logicalW - textW - 8, px - textW / 2));
        let by = Math.max(8, py - 45);

        for (let attempt = 0; attempt < 5; attempt++) {
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
        roundRectPath(ctx, bx, by, textW, bh, 9);
        ctx.fill();
        ctx.strokeStyle = isWorkerActive ? '#34d399' : chillingSmoke ? '#059669' : '#64748b';
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
        height: 390,
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
                ? `Pekerja aktif bekerja di stasiun #${activeStageIdx + 1} (${WORKER_PROFILES[activeStageIdx]?.roleTitle}).`
                : 'Tidak ada pekerjaan — pekerja berjalan santai, ngopi di pantry, atau duduk merokok di smoking area.'}
            </span>
          </div>
          <span className={`cn-floor-chip ${isAnyWorking ? 'chip-work' : 'chip-idle'}`}>
            {isAnyWorking ? 'MODE KERJA AKTIF' : 'MODE SANTAI · NGOPI & SMOKING'}
          </span>
        </div>

        <RealisticVirtualOfficeCanvas
          isAnyWorking={isAnyWorking}
          activeStageIdx={activeStageIdx}
          chaptersDone={activeSlot?.chaptersDone || 0}
          totalChapters={totalChapters}
          lastWords={activeSlot?.lastWords}
        />
      </div>

      <div className="cn-stations-grid">
        {WORKER_PROFILES.map((st, idx) => {
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
              Tahap berjalan: <strong>{WORKER_PROFILES[activeStageIdx]?.shortTitle}</strong>
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
