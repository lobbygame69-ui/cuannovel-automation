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
type IdleModeType = 'coffee' | 'balcony_smoke' | 'stroll';

interface WorkerProfile {
  key: string;
  stationLabel: string;
  shortTitle: string;
  roleTitle: string;
  trait: string;
  favorite: string;
  workText: string;
  coffeeBubbles: string[];
  balconyBubbles: string[];
  strollBubbles: string[];
  shirtMain: string;
  shirtTrim: string;
  pantsColor: string;
  hairColor: string;
  cupColor: string;
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
    trait: 'Penasaran & Teliti',
    favorite: 'Kopi Hitam',
    workText: 'Riset ide & sinopsis',
    coffeeBubbles: ['Kopi hitam mantap!', 'Nemu ide unik nih'],
    balconyBubbles: ['Di balkon aja ngerokoknya', 'Angin luar segar banget'],
    strollBubbles: ['Lirik-lirik tren baru', 'Jalan mikir sinopsis'],
    shirtMain: '#0284c7',
    shirtTrim: '#e0f2fe',
    pantsColor: '#1e293b',
    hairColor: '#0f172a',
    cupColor: '#3f2e21',
    styleType: 'glasses',
    deskRatioX: 0.135,
    deskRatioY: 0.43,
    roamBox: { minX: 0.06, maxX: 0.2, minY: 0.56, maxY: 0.84 }
  },
  {
    key: 'novelku_production',
    stationLabel: '2. Tulis Bab',
    shortTitle: 'Tulis Bab',
    roleTitle: 'Penulis Bab',
    trait: 'Imajinatif & Ekspresif',
    favorite: 'Teh Hangat & Roti',
    workText: 'Menulis bab novel',
    coffeeBubbles: ['Ngeteh hangat dulu', 'Roti manis + plot twist!'],
    balconyBubbles: ['Ngerokok di teras luar', 'Dilarang ngerokok di dalam!'],
    strollBubbles: ['Wah nemu adegan seru!', 'Jalan goyang cari dialog'],
    shirtMain: '#2563eb',
    shirtTrim: '#dbeafe',
    pantsColor: '#334155',
    hairColor: '#7c2d12',
    cupColor: '#f59e0b',
    styleType: 'curly',
    deskRatioX: 0.32,
    deskRatioY: 0.43,
    roamBox: { minX: 0.22, maxX: 0.35, minY: 0.56, maxY: 0.84 }
  },
  {
    key: 'formatting_kdp',
    stationLabel: '3. Audit & Rapikan',
    shortTitle: 'Audit & Rapikan',
    roleTitle: 'Auditor KDP',
    trait: 'Tegas & Perfeksionis',
    favorite: 'Kopi Susu',
    workText: 'Audit bab & layout',
    coffeeBubbles: ['Kopi susu biar fokus', 'Cek margin 6"x9"'],
    balconyBubbles: ['Ke teras smoking dulu', 'Patuhi aturan kantor!'],
    strollBubbles: ['Jalan rapi cek ruangan', 'Pastikan semua tertib'],
    shirtMain: '#059669',
    shirtTrim: '#d1fae5',
    pantsColor: '#1f2937',
    hairColor: '#334155',
    cupColor: '#d97706',
    styleType: 'neat',
    deskRatioX: 0.505,
    deskRatioY: 0.43,
    roamBox: { minX: 0.37, maxX: 0.5, minY: 0.56, maxY: 0.84 }
  },
  {
    key: 'cover_generation',
    stationLabel: '4. Cover & Kemas',
    shortTitle: 'Cover & Kemas Paket',
    roleTitle: 'Desainer Cover',
    trait: 'Ceria & Kreatif',
    favorite: 'Es Kopi Segar',
    workText: 'Desain cover & kemas',
    coffeeBubbles: ['Sruput es kopi dulu!', 'Warna cover makin kece'],
    balconyBubbles: ['Ngerokok di balkon luar', 'Udara luar bikin fresh'],
    strollBubbles: ['Goyang santai cari gaya', 'Cuci mata lihat desain'],
    shirtMain: '#9333ea',
    shirtTrim: '#f3e8ff',
    pantsColor: '#27272a',
    hairColor: '#eab308',
    cupColor: '#38bdf8',
    styleType: 'creative',
    deskRatioX: 0.21,
    deskRatioY: 0.75,
    roamBox: { minX: 0.07, maxX: 0.23, minY: 0.54, maxY: 0.72 }
  },
  {
    key: 'gdrive_upload',
    stationLabel: '5. Google Drive',
    shortTitle: 'Google Drive',
    roleTitle: 'Kurir Drive',
    trait: 'Gesit & Ramah',
    favorite: 'Air Dingin & Camilan',
    workText: 'Upload ke Drive',
    coffeeBubbles: ['Minum dingin dulu bos', 'Camilan siap meluncur'],
    balconyBubbles: ['Ngerokok di teras smoking', 'Santai di luar ruangan'],
    strollBubbles: ['Halo! Siap kirim file', 'Jalan lincah keliling'],
    shirtMain: '#d97706',
    shirtTrim: '#fef3c7',
    pantsColor: '#1e293b',
    hairColor: '#111827',
    cupColor: '#60a5fa',
    styleType: 'courier',
    deskRatioX: 0.43,
    deskRatioY: 0.75,
    roamBox: { minX: 0.33, maxX: 0.51, minY: 0.54, maxY: 0.72 }
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

const LivingOfficeCanvas: React.FC<{
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

    // Titik ngopi di pantry dalam ruangan
    const coffeeSpots = [
      { rx: 0.65, ry: 0.42 },
      { rx: 0.72, ry: 0.48 },
      { rx: 0.65, ry: 0.53 },
      { rx: 0.73, ry: 0.39 },
      { rx: 0.68, ry: 0.54 }
    ];

    // Titik merokok di balkon / teras luar ruangan (dilarang merokok di dalam kantor)
    const balconySpots = [
      { rx: 0.83, ry: 0.38 },
      { rx: 0.91, ry: 0.44 },
      { rx: 0.84, ry: 0.58 },
      { rx: 0.92, ry: 0.68 },
      { rx: 0.85, ry: 0.82 }
    ];

    const initialModes: IdleModeType[] = ['coffee', 'balcony_smoke', 'stroll', 'coffee', 'balcony_smoke'];

    const agents: SimAgent[] = WORKER_PROFILES.map((w, i) => ({
      x: 130 + i * 110,
      y: i < 3 ? 195 : 275,
      targetX: 200 + i * 80,
      targetY: 225,
      mode: initialModes[i],
      atSpot: false,
      modeTimer: 4.5 + i * 1.2,
      bubbleIdx: i,
      bubbleTimer: 0,
      walkPhase: i * 1.4,
      chillPhase: i * 0.9
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
      if (mode === 'balcony_smoke') {
        const spot = balconySpots[idx % balconySpots.length];
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

      const parentWidth = canvas.parentElement?.clientWidth || 900;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const logicalW = Math.max(420, parentWidth);
      const logicalH = 400;

      if (canvas.width !== Math.round(logicalW * dpr) || canvas.height !== Math.round(logicalH * dpr)) {
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Dinding atas kantor + papan aturan DILARANG MEROKOK DI DALAM
      const wallGrad = ctx.createLinearGradient(0, 0, 0, logicalH * 0.25);
      wallGrad.addColorStop(0, '#cbd5e1');
      wallGrad.addColorStop(1, '#f1f5f9');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, logicalW, logicalH * 0.25);

      // Papan aturan dilarang merokok di dalam ruangan
      const signX = logicalW * 0.34;
      const signY = 10;
      const signW = logicalW * 0.32;
      const signH = 22;
      ctx.fillStyle = '#fef2f2';
      roundRectPath(ctx, signX, signY, signW, signH, 6);
      ctx.fill();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.font = 'bold 9.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#b91c1c';
      ctx.fillText('DILARANG MEROKOK DI DALAM KANTOR — GUNAKAN TERAS LUAR', signX + signW / 2, signY + 14.5);

      // Jendela kantor
      [0.16, 0.84].forEach((ratio) => {
        const wx = logicalW * ratio;
        const wy = 13;
        const ww = 66;
        const wh = 42;
        ctx.fillStyle = '#7dd3fc';
        roundRectPath(ctx, wx - ww / 2, wy, ww, wh, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // 2. Lantai kayu hangat di dalam kantor
      const floorGrad = ctx.createLinearGradient(0, logicalH * 0.25, 0, logicalH);
      floorGrad.addColorStop(0, '#edd69e');
      floorGrad.addColorStop(1, '#d9b573');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, logicalH * 0.25, logicalW * 0.78, logicalH * 0.75);

      // 3. Teras / Balkon Smoking Area di luar (kanan)
      const balX = logicalW * 0.78;
      const balY = logicalH * 0.25;
      const balW = logicalW * 0.22;
      const balH = logicalH * 0.75;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(balX, balY, balW, balH);
      ctx.strokeStyle = '#64748b';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(balX, balY);
      ctx.lineTo(balX, balY + balH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = 'bold 9.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.fillText('TERAS SMOKING (LUAR)', balX + balW / 2, balY + 16);

      // Kursi santai & asbak di teras luar
      ctx.fillStyle = '#475569';
      roundRectPath(ctx, balX + balW * 0.5 - 26, balY + 75, 52, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(balX + balW * 0.5, balY + 115, 6, 0, Math.PI * 2);
      ctx.fill();

      // 4. Zona Kerja Pipeline (kiri)
      const wzX = logicalW * 0.03;
      const wzY = logicalH * 0.28;
      const wzW = logicalW * 0.525;
      const wzH = logicalH * 0.67;

      ctx.fillStyle = '#1e3a8a';
      roundRectPath(ctx, wzX, wzY, wzW, wzH, 15);
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#93c5fd';
      ctx.fillText('RUANG KERJA PIPELINE', wzX + 12, wzY + 17);

      // 5. Area Ngopi & Santai Minuman/Camilan (tengah-kanan dalam ruangan)
      const czX = logicalW * 0.57;
      const czY = logicalH * 0.28;
      const czW = logicalW * 0.195;
      const czH = logicalH * 0.67;

      ctx.fillStyle = '#fef3c7';
      roundRectPath(ctx, czX, czY, czW, czH, 15);
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#92400e';
      ctx.fillText('PANTRY KOPI & TEH', czX + 10, czY + 17);

      // Meja counter kopi
      const barX = czX + czW * 0.5;
      const barY = czY + 42;
      ctx.fillStyle = '#78350f';
      roundRectPath(ctx, barX - 30, barY - 6, 60, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX - 14, barY - 12, 6, 6);
      ctx.fillRect(barX + 6, barY - 12, 6, 6);

      drawLushPlant(ctx, wzX + 18, wzY + wzH - 18);
      drawLushPlant(ctx, czX + czW - 18, czY + czH - 18);

      const {
        isAnyWorking: working,
        activeStageIdx: activeIdx,
        chaptersDone: chDone,
        totalChapters: totCh,
        lastWords: lw
      } = stateRef.current;

      // 6. Gambar 5 meja kerja utama
      WORKER_PROFILES.forEach((w, idx) => {
        const dx = w.deskRatioX * logicalW;
        const dy = w.deskRatioY * logicalH;
        const isFocus = working && idx === activeIdx;

        ctx.fillStyle = '#334155';
        roundRectPath(ctx, dx - 10, dy - 20, 20, 9, 3.5);
        ctx.fill();

        ctx.fillStyle = isFocus ? '#fde047' : '#d97706';
        roundRectPath(ctx, dx - 26, dy - 10, 52, 16, 4.5);
        ctx.fill();
        ctx.strokeStyle = isFocus ? '#ca8a04' : '#78350f';
        ctx.lineWidth = isFocus ? 2 : 1.3;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        roundRectPath(ctx, dx - 10, dy - 20, 20, 11, 2);
        ctx.fill();
        ctx.fillStyle = isFocus ? '#4ade80' : '#38bdf8';
        ctx.fillRect(dx - 8, dy - 18, 16, 7);
      });

      // 7. Update posisi & aktivitas pekerja
      agents.forEach((ag, idx) => {
        const prof = WORKER_PROFILES[idx];
        const isWorkerActive = working && idx === activeIdx;

        let goalX = ag.targetX;
        let goalY = ag.targetY;

        if (isWorkerActive) {
          goalX = prof.deskRatioX * logicalW;
          goalY = prof.deskRatioY * logicalH + 20;
          ag.atSpot = false;
        } else if (working) {
          goalX = prof.deskRatioX * logicalW + 16;
          goalY = prof.deskRatioY * logicalH + 23;
          ag.atSpot = false;
        } else {
          ag.modeTimer -= dt;
          if (ag.modeTimer <= 0) {
            const cycle: IdleModeType[] = ['coffee', 'stroll', 'balcony_smoke'];
            const nextMode = cycle[(cycle.indexOf(ag.mode) + 1) % cycle.length];
            ag.mode = nextMode;
            ag.modeTimer = nextMode === 'stroll' ? 4 : 6.5;
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
          const speed = isWorkerActive ? 105 : 52;
          const step = Math.min(dist, speed * dt);
          ag.x += (dx / dist) * step;
          ag.y += (dy / dist) * step;
          ag.walkPhase += dt * 9.5;
          moving = true;
          ag.atSpot = false;
        } else if (!working && (ag.mode === 'coffee' || ag.mode === 'balcony_smoke')) {
          ag.atSpot = true;
        }

        ag.x = Math.max(28, Math.min(logicalW - 26, ag.x));
        ag.y = Math.max(logicalH * 0.34, Math.min(logicalH - 24, ag.y));
        ag.chillPhase += dt * 2.6;

        ag.bubbleTimer += dt;
        if (ag.bubbleTimer >= 3.2) {
          ag.bubbleTimer = 0;
          ag.bubbleIdx = (ag.bubbleIdx + 1) % 2;
        }

        (ag as SimAgent & { _moving?: boolean })._moving = moving;
      });

      const drawList = agents.map((ag, idx) => ({ ag, idx })).sort((a, b) => a.ag.y - b.ag.y);
      const placedBubbles: Array<{ x: number; y: number; w: number; h: number }> = [];

      drawList.forEach(({ ag, idx }) => {
        const prof = WORKER_PROFILES[idx];
        const isWorkerActive = working && idx === activeIdx;
        const moving = Boolean((ag as SimAgent & { _moving?: boolean })._moving);
        const chillingCoffee = !working && ag.mode === 'coffee' && ag.atSpot;
        const chillingBalconySmoke = !working && ag.mode === 'balcony_smoke' && ag.atSpot;

        const waddleTilt = moving ? Math.sin(ag.walkPhase) * 0.08 : 0;
        const bounceY = moving
          ? Math.abs(Math.sin(ag.walkPhase)) * -3.5
          : isWorkerActive
            ? Math.sin(now / 120) * -2
            : chillingCoffee || chillingBalconySmoke
              ? Math.sin(ag.chillPhase) * -1.4
              : 0;

        const px = ag.x;
        const py = ag.y + bounceY;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ag.x, ag.y + 17, 10.5, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(waddleTilt);

        // Kaki
        const legSwing = moving ? Math.sin(ag.walkPhase) * 5 : 0;
        ctx.strokeStyle = prof.pantsColor;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (ag.atSpot) {
          ctx.moveTo(-4, 7);
          ctx.lineTo(-6, 13);
          ctx.moveTo(4, 7);
          ctx.lineTo(6, 13);
        } else {
          ctx.moveTo(-4, 7);
          ctx.lineTo(-4 + legSwing, 16);
          ctx.moveTo(4, 7);
          ctx.lineTo(4 - legSwing, 16);
        }
        ctx.stroke();

        // Sepatu
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-7.5 + (moving ? legSwing : 0), ag.atSpot ? 12.5 : 15, 5, 2.5);
        ctx.fillRect(2.5 - (moving ? legSwing : 0), ag.atSpot ? 12.5 : 15, 5, 2.5);

        // Badan kemeja + kerah
        ctx.fillStyle = prof.shirtMain;
        roundRectPath(ctx, -8.5, -6, 17, 13.5, 4.5);
        ctx.fill();
        ctx.fillStyle = prof.shirtTrim;
        ctx.fillRect(-3, -6, 6, 3);

        // Lengan
        const armWave = moving
          ? -legSwing * 0.75
          : isWorkerActive
            ? Math.cos(now / 95) * 3.5
            : chillingCoffee
              ? Math.sin(ag.chillPhase * 1.4) * 2.5
              : Math.sin(ag.chillPhase) * 1.6;

        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-8.5, -2);
        ctx.lineTo(-12.5, 4 + armWave);
        ctx.moveTo(8.5, -2);
        ctx.lineTo(12.5, 4 - armWave);
        ctx.stroke();

        // Gelas minuman kesukaan + uap saat ngopi/ngeteh
        if (chillingCoffee) {
          ctx.fillStyle = prof.cupColor;
          roundRectPath(ctx, 10, -1 + armWave * 0.4, 7.5, 6.5, 1.5);
          ctx.fill();
          ctx.strokeStyle = '#475569';
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

        // Rokok & asap khusus di teras balkon luar
        if (chillingBalconySmoke) {
          ctx.strokeStyle = '#ffffff';
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
            const sy = -13 - prog * 18;
            const sr = 2.2 + prog * 4;
            ctx.fillStyle = `rgba(241, 245, 249, ${(1 - prog) * 0.75})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Kepala & ekspresi sesuai sifat
        ctx.fillStyle = '#fde68a';
        roundRectPath(ctx, -7.8, -21, 15.6, 15, 5.2);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.1;
        ctx.stroke();

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

        // Label peran kecil
        ctx.font = 'bold 9.2px sans-serif';
        ctx.textAlign = 'center';
        const tagText = prof.roleTitle;
        const tagW = ctx.measureText(tagText).width + 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        roundRectPath(ctx, px - tagW / 2, py + 19, tagW, 13, 6.5);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillText(tagText, px, py + 28.5);

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
        } else if (chillingBalconySmoke) {
          bubbleText = prof.balconyBubbles[ag.bubbleIdx % prof.balconyBubbles.length];
        }

        ctx.font = 'bold 9.2px sans-serif';
        const textW = Math.min(164, ctx.measureText(bubbleText).width + 14);
        const bh = 18;
        let bx = Math.max(6, Math.min(logicalW - textW - 6, px - textW / 2));
        let by = Math.max(36, py - 44);

        for (let attempt = 0; attempt < 5; attempt++) {
          const overlaps = placedBubbles.some(
            (b) =>
              bx < b.x + b.w + 4 &&
              bx + textW + 4 > b.x &&
              by < b.y + b.h + 3 &&
              by + bh + 3 > b.y
          );
          if (!overlaps) break;
          by = Math.max(36, by - 20);
        }
        placedBubbles.push({ x: bx, y: by, w: textW, h: bh });

        ctx.fillStyle = isWorkerActive ? '#0f172a' : '#ffffff';
        roundRectPath(ctx, bx, by, textW, bh, 9);
        ctx.fill();
        ctx.strokeStyle = isWorkerActive ? '#34d399' : chillingBalconySmoke ? '#dc2626' : '#64748b';
        ctx.lineWidth = isWorkerActive ? 1.5 : 1.1;
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
        height: 400,
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

        .cn-roster-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(120px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        @media (max-width: 820px) {
          .cn-roster-grid {
            grid-template-columns: repeat(2, minmax(140px, 1fr));
          }
        }
        .cn-roster-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 7px 9px;
          font-size: 11px;
          line-height: 1.4;
        }
        .cn-roster-name {
          font-weight: 800;
          color: #0f172a;
        }
        .cn-roster-meta {
          color: #475569;
          font-size: 10.5px;
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
                : 'Tanpa pekerjaan aktif — pekerja ngopi/ngeteh di pantry, jalan santai, atau merokok di teras luar (dilarang merokok di dalam).'}
            </span>
          </div>
          <span className={`cn-floor-chip ${isAnyWorking ? 'chip-work' : 'chip-idle'}`}>
            {isAnyWorking ? 'MODE KERJA AKTIF' : 'MODE SANTAI · NO SMOKING INDOOR'}
          </span>
        </div>

        <LivingOfficeCanvas
          isAnyWorking={isAnyWorking}
          activeStageIdx={activeStageIdx}
          chaptersDone={activeSlot?.chaptersDone || 0}
          totalChapters={totalChapters}
          lastWords={activeSlot?.lastWords}
        />

        <div className="cn-roster-grid">
          {WORKER_PROFILES.map((w) => (
            <div key={w.key} className="cn-roster-card">
              <div className="cn-roster-name">{w.roleTitle}</div>
              <div className="cn-roster-meta">Sifat: {w.trait}</div>
              <div className="cn-roster-meta">Kesukaan: {w.favorite}</div>
            </div>
          ))}
        </div>
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
