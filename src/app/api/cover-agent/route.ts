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
  sceneTheme: 'celestial' | 'botanical' | 'urban_noir' | 'romantic_horizon' | 'mystic_arch';
  focalMotif: string;
  atmosphereNote: string;
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
  genre: string,
  synopsis: string
): CoverArtPlan['sceneTheme'] {
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

  const combined = `${genre} ${synopsis}`.toLowerCase();
  if (/romance|love|heart|sunset|senja|cinta|rindu|wedding|autumn/.test(combined)) {
    return 'romantic_horizon';
  }
  if (/forest|garden|orchard|nature|bloom|leaf|hutan|taman|bunga|alam/.test(combined)) {
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
    'You are the Lead Book Cover Art Director (Qwen AI) for CuanNovel.',
    'Analyze the novel title, genre, and synopsis carefully to design a rich, evocative, non-generic cover concept.',
    'Never suggest plain flat backgrounds or generic stock boxes.',
    'Describe vivid story-specific visual scenes, lighting rays, foreground/midground/background depth, and emotional atmosphere.',
    'Remember: NO text or letters should appear inside the illustration itself.',
    `Title: ${input.title}`,
    `Genre: ${input.genre}`,
    `Author: ${input.author}`,
    `Synopsis: ${input.synopsis.slice(0, 500)}`,
    'Return ONLY valid JSON with exact keys:',
    '{"frontPrompt":"detailed front cover illustration prompt","backPrompt":"complementary back cover illustration prompt","tagline":"short evocative quote or tagline","focalMotif":"main story object or scene in 3-7 words","sceneTheme":"celestial|botanical|urban_noir|romantic_horizon|mystic_arch","primaryColor":"#0b1020","secondaryColor":"#1c2541","accentColor":"#e6b86a","atmosphereNote":"short visual mood note"}'
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
          'X-Title': 'CuanNovel Cover Brain (Qwen)'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.78,
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
          focalMotif: String(parsed.focalMotif || 'Story Focal Scene').trim(),
          sceneTheme: normalizeTheme(parsed.sceneTheme, input.genre, input.synopsis),
          primaryColor: normalizeHex(parsed.primaryColor, '#0b1020'),
          secondaryColor: normalizeHex(parsed.secondaryColor, '#1b263b'),
          accentColor: normalizeHex(parsed.accentColor, '#e6b86a'),
          atmosphereNote: String(parsed.atmosphereNote || '').trim(),
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
                        'You are a Book Cover Art Director for CuanNovel.',
                        'Design a rich, story-specific front and back cover visual concept from the novel description.',
                        `Title: ${input.title}`,
                        `Genre: ${input.genre}`,
                        `Author: ${input.author}`,
                        `Synopsis: ${input.synopsis.slice(0, 450)}`,
                        'Return ONLY valid JSON:',
                        '{"frontPrompt":"...","backPrompt":"...","tagline":"...","focalMotif":"...","sceneTheme":"celestial|botanical|urban_noir|romantic_horizon|mystic_arch","primaryColor":"#0b1020","secondaryColor":"#1b263b","accentColor":"#e6b86a"}'
                      ].join('\n')
                    }
                  ]
                }
              ],
              generationConfig: { temperature: 0.75, maxOutputTokens: 1024 }
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
            focalMotif: String(parsed.focalMotif || 'Story Focal Scene').trim(),
            sceneTheme: normalizeTheme(parsed.sceneTheme, input.genre, input.synopsis),
            primaryColor: normalizeHex(parsed.primaryColor, '#0b1020'),
            secondaryColor: normalizeHex(parsed.secondaryColor, '#1b263b'),
            accentColor: normalizeHex(parsed.accentColor, '#e6b86a'),
            atmosphereNote: '',
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
    frontPrompt: `Cinematic illustrated front cover scene for "${input.title}" (${input.genre}) inspired by: ${cleanSynopsis.slice(0, 240)}. Dramatic light shafts, layered depth, atmospheric storytelling focal point. ${noTextRule}`,
    backPrompt: `Complementary atmospheric back cover scene for "${input.title}" (${input.genre}) expanding the story world with soft depth and glowing highlights. ${noTextRule}`,
    tagline: '“Every hidden truth leaves a mark that cannot be undone.”',
    focalMotif: 'Atmospheric Story Horizon',
    sceneTheme: normalizeTheme(null, input.genre, input.synopsis),
    primaryColor: '#0b1020',
    secondaryColor: '#1b263b',
    accentColor: '#e6b86a',
    atmosphereNote: 'Fallback visual direction',
    source: 'built-in-director'
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

function buildStorySceneArtwork(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  seedKey: string;
  plan: CoverArtPlan;
  role: 'front' | 'back';
}): string {
  const s = hashSeed(params.seedKey);
  const cx = params.x + Math.round(params.width * (params.role === 'front' ? 0.52 : 0.46));
  const cy = params.y + Math.round(params.height * (params.role === 'front' ? 0.56 : 0.62));
  const baseR = Math.round(Math.min(params.width, params.height) * 0.34);
  const accent = escapeHtml(params.plan.accentColor);
  const primary = escapeHtml(params.plan.primaryColor);
  const secondary = escapeHtml(params.plan.secondaryColor);

  const rays: string[] = [];
  const totalRays = 16;
  for (let i = 0; i < totalRays; i++) {
    const angle = ((i * 360) / totalRays + (s % 30)) * (Math.PI / 180);
    const len = baseR * (1.1 + (((s + i * 73) % 45) / 100));
    const x2 = cx + Math.round(Math.cos(angle) * len);
    const y2 = cy + Math.round(Math.sin(angle) * len);
    const strokeW = i % 2 === 0 ? 3.5 : 1.8;
    const op = (0.14 + (((s + i * 31) % 24) / 100)).toFixed(2);
    rays.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="${strokeW}" opacity="${op}"/>`
    );
  }

  const sparkles: string[] = [];
  for (let i = 0; i < 28; i++) {
    const sx = params.x + Math.round((((s + i * 887) % 1000) / 1000) * params.width);
    const sy =
      params.y +
      Math.round(params.height * 0.18 + (((s + i * 541) % 1000) / 1000) * params.height * 0.75);
    const r = 3 + ((s + i * 19) % 14);
    const op = (0.22 + (((s + i * 37) % 62) / 100)).toFixed(2);
    sparkles.push(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="${accent}" opacity="${op}"/>`);
  }

  const horizonY = params.y + Math.round(params.height * 0.72);
  const farRidgePath = `M ${params.x} ${horizonY - 90} C ${params.x + Math.round(params.width * 0.25)} ${horizonY - 240}, ${params.x + Math.round(params.width * 0.52)} ${horizonY - 40}, ${params.x + Math.round(params.width * 0.76)} ${horizonY - 190} S ${params.x + params.width} ${horizonY - 70}, ${params.x + params.width} ${horizonY - 70} L ${params.x + params.width} ${params.y + params.height} L ${params.x} ${params.y + params.height} Z`;
  const midRidgePath = `M ${params.x} ${horizonY + 60} Q ${cx - Math.round(params.width * 0.28)} ${horizonY - 120} ${cx} ${horizonY + 25} T ${params.x + params.width} ${horizonY + 55} L ${params.x + params.width} ${params.y + params.height} L ${params.x} ${params.y + params.height} Z`;

  let motifLayer = '';
  if (params.plan.sceneTheme === 'botanical') {
    const branches: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const bx = cx + i * Math.round(baseR * 0.22);
      const by = cy - Math.abs(i) * Math.round(baseR * 0.08);
      branches.push(
        `<path d="M ${cx} ${params.y + params.height} Q ${cx + i * 40} ${cy + 80} ${bx} ${by}" fill="none" stroke="${accent}" stroke-width="5" opacity="0.55"/>`,
        `<ellipse cx="${bx}" cy="${by - 18}" rx="22" ry="36" transform="rotate(${i * 16} ${bx} ${by - 18})" fill="${accent}" opacity="0.26" stroke="${accent}" stroke-width="2.5"/>`
      );
    }
    motifLayer = branches.join('\n');
  } else if (params.plan.sceneTheme === 'mystic_arch') {
    motifLayer = `
      <path d="M ${cx - Math.round(baseR * 0.52)} ${horizonY + 120} L ${cx - Math.round(baseR * 0.52)} ${cy - Math.round(baseR * 0.35)} A ${Math.round(baseR * 0.52)} ${Math.round(baseR * 0.52)} 0 0 1 ${cx + Math.round(baseR * 0.52)} ${cy - Math.round(baseR * 0.35)} L ${cx + Math.round(baseR * 0.52)} ${horizonY + 120}" fill="none" stroke="${accent}" stroke-width="6" opacity="0.65"/>
      <circle cx="${cx}" cy="${cy - Math.round(baseR * 0.12)}" r="${Math.round(baseR * 0.24)}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.55"/>
    `;
  } else if (params.plan.sceneTheme === 'urban_noir') {
    const towers: string[] = [];
    for (let i = 0; i < 9; i++) {
      const tw = 70 + ((s + i * 31) % 75);
      const th = 220 + ((s + i * 89) % 440);
      const tx = params.x + Math.round((i / 9) * params.width);
      const ty = horizonY + 80 - th;
      towers.push(
        `<rect x="${tx}" y="${ty}" width="${tw}" height="${th + 300}" fill="${secondary}" opacity="0.48" stroke="${accent}" stroke-opacity="0.22" stroke-width="2"/>`
      );
    }
    motifLayer = towers.join('\n');
  } else if (params.plan.sceneTheme === 'romantic_horizon') {
    motifLayer = `
      <circle cx="${cx}" cy="${cy - Math.round(baseR * 0.15)}" r="${Math.round(baseR * 0.58)}" fill="${accent}" opacity="0.22"/>
      <circle cx="${cx}" cy="${cy - Math.round(baseR * 0.15)}" r="${Math.round(baseR * 0.36)}" fill="${accent}" opacity="0.34"/>
      <path d="M ${cx - Math.round(baseR * 0.7)} ${horizonY + 95} Q ${cx} ${horizonY + 135} ${cx + Math.round(baseR * 0.7)} ${horizonY + 95}" fill="none" stroke="${accent}" stroke-width="4" opacity="0.5"/>
    `;
  } else {
    motifLayer = `
      <circle cx="${cx}" cy="${cy - Math.round(baseR * 0.1)}" r="${Math.round(baseR * 0.48)}" fill="none" stroke="${accent}" stroke-width="4" opacity="0.55"/>
      <circle cx="${cx}" cy="${cy - Math.round(baseR * 0.1)}" r="${Math.round(baseR * 0.28)}" fill="${accent}" opacity="0.22"/>
    `;
  }

  return `
    <rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" fill="${primary}"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(baseR * 1.25)}" fill="${secondary}" opacity="0.65"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(baseR * 0.78)}" fill="${accent}" opacity="0.16"/>
    ${rays.join('\n')}
    <path d="${farRidgePath}" fill="${secondary}" opacity="0.72"/>
    ${motifLayer}
    <path d="${midRidgePath}" fill="#0a0f1c" opacity="0.88" stroke="${accent}" stroke-opacity="0.28" stroke-width="2.5"/>
    ${sparkles.join('\n')}
  `;
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
  const blurbLines = wrapSvgLines(synopsis, 36, 8);

  const ebookTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="800" y="${520 + idx * 145}" text-anchor="middle" font-family="Georgia, serif" font-size="132" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const wrapFrontTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="2943" y="${540 + idx * 150}" text-anchor="middle" font-family="Georgia, serif" font-size="136" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const blurbSvg = blurbLines
    .map(
      (line, idx) =>
        `<text x="919" y="${345 + idx * 56}" text-anchor="middle" font-family="Georgia, serif" font-size="39" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="-20" y="-20" width="1640" height="2680" preserveAspectRatio="xMidYMid slice"/>`
    : buildStorySceneArtwork({
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
    : buildStorySceneArtwork({
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
    : buildStorySceneArtwork({
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
      <stop offset="0%" stop-color="#070b12" stop-opacity="0.62"/>
      <stop offset="48%" stop-color="#070b12" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#eb-clip)">
    ${ebookArtLayer}
    <rect x="0" y="0" width="1600" height="2560" fill="url(#eb-scrim)"/>
    <rect x="68" y="68" width="1464" height="2424" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="3" opacity="0.82"/>
    <text x="800" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${ebookTitleSvg}
    <text x="800" y="2335" text-anchor="middle" font-family="Georgia, serif" font-size="76" letter-spacing="5" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
  </g>
</svg>`;

  const wrapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3862" height="2775" viewBox="0 0 3862 2775">
  <defs>
    <clipPath id="clip-back"><rect x="0" y="0" width="1838" height="2775"/></clipPath>
    <clipPath id="clip-spine"><rect x="1838" y="0" width="186" height="2775"/></clipPath>
    <clipPath id="clip-front"><rect x="2024" y="0" width="1838" height="2775"/></clipPath>
    <linearGradient id="back-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070b12" stop-opacity="0.42"/>
      <stop offset="50%" stop-color="#070b12" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.58"/>
    </linearGradient>
    <linearGradient id="front-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070b12" stop-opacity="0.62"/>
      <stop offset="48%" stop-color="#070b12" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.72"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#clip-back)">
    ${wrapBackArtLayer}
    <rect x="0" y="0" width="1838" height="2775" fill="url(#back-scrim)"/>
    <rect x="235" y="245" width="1368" height="765" fill="#090d14" fill-opacity="0.74" stroke="${escapeHtml(plan.accentColor)}" stroke-opacity="0.78" stroke-width="2.5"/>
    ${blurbSvg}
    <text x="919" y="935" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="36" fill="#e2e8f0">${escapeHtml(plan.tagline)}</text>
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
    <text x="2943" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
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
  <div class="meta">Brain: ${escapeHtml(result.brainProvider)} | Motif: ${escapeHtml(result.focalMotif)} | Front AI: ${result.frontGenerated ? 'Yes' : 'Scene Art'} | Back AI: ${result.backGenerated ? 'Yes' : 'Scene Art'}</div>
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
