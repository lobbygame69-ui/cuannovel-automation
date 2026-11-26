import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface CoverAgentInput {
  title: string;
  genre?: string;
  synopsis: string;
  author?: string;
  publisher?: string;
}

interface CoverArtPlan {
  frontPrompt: string;
  backPrompt: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  glowColor: string;
  sceneTheme: 'glass_orchard' | 'celestial' | 'botanical' | 'urban_noir' | 'romantic_horizon' | 'mystic_arch';
  focalMotif: string;
  source: string;
}

interface CoverAgentOutput {
  ok: boolean;
  agent: 'cuannovel-cover-designer';
  brainProvider: string;
  title: string;
  author: string;
  publisher: string;
  tagline: string;
  focalMotif: string;
  frontPrompt: string;
  backPrompt: string;
  ebookSvg: string;
  wrapSvg: string;
  frontGenerated: boolean;
  backGenerated: boolean;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapSvgLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

function getGeminiKeys(): string[] {
  const keys = [getEnv('GEMINI_API_KEY'), getEnv('GEMINI_API_KEY_BACKUP')]
    .map((k) => String(k || '').trim())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) >>> 0;
}

function normalizeTheme(
  rawTheme: unknown,
  title: string,
  genre: string,
  synopsis: string
): CoverArtPlan['sceneTheme'] {
  const combined = `${title} ${genre} ${synopsis}`.toLowerCase();
  if (/glass|orchard|crystal|prism|translucent|kaca|kristal/.test(combined)) {
    return 'glass_orchard';
  }

  const t = String(rawTheme || '').toLowerCase().trim();
  if (
    t === 'celestial' ||
    t === 'botanical' ||
    t === 'urban_noir' ||
    t === 'romantic_horizon' ||
    t === 'mystic_arch'
  ) {
    return t;
  }

  if (/romance|love|heart|sunset|senja|cinta|rindu|wedding|autumn/.test(combined)) {
    return 'romantic_horizon';
  }
  if (/forest|garden|nature|bloom|leaf|hutan|taman|bunga|alam/.test(combined)) {
    return 'botanical';
  }
  if (/noir|crime|detective|city|rain|neon|shadow|kota|misteri|thriller/.test(combined)) {
    return 'urban_noir';
  }
  if (/magic|fantasy|archive|citadel|ancient|ruin|sihir|fantasi|rahasia/.test(combined)) {
    return 'mystic_arch';
  }
  return 'celestial';
}

function normalizeHex(raw: unknown, fallback: string): string {
  const val = String(raw || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(val) ? val : fallback;
}

async function callQwenCoverBrain(input: {
  title: string;
  genre: string;
  synopsis: string;
  author: string;
}): Promise<CoverArtPlan | null> {
  const openRouterKey = getEnv('OPENROUTER_API_KEY');
  if (!openRouterKey) return null;

  const qwenModels = [
    'qwen/qwen-2.5-72b-instruct:free',
    'qwen/qwen3-coder:free',
    'qwen/qwen-2.5-vl-72b-instruct:free'
  ];

  const promptText = [
    'You are a Fine Art Book Cover Art Director (Qwen AI) for CuanNovel.',
    'Create a rich, painterly, literary art direction for the book cover based on its title, genre, and synopsis.',
    'Avoid plain flat shapes or minimalist geometric placeholders. Describe expressive artistic depth, light refraction, fine linework, and evocative story motifs.',
    'Never put text or letters inside the artwork itself.',
    `Title: ${input.title}`,
    `Genre: ${input.genre}`,
    `Author: ${input.author}`,
    `Synopsis: ${input.synopsis.slice(0, 500)}`,
    'Return ONLY valid JSON with exact keys:',
    '{"frontPrompt":"rich painterly front cover art prompt","backPrompt":"complementary painterly back cover art prompt","tagline":"poetic short tagline","focalMotif":"evocative 3-6 word motif","sceneTheme":"glass_orchard|celestial|botanical|urban_noir|romantic_horizon|mystic_arch","primaryColor":"#0a101d","secondaryColor":"#17263b","accentColor":"#e7be70","glowColor":"#5eead4"}'
  ].join('\n');

  for (const model of qwenModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterKey}`,
          'HTTP-Referer': getEnv('APP_URL', 'https://cuannovel-automation.vercel.app'),
          'X-Title': 'CuanNovel Fine Art Cover Brain (Qwen)'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.8,
          max_tokens: 1024
        }),
        signal: controller.signal,
        cache: 'no-store'
      });

      if (!res.ok) continue;

      const json = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
      } | null;

      const raw = json?.choices?.[0]?.message?.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const frontPrompt = String(parsed.frontPrompt || '').trim();
      const backPrompt = String(parsed.backPrompt || '').trim();

      if (frontPrompt && backPrompt) {
        const noTextRule =
          'Strictly NO text, NO letters, NO words, NO numbers, NO watermarks, NO logos, NO borders.';
        return {
          frontPrompt: `${frontPrompt} ${noTextRule}`,
          backPrompt: `${backPrompt} ${noTextRule}`,
          tagline: String(
            parsed.tagline || '“Every hidden truth leaves a mark that cannot be undone.”'
          ).trim(),
          focalMotif: String(parsed.focalMotif || 'Luminous Story Scene').trim(),
          sceneTheme: normalizeTheme(parsed.sceneTheme, input.title, input.genre, input.synopsis),
          primaryColor: normalizeHex(parsed.primaryColor, '#0a101d'),
          secondaryColor: normalizeHex(parsed.secondaryColor, '#17263b'),
          accentColor: normalizeHex(parsed.accentColor, '#e7be70'),
          glowColor: normalizeHex(parsed.glowColor, '#5eead4'),
          source: `qwen:${model}`
        };
      }
    } catch {
      // lanjut ke model Qwen berikutnya
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

async function callGeminiCoverBrain(input: {
  title: string;
  genre: string;
  synopsis: string;
  author: string;
}): Promise<CoverArtPlan | null> {
  const keys = getGeminiKeys();
  const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  const noTextRule =
    'Strictly NO text, NO letters, NO words, NO numbers, NO watermarks, NO logos, NO borders.';

  for (const key of keys) {
    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: [
                        'You are a Fine Art Book Cover Art Director for CuanNovel.',
                        'Design a painterly, literary front and back cover art concept from the novel description.',
                        `Title: ${input.title}`,
                        `Genre: ${input.genre}`,
                        `Author: ${input.author}`,
                        `Synopsis: ${input.synopsis.slice(0, 450)}`,
                        'Return ONLY valid JSON:',
                        '{"frontPrompt":"...","backPrompt":"...","tagline":"...","focalMotif":"...","sceneTheme":"glass_orchard|celestial|botanical|urban_noir|romantic_horizon|mystic_arch","primaryColor":"#0a101d","secondaryColor":"#17263b","accentColor":"#e7be70","glowColor":"#5eead4"}'
                      ].join('\n')
                    }
                  ]
                }
              ],
              generationConfig: { temperature: 0.78, maxOutputTokens: 1024 }
            }),
            cache: 'no-store'
          }
        );
        if (!res.ok) continue;

        const json = (await res.json().catch(() => null)) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        } | null;
        const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) continue;

        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        if (parsed.frontPrompt && parsed.backPrompt) {
          return {
            frontPrompt: `${String(parsed.frontPrompt).trim()} ${noTextRule}`,
            backPrompt: `${String(parsed.backPrompt).trim()} ${noTextRule}`,
            tagline: String(
              parsed.tagline || '“Every hidden truth leaves a mark that cannot be undone.”'
            ).trim(),
            focalMotif: String(parsed.focalMotif || 'Luminous Story Scene').trim(),
            sceneTheme: normalizeTheme(parsed.sceneTheme, input.title, input.genre, input.synopsis),
            primaryColor: normalizeHex(parsed.primaryColor, '#0a101d'),
            secondaryColor: normalizeHex(parsed.secondaryColor, '#17263b'),
            accentColor: normalizeHex(parsed.accentColor, '#e7be70'),
            glowColor: normalizeHex(parsed.glowColor, '#5eead4'),
            source: `gemini:${model}`
          };
        }
      } catch {
        // lanjut
      }
    }
  }

  return null;
}

async function planVisualDirection(input: {
  title: string;
  genre: string;
  synopsis: string;
  author: string;
}): Promise<CoverArtPlan> {
  const qwenPlan = await callQwenCoverBrain(input);
  if (qwenPlan) return qwenPlan;

  const geminiPlan = await callGeminiCoverBrain(input);
  if (geminiPlan) return geminiPlan;

  const cleanSynopsis = String(input.synopsis || '').replace(/\s+/g, ' ').trim();
  const noTextRule =
    'Strictly NO text, NO letters, NO words, NO numbers, NO watermarks, NO logos, NO borders.';

  return {
    frontPrompt: `Fine-art editorial novel front cover painting for "${input.title}" (${input.genre}) inspired by ${cleanSynopsis.slice(0, 220)}. Painterly depth, luminous highlights, intricate storytelling details. ${noTextRule}`,
    backPrompt: `Complementary fine-art back cover painting for "${input.title}" (${input.genre}) with atmospheric depth, glowing light accents, and rich visual texture. ${noTextRule}`,
    tagline: '“Every hidden truth leaves a mark that cannot be undone.”',
    focalMotif: 'Painterly Storyscape & Light',
    sceneTheme: normalizeTheme(null, input.title, input.genre, input.synopsis),
    primaryColor: '#0a101d',
    secondaryColor: '#17263b',
    accentColor: '#e7be70',
    glowColor: '#5eead4',
    source: 'built-in-fine-art-director'
  };
}

async function generateArtworkDataUri(promptText: string): Promise<string | null> {
  const keys = getGeminiKeys();
  const imageModels = ['gemini-2.5-flash-image', 'gemini-2.0-flash-exp-image-generation'];

  for (const key of keys) {
    for (const model of imageModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 22000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: promptText }] }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
            }),
            signal: controller.signal,
            cache: 'no-store'
          }
        );
        if (!res.ok) continue;

        const json = (await res.json().catch(() => null)) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
            };
          }>;
        } | null;

        const parts = json?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          const b64 = part?.inlineData?.data;
          const mime = part?.inlineData?.mimeType || 'image/png';
          if (b64 && b64.length > 500) {
            return `data:${mime};base64,${b64}`;
          }
        }
      } catch {
        // lanjut
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  return null;
}

function buildFineArtScene(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  seedKey: string;
  plan: CoverArtPlan;
  role: 'front' | 'back';
}): string {
  const s = hashSeed(params.seedKey);
  const cx = params.x + Math.round(params.width * (params.role === 'front' ? 0.54 : 0.48));
  const cy = params.y + Math.round(params.height * (params.role === 'front' ? 0.62 : 0.67));
  const unit = Math.min(params.width, params.height);
  const accent = escapeHtml(params.plan.accentColor);
  const glow = escapeHtml(params.plan.glowColor);
  const primary = escapeHtml(params.plan.primaryColor);
  const secondary = escapeHtml(params.plan.secondaryColor);

  const artElements: string[] = [];

  // Lapisan cahaya atmosferik & halo berlapis
  artElements.push(
    `<rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" fill="${primary}"/>`,
    `<circle cx="${cx}" cy="${cy - Math.round(unit * 0.06)}" r="${Math.round(unit * 0.44)}" fill="${secondary}" opacity="0.72"/>`,
    `<circle cx="${cx}" cy="${cy - Math.round(unit * 0.06)}" r="${Math.round(unit * 0.29)}" fill="${accent}" opacity="0.16"/>`,
    `<circle cx="${cx + Math.round(unit * 0.08)}" cy="${cy - Math.round(unit * 0.14)}" r="${Math.round(unit * 0.18)}" fill="${glow}" opacity="0.14"/>`
  );

  // Berkas cahaya diagonal bernuansa seni
  for (let i = 0; i < 14; i++) {
    const spread = ((i - 6.5) / 7) * 0.95 + (((s + i * 19) % 10) - 5) * 0.012;
    const xTop = cx + Math.round(spread * params.width * 0.72);
    const yTop = params.y + Math.round(params.height * 0.14);
    const xBot = cx + Math.round(spread * params.width * 0.35);
    const yBot = params.y + Math.round(params.height * 0.92);
    const sw = i % 3 === 0 ? 4 : 1.8;
    const op = (0.09 + ((i % 4) * 0.045)).toFixed(2);
    artElements.push(
      `<line x1="${xTop}" y1="${yTop}" x2="${xBot}" y2="${yBot}" stroke="${i % 2 === 0 ? accent : glow}" stroke-width="${sw}" opacity="${op}"/>`
    );
  }

  // Motif utama berdasarkan tema cerita
  if (params.plan.sceneTheme === 'glass_orchard') {
    const trunkBaseX = cx;
    const trunkBaseY = params.y + Math.round(params.height * 0.93);
    const crownY = cy - Math.round(unit * 0.04);

    // Batang & cabang pohon kaca yang melengkung artistik
    artElements.push(
      `<path d="M ${trunkBaseX - 24} ${trunkBaseY} C ${trunkBaseX - 10} ${trunkBaseY - 260}, ${trunkBaseX - 75} ${trunkBaseY - 520}, ${trunkBaseX - 220} ${crownY} L ${trunkBaseX - 196} ${crownY - 12} C ${trunkBaseX - 52} ${trunkBaseY - 510}, ${trunkBaseX + 12} ${trunkBaseY - 260}, ${trunkBaseX + 26} ${trunkBaseY} Z" fill="#131d31" stroke="${accent}" stroke-width="2.5" opacity="0.92"/>`
    );

    const branchConfigs = [
      { dx: -360, dy: -150, ctrlX: -190, ctrlY: -190, fruitX: -375, fruitY: -115, r: 34 },
      { dx: 340, dy: -165, ctrlX: 175, ctrlY: -205, fruitX: 355, fruitY: -128, r: 38 },
      { dx: -260, dy: -310, ctrlX: -120, ctrlY: -290, fruitX: -275, fruitY: -272, r: 28 },
      { dx: 250, dy: -325, ctrlX: 115, ctrlY: -310, fruitX: 268, fruitY: -288, r: 32 },
      { dx: -115, dy: -415, ctrlX: -45, ctrlY: -355, fruitX: -122, fruitY: -378, r: 26 },
      { dx: 125, dy: -420, ctrlX: 55, ctrlY: -360, fruitX: 132, fruitY: -382, r: 30 }
    ];

    branchConfigs.forEach((b, idx) => {
      const startY = trunkBaseY - 380 - idx * 45;
      const endX = trunkBaseX + b.dx;
      const endY = trunkBaseY - 460 + b.dy;
      const cX = trunkBaseX + b.ctrlX;
      const cY = trunkBaseY - 460 + b.ctrlY;
      const fX = trunkBaseX + b.fruitX;
      const fY = trunkBaseY - 460 + b.fruitY;
      const fruitStroke = idx % 2 === 0 ? accent : glow;

      artElements.push(
        `<path d="M ${trunkBaseX} ${startY} Q ${cX} ${cY} ${endX} ${endY}" fill="none" stroke="${accent}" stroke-width="5.5" stroke-linecap="round" opacity="0.72"/>`,
        `<line x1="${endX}" y1="${endY}" x2="${fX}" y2="${fY - b.r * 0.7}" stroke="${fruitStroke}" stroke-width="2.2" opacity="0.75"/>`,
        `<circle cx="${fX}" cy="${fY}" r="${b.r + 14}" fill="${fruitStroke}" opacity="0.14"/>`,
        `<circle cx="${fX}" cy="${fY}" r="${b.r}" fill="#17253b" fill-opacity="0.72" stroke="${fruitStroke}" stroke-width="3"/>`,
        `<ellipse cx="${fX - b.r * 0.28}" cy="${fY - b.r * 0.3}" rx="${Math.round(b.r * 0.28)}" ry="${Math.round(b.r * 0.45)}" transform="rotate(-24 ${fX - b.r * 0.28} ${fY - b.r * 0.3})" fill="#ffffff" opacity="0.35"/>`
      );
    });

    // Siluet kota/arsitektur melayang di latar belakang
    for (let i = 0; i < 7; i++) {
      const fx = params.x + Math.round(params.width * (0.14 + i * 0.115));
      const fy = params.y + Math.round(params.height * (0.46 + ((s + i * 37) % 14) * 0.01));
      const fw = 52 + ((s + i * 19) % 44);
      const fh = 34 + ((s + i * 23) % 36);
      artElements.push(
        `<polygon points="${fx},${fy} ${fx + fw * 0.5},${fy - 14} ${fx + fw},${fy} ${fx + fw * 0.72},${fy + fh} ${fx + fw * 0.28},${fy + fh}" fill="#152238" fill-opacity="0.78" stroke="${accent}" stroke-opacity="0.42" stroke-width="1.8"/>`
      );
    }
  } else {
    // Motif seni berlapis untuk tema lain (botanical, urban_noir, romantic_horizon, mystic_arch, celestial)
    for (let i = 0; i < 6; i++) {
      const angle = ((i * 60 + (s % 45)) * Math.PI) / 180;
      const px = cx + Math.round(Math.cos(angle) * unit * 0.22);
      const py = cy - Math.round(unit * 0.06) + Math.round(Math.sin(angle) * unit * 0.22);
      artElements.push(
        `<circle cx="${px}" cy="${py}" r="${42 + (i % 3) * 16}" fill="none" stroke="${i % 2 === 0 ? accent : glow}" stroke-width="2.5" opacity="0.45"/>`,
        `<circle cx="${px}" cy="${py}" r="${18 + (i % 2) * 10}" fill="${i % 2 === 0 ? accent : glow}" opacity="0.22"/>`
      );
    }
  }

  // Lanskap perbukitan & lembah berlapis di bagian bawah
  const baseBottomY = params.y + params.height;
  const hill1Y = params.y + Math.round(params.height * 0.77);
  const hill2Y = params.y + Math.round(params.height * 0.84);

  artElements.push(
    `<path d="M ${params.x} ${hill1Y} C ${params.x + Math.round(params.width * 0.26)} ${hill1Y - 125}, ${params.x + Math.round(params.width * 0.58)} ${hill1Y + 75}, ${params.x + params.width} ${hill1Y - 65} L ${params.x + params.width} ${baseBottomY} L ${params.x} ${baseBottomY} Z" fill="#101a2e" opacity="0.9"/>`,
    `<path d="M ${params.x} ${hill2Y} C ${params.x + Math.round(params.width * 0.34)} ${hill2Y + 85}, ${params.x + Math.round(params.width * 0.68)} ${hill2Y - 95}, ${params.x + params.width} ${hill2Y + 25} L ${params.x + params.width} ${baseBottomY} L ${params.x} ${baseBottomY} Z" fill="#090e1a" opacity="0.95" stroke="${accent}" stroke-opacity="0.32" stroke-width="2"/>`
  );

  // Partikel cahaya / kilau halus bertebaran
  for (let i = 0; i < 36; i++) {
    const gx = params.x + Math.round((((s + i * 797) % 1000) / 1000) * params.width);
    const gy = params.y + Math.round(params.height * (0.2 + (((s + i * 521) % 1000) / 1000) * 0.72));
    const gr = 2.5 + ((s + i * 17) % 9);
    const gFill = i % 3 === 0 ? glow : accent;
    const gOp = (0.25 + (((s + i * 29) % 60) / 100)).toFixed(2);
    artElements.push(`<circle cx="${gx}" cy="${gy}" r="${gr}" fill="${gFill}" opacity="${gOp}"/>`);
  }

  return artElements.join('\n');
}

async function runCoverDesignerAgent(input: CoverAgentInput): Promise<CoverAgentOutput> {
  const title = String(input.title || 'Untitled Novel').trim();
  const genre = String(input.genre || 'FICTION').trim();
  const synopsis = String(input.synopsis || '').trim();
  const author = String(input.author || 'M. F. Julian').trim();
  const publisher = String(input.publisher || 'cuannovelkarya').trim();

  const plan = await planVisualDirection({ title, genre, synopsis, author });
  const frontArt = await generateArtworkDataUri(plan.frontPrompt);
  const backArt = await generateArtworkDataUri(plan.backPrompt);

  const titleLines = wrapSvgLines(title, 15, 3);
  const blurbLines = wrapSvgLines(synopsis, 36, 9);

  const ebookTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="800" y="${495 + idx * 142}" text-anchor="middle" font-family="Georgia, serif" font-size="130" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const wrapFrontTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="2943" y="${515 + idx * 148}" text-anchor="middle" font-family="Georgia, serif" font-size="134" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const blurbSvg = blurbLines
    .map(
      (line, idx) =>
        `<text x="919" y="${325 + idx * 54}" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="-20" y="-20" width="1640" height="2680" preserveAspectRatio="xMidYMid slice"/>`
    : buildFineArtScene({
        x: 0,
        y: 0,
        width: 1600,
        height: 2560,
        seedKey: `${title}|${genre}|${plan.focalMotif}|front|ebook`,
        plan,
        role: 'front'
      });

  const wrapBackArtLayer = backArt
    ? `<image href="${escapeHtml(backArt)}" x="-20" y="-20" width="1878" height="2860" preserveAspectRatio="xMidYMid slice"/>`
    : buildFineArtScene({
        x: 0,
        y: 0,
        width: 1838,
        height: 2775,
        seedKey: `${title}|${genre}|${plan.focalMotif}|back|wrap`,
        plan,
        role: 'back'
      });

  const wrapFrontArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="2004" y="-20" width="1878" height="2860" preserveAspectRatio="xMidYMid slice"/>`
    : buildFineArtScene({
        x: 2024,
        y: 0,
        width: 1838,
        height: 2775,
        seedKey: `${title}|${genre}|${plan.focalMotif}|front|wrap`,
        plan,
        role: 'front'
      });

  const ebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <clipPath id="eb-clip"><rect x="0" y="0" width="1600" height="2560"/></clipPath>
    <linearGradient id="eb-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070b12" stop-opacity="0.58"/>
      <stop offset="50%" stop-color="#070b12" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.65"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#eb-clip)">
    ${ebookArtLayer}
    <rect x="0" y="0" width="1600" height="2560" fill="url(#eb-scrim)"/>
    <rect x="68" y="68" width="1464" height="2424" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="3" opacity="0.82"/>
    <text x="800" y="235" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${ebookTitleSvg}
    <text x="800" y="2345" text-anchor="middle" font-family="Georgia, serif" font-size="76" letter-spacing="5" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
  </g>
</svg>`;

  const wrapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3862" height="2775" viewBox="0 0 3862 2775">
  <defs>
    <clipPath id="clip-back"><rect x="0" y="0" width="1838" height="2775"/></clipPath>
    <clipPath id="clip-spine"><rect x="1838" y="0" width="186" height="2775"/></clipPath>
    <clipPath id="clip-front"><rect x="2024" y="0" width="1838" height="2775"/></clipPath>
    <linearGradient id="back-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070b12" stop-opacity="0.38"/>
      <stop offset="52%" stop-color="#070b12" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.52"/>
    </linearGradient>
    <linearGradient id="front-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070b12" stop-opacity="0.58"/>
      <stop offset="50%" stop-color="#070b12" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.65"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#clip-back)">
    ${wrapBackArtLayer}
    <rect x="0" y="0" width="1838" height="2775" fill="url(#back-scrim)"/>
    <rect x="225" y="235" width="1388" height="820" fill="#090d14" fill-opacity="0.72" stroke="${escapeHtml(plan.accentColor)}" stroke-opacity="0.78" stroke-width="2.5"/>
    ${blurbSvg}
    <text x="919" y="995" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="35" fill="#e2e8f0">${escapeHtml(plan.tagline)}</text>
    <polygon points="340,2245 395,2213 450,2245 450,2309 395,2341 340,2309" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="5"/>
    <polygon points="362,2258 395,2239 428,2258 428,2296 395,2315 362,2296" fill="none" stroke="#f8fafc" stroke-width="2.5"/>
    <text x="395" y="2415" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="3" font-weight="bold" fill="#f8fafc">${escapeHtml(publisher)}</text>
    <rect x="1150" y="2235" width="540" height="330" rx="8" fill="#ffffff"/>
  </g>

  <g clip-path="url(#clip-spine)">
    <rect x="1838" y="0" width="186" height="2775" fill="#12161f"/>
    <g transform="translate(1931, 1388) rotate(90)">
      <text x="-430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(title.toUpperCase())}</text>
      <circle cx="0" cy="0" r="14" fill="${escapeHtml(plan.accentColor)}" opacity="0.85"/>
      <text x="430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
    </g>
  </g>

  <g clip-path="url(#clip-front)">
    ${wrapFrontArtLayer}
    <rect x="2024" y="0" width="1838" height="2775" fill="url(#front-scrim)"/>
    <rect x="2125" y="135" width="1636" height="2505" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="3" opacity="0.82"/>
    <text x="2943" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${wrapFrontTitleSvg}
    <text x="2943" y="2535" text-anchor="middle" font-family="Georgia, serif" font-size="82" letter-spacing="5" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
  </g>
</svg>`;

  return {
    ok: true,
    agent: 'cuannovel-cover-designer',
    brainProvider: plan.source,
    title,
    author,
    publisher,
    tagline: plan.tagline,
    focalMotif: plan.focalMotif,
    frontPrompt: plan.frontPrompt,
    backPrompt: plan.backPrompt,
    ebookSvg,
    wrapSvg,
    frontGenerated: Boolean(frontArt),
    backGenerated: Boolean(backArt)
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CoverAgentInput>;
    if (!body?.title || !body?.synopsis) {
      return NextResponse.json(
        { ok: false, error: 'Wajib mengirim title dan synopsis dari novel cuannovel.' },
        { status: 400 }
      );
    }

    const result = await runCoverDesignerAgent({
      title: String(body.title),
      genre: body.genre ? String(body.genre) : 'FICTION',
      synopsis: String(body.synopsis),
      author: body.author ? String(body.author) : 'M. F. Julian',
      publisher: body.publisher ? String(body.publisher) : 'cuannovelkarya'
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = (searchParams.get('title') || 'The Ember Archive').trim();
  const genre = (searchParams.get('genre') || 'FANTASY / MYSTERY').trim();
  const author = (searchParams.get('author') || 'M. F. Julian').trim();
  const publisher = (searchParams.get('publisher') || 'cuannovelkarya').trim();
  const synopsis = (
    searchParams.get('synopsis') ||
    'In a world where knowledge is forbidden and secrets are forged from ember and shadow, a lone archivist uncovers a truth that could reshape the realm—or ignite a war.'
  ).trim();

  const result = await runCoverDesignerAgent({ title, genre, synopsis, author, publisher });

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cover Designer Agent — ${escapeHtml(result.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #090d14; color: #f8fafc; padding: 20px; margin: 0; }
    .meta { font-size: 13px; color: #cbd5e1; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; align-items: start; }
    .card { background: #131924; padding: 14px; border-radius: 12px; border: 1px solid #1e293b; }
    .svg-box { width: 100%; border-radius: 8px; overflow: hidden; background: #090d14; }
    .svg-box svg { width: 100%; height: auto; display: block; }
    h2 { margin: 0 0 10px; font-size: 15px; }
  </style>
</head>
<body>
  <h1>Cover Designer Agent: ${escapeHtml(result.title)}</h1>
  <div class="meta">Brain: ${escapeHtml(result.brainProvider)} | Motif: ${escapeHtml(result.focalMotif)} | Front AI: ${result.frontGenerated ? 'Yes' : 'Fine Art'} | Back AI: ${result.backGenerated ? 'Yes' : 'Fine Art'}</div>
  <div class="grid">
    <div class="card">
      <h2>E-Book Cover</h2>
      <div class="svg-box">${result.ebookSvg}</div>
    </div>
    <div class="card">
      <h2>Paperback Full-Wrap Cover</h2>
      <div class="svg-box">${result.wrapSvg}</div>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
