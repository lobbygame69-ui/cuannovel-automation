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

function splitSynopsisIntoBlocks(synopsis: string): {
  hookLines: string[];
  bodyLines: string[];
  closingLines: string[];
} {
  const clean = String(synopsis || '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map((s) => s.trim()).filter(Boolean) || [clean];

  const hookText = sentences[0] || clean;
  const closingText = sentences.length >= 3 ? sentences[sentences.length - 1] : '';
  const bodyText =
    sentences.length >= 3
      ? sentences.slice(1, -1).join(' ')
      : sentences.length === 2
        ? sentences[1]
        : '';

  return {
    hookLines: wrapSvgLines(hookText, 38, 3),
    bodyLines: wrapSvgLines(bodyText, 40, 5),
    closingLines: wrapSvgLines(closingText, 38, 3)
  };
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
  if (/glass|orchard|crystal|prism|translucent|citadel|kaca|kristal/.test(combined)) {
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
  if (/magic|fantasy|archive|ancient|ruin|sihir|fantasi|rahasia/.test(combined)) {
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
    'You are the Book Cover Art Director (Qwen AI) for CuanNovel.',
    'Design a rich fantasy/editorial novel cover visual concept matching the novel title, genre, and synopsis.',
    'Use deep midnight sapphire/navy tones, warm golden highlights, glowing orbs/light rays, and layered landscape/architectural depth.',
    'Never place text or letters inside the artwork prompts.',
    `Title: ${input.title}`,
    `Genre: ${input.genre}`,
    `Author: ${input.author}`,
    `Synopsis: ${input.synopsis.slice(0, 500)}`,
    'Return ONLY valid JSON with exact keys:',
    '{"frontPrompt":"detailed front cover scene prompt","backPrompt":"complementary back cover scene prompt","tagline":"evocative short quote","focalMotif":"3-6 word main visual motif","sceneTheme":"glass_orchard|celestial|botanical|urban_noir|romantic_horizon|mystic_arch","primaryColor":"#071224","secondaryColor":"#12325b","accentColor":"#f3c969","glowColor":"#67e8f9"}'
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
            parsed.tagline || '“An enchanting journey of memory, wonder, and fragile beauty.”'
          ).trim(),
          focalMotif: String(parsed.focalMotif || 'Luminous Citadel & Golden Tree').trim(),
          sceneTheme: normalizeTheme(parsed.sceneTheme, input.title, input.genre, input.synopsis),
          primaryColor: normalizeHex(parsed.primaryColor, '#071224'),
          secondaryColor: normalizeHex(parsed.secondaryColor, '#12325b'),
          accentColor: normalizeHex(parsed.accentColor, '#f3c969'),
          glowColor: normalizeHex(parsed.glowColor, '#67e8f9'),
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
                        'Design a rich fantasy/editorial front and back cover art concept from the novel description.',
                        `Title: ${input.title}`,
                        `Genre: ${input.genre}`,
                        `Author: ${input.author}`,
                        `Synopsis: ${input.synopsis.slice(0, 450)}`,
                        'Return ONLY valid JSON:',
                        '{"frontPrompt":"...","backPrompt":"...","tagline":"...","focalMotif":"...","sceneTheme":"glass_orchard|celestial|botanical|urban_noir|romantic_horizon|mystic_arch","primaryColor":"#071224","secondaryColor":"#12325b","accentColor":"#f3c969","glowColor":"#67e8f9"}'
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
              parsed.tagline || '“An enchanting journey of memory, wonder, and fragile beauty.”'
            ).trim(),
            focalMotif: String(parsed.focalMotif || 'Luminous Citadel & Golden Tree').trim(),
            sceneTheme: normalizeTheme(parsed.sceneTheme, input.title, input.genre, input.synopsis),
            primaryColor: normalizeHex(parsed.primaryColor, '#071224'),
            secondaryColor: normalizeHex(parsed.secondaryColor, '#12325b'),
            accentColor: normalizeHex(parsed.accentColor, '#f3c969'),
            glowColor: normalizeHex(parsed.glowColor, '#67e8f9'),
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
    frontPrompt: `Luminous fantasy novel front cover art for "${input.title}" (${input.genre}) based on ${cleanSynopsis.slice(0, 220)}. Deep starry midnight sky, golden light rays, glowing crystal orb and tree over misty peaks. ${noTextRule}`,
    backPrompt: `Complementary fantasy back cover art for "${input.title}" (${input.genre}) showing a distant glowing citadel, floating light orbs, and tranquil night landscape. ${noTextRule}`,
    tagline: '“An enchanting journey of memory, wonder, and fragile beauty.”',
    focalMotif: 'Golden Tree in Crystal Sphere',
    sceneTheme: normalizeTheme(null, input.title, input.genre, input.synopsis),
    primaryColor: '#071224',
    secondaryColor: '#12325b',
    accentColor: '#f3c969',
    glowColor: '#67e8f9',
    source: 'built-in-art-director'
  };
}

async function generateArtworkDataUri(promptText: string): Promise<string | null> {
  const keys = getGeminiKeys();
  const imageModels = ['gemini-2.5-flash-image', 'gemini-2.0-flash-exp-image-generation'];

  for (const key of keys) {
    for (const model of imageModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
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

function buildReferenceArtScene(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  seedKey: string;
  plan: CoverArtPlan;
  role: 'front' | 'back';
}): string {
  const s = hashSeed(params.seedKey);
  const accent = escapeHtml(params.plan.accentColor);
  const glow = escapeHtml(params.plan.glowColor);
  const primary = escapeHtml(params.plan.primaryColor);
  const secondary = escapeHtml(params.plan.secondaryColor);
  const w = params.width;
  const h = params.height;
  const x0 = params.x;
  const y0 = params.y;

  const parts: string[] = [];

  // Langit malam & cahaya nebula/bulan
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${primary}"/>`,
    `<circle cx="${x0 + Math.round(w * 0.52)}" cy="${y0 + Math.round(h * 0.44)}" r="${Math.round(w * 0.55)}" fill="${secondary}" opacity="0.72"/>`,
    `<circle cx="${x0 + Math.round(w * 0.76)}" cy="${y0 + Math.round(h * 0.34)}" r="${Math.round(w * 0.19)}" fill="${glow}" opacity="0.22"/>`,
    `<circle cx="${x0 + Math.round(w * 0.76)}" cy="${y0 + Math.round(h * 0.34)}" r="${Math.round(w * 0.13)}" fill="#dbeafe" opacity="0.18"/>`
  );

  // Bintang-bintang halus di langit
  for (let i = 0; i < 65; i++) {
    const sx = x0 + Math.round((((s + i * 941) % 1000) / 1000) * w);
    const sy = y0 + Math.round((((s + i * 577) % 1000) / 1000) * h * 0.75);
    const sr = 1.8 + ((s + i * 13) % 5);
    const op = (0.25 + (((s + i * 31) % 65) / 100)).toFixed(2);
    parts.push(`<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${i % 4 === 0 ? accent : '#f8fafc'}" opacity="${op}"/>`);
  }

  // Berkas cahaya sorot ke arah pusat ilustrasi
  const focalX = x0 + Math.round(w * (params.role === 'front' ? 0.52 : 0.5));
  const focalY = y0 + Math.round(h * (params.role === 'front' ? 0.62 : 0.36));

  for (let i = 0; i < 16; i++) {
    const angle = ((i * 22.5 + (s % 18)) * Math.PI) / 180;
    const len = Math.round(w * (0.42 + (((s + i * 53) % 35) / 100)));
    const x2 = focalX + Math.round(Math.cos(angle) * len);
    const y2 = focalY + Math.round(Math.sin(angle) * len);
    parts.push(
      `<line x1="${focalX}" y1="${focalY}" x2="${x2}" y2="${y2}" stroke="${i % 2 === 0 ? accent : glow}" stroke-width="${i % 3 === 0 ? 3 : 1.5}" opacity="${i % 2 === 0 ? '0.18' : '0.12'}"/>`
    );
  }

  if (params.role === 'front') {
    // Bola kristal & pohon bercahaya emas di tengah cover depan
    const orbX = x0 + Math.round(w * 0.52);
    const orbY = y0 + Math.round(h * 0.62);
    const orbR = Math.round(w * 0.25);

    parts.push(
      `<circle cx="${orbX}" cy="${orbY}" r="${orbR + 36}" fill="${accent}" opacity="0.14"/>`,
      `<circle cx="${orbX}" cy="${orbY}" r="${orbR}" fill="#0c2444" fill-opacity="0.72" stroke="${glow}" stroke-width="4"/>`,
      `<circle cx="${orbX}" cy="${orbY}" r="${orbR - 10}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.65"/>`,
      // Pohon bercahaya di dalam bola
      `<path d="M ${orbX} ${orbY + orbR - 28} L ${orbX} ${orbY - 40}" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>`,
      `<path d="M ${orbX} ${orbY + 10} Q ${orbX - 85} ${orbY - 45} ${orbX - 125} ${orbY - 105}" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>`,
      `<path d="M ${orbX} ${orbY - 5} Q ${orbX + 85} ${orbY - 60} ${orbX + 128} ${orbY - 115}" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>`,
      `<path d="M ${orbX} ${orbY - 25} Q ${orbX - 55} ${orbY - 115} ${orbX - 75} ${orbY - 165}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`,
      `<path d="M ${orbX} ${orbY - 25} Q ${orbX + 55} ${orbY - 120} ${orbX + 78} ${orbY - 168}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`,
      `<circle cx="${orbX}" cy="${orbY - 95}" r="${Math.round(orbR * 0.56)}" fill="${accent}" opacity="0.25"/>`,
      `<circle cx="${orbX - 75}" cy="${orbY - 145}" r="36" fill="${accent}" opacity="0.45"/>`,
      `<circle cx="${orbX + 78}" cy="${orbY - 148}" r="42" fill="${accent}" opacity="0.48"/>`,
      `<circle cx="${orbX}" cy="${orbY - 175}" r="46" fill="${accent}" opacity="0.52"/>`,
      `<circle cx="${orbX - 125}" cy="${orbY - 92}" r="30" fill="${glow}" opacity="0.38"/>`,
      `<circle cx="${orbX + 128}" cy="${orbY - 102}" r="34" fill="${accent}" opacity="0.45"/>`,
      // Cincin cahaya melingkar & kilau kaca
      `<ellipse cx="${orbX}" cy="${orbY + 18}" rx="${orbR + 68}" ry="${Math.round(orbR * 0.24)}" transform="rotate(-14 ${orbX} ${orbY + 18})" fill="none" stroke="${accent}" stroke-width="4" opacity="0.65"/>`,
      `<ellipse cx="${orbX - orbR * 0.35}" cy="${orbY - orbR * 0.35}" rx="${Math.round(orbR * 0.16)}" ry="${Math.round(orbR * 0.28)}" transform="rotate(-32 ${orbX - orbR * 0.35} ${orbY - orbR * 0.35})" fill="#ffffff" opacity="0.28"/>`
    );

    // Bola-bola kecil mengambang di sekitar
    const miniOrbs = [
      { dx: -0.29, dy: 0.45, r: 28 },
      { dx: -0.23, dy: 0.56, r: 18 },
      { dx: 0.78, dy: 0.48, r: 24 },
      { dx: 0.84, dy: 0.62, r: 16 }
    ];
    for (const m of miniOrbs) {
      const mx = x0 + Math.round(w * m.dx);
      const my = y0 + Math.round(h * m.dy);
      parts.push(
        `<circle cx="${mx}" cy="${my}" r="${m.r}" fill="#0f294a" fill-opacity="0.75" stroke="${glow}" stroke-width="2.5"/>`,
        `<circle cx="${mx - m.r * 0.28}" cy="${my - m.r * 0.28}" r="${Math.max(4, Math.round(m.r * 0.25))}" fill="#ffffff" opacity="0.35"/>`
      );
    }
  } else {
    // Kastil/menara bercahaya di atas tebing & ranting bercahaya di sudut kiri cover belakang
    const citX = x0 + Math.round(w * 0.54);
    const citY = y0 + Math.round(h * 0.22);

    parts.push(
      `<circle cx="${citX}" cy="${citY + 45}" r="240" fill="${accent}" opacity="0.18"/>`,
      // Menara & puncak kastil
      `<polygon points="${citX - 130},${citY + 110} ${citX - 130},${citY + 25} ${citX - 105},${citY - 25} ${citX - 80},${citY + 25} ${citX - 80},${citY + 110}" fill="#17345e" stroke="${accent}" stroke-width="2"/>`,
      `<polygon points="${citX - 55},${citY + 110} ${citX - 55},${citY - 15} ${citX},${citY - 115} ${citX + 55},${citY - 15} ${citX + 55},${citY + 110}" fill="#1f4375" stroke="${accent}" stroke-width="2.5"/>`,
      `<polygon points="${citX + 75},${citY + 110} ${citX + 75},${citY + 15} ${citX + 102},${citY - 35} ${citX + 128},${citY + 15} ${citX + 128},${citY + 110}" fill="#17345e" stroke="${accent}" stroke-width="2"/>`,
      // Air terjun cahaya turun dari tebing
      `<path d="M ${citX - 25} ${citY + 110} L ${citX - 45} ${citY + 260} M ${citX + 12} ${citY + 110} L ${citX + 28} ${citY + 275}" stroke="${glow}" stroke-width="6" opacity="0.38"/>`,
      // Ranting & daun/bola cahaya di sudut kiri atas & bawah
      `<path d="M ${x0 - 20} ${y0 + 180} Q ${x0 + 210} ${y0 + 250} ${x0 + 340} ${y0 + 430}" fill="none" stroke="#1e293b" stroke-width="14"/>`,
      `<path d="M ${x0 - 20} ${y0 + 180} Q ${x0 + 210} ${y0 + 250} ${x0 + 340} ${y0 + 430}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.7"/>`,
      `<circle cx="${x0 + 190}" cy="${y0 + 275}" r="54" fill="${accent}" opacity="0.22"/>`,
      `<circle cx="${x0 + 190}" cy="${y0 + 275}" r="36" fill="#0f294a" stroke="${glow}" stroke-width="3"/>`,
      `<path d="M ${x0 - 20} ${y0 + h - 420} Q ${x0 + 190} ${y0 + h - 540} ${x0 + 310} ${y0 + h - 760}" fill="none" stroke="#1e293b" stroke-width="12"/>`,
      `<circle cx="${x0 + 185}" cy="${y0 + h - 560}" r="42" fill="#0f294a" stroke="${accent}" stroke-width="2.5"/>`
    );
  }

  // Pegunungan & perairan bercahaya di bagian bawah
  const baseY = y0 + h;
  const ridge1 = y0 + Math.round(h * 0.74);
  const ridge2 = y0 + Math.round(h * 0.82);

  parts.push(
    `<path d="M ${x0} ${ridge1} L ${x0 + Math.round(w * 0.22)} ${ridge1 - 95} L ${x0 + Math.round(w * 0.45)} ${ridge1 - 25} L ${x0 + Math.round(w * 0.72)} ${ridge1 - 110} L ${x0 + w} ${ridge1 - 35} L ${x0 + w} ${baseY} L ${x0} ${baseY} Z" fill="#0c203b" opacity="0.92"/>`,
    `<path d="M ${x0} ${ridge2} C ${x0 + Math.round(w * 0.3)} ${ridge2 - 45}, ${x0 + Math.round(w * 0.65)} ${ridge2 + 35}, ${x0 + w} ${ridge2 - 20} L ${x0 + w} ${baseY} L ${x0} ${baseY} Z" fill="#060e1c" opacity="0.96"/>`,
    // Pantulan cahaya di air/lembah bawah
    `<ellipse cx="${x0 + Math.round(w * 0.54)}" cy="${y0 + Math.round(h * 0.88)}" rx="${Math.round(w * 0.24)}" ry="26" fill="${accent}" opacity="0.22"/>`,
    `<ellipse cx="${x0 + Math.round(w * 0.54)}" cy="${y0 + Math.round(h * 0.91)}" rx="${Math.round(w * 0.14)}" ry="14" fill="${glow}" opacity="0.25"/>`
  );

  return parts.join('\n');
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

  const titleLines = wrapSvgLines(title, 13, 2);
  const blocks = splitSynopsisIntoBlocks(synopsis);

  const ebookTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="800" y="${435 + idx * 165}" text-anchor="middle" font-family="Georgia, serif" font-size="154" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const wrapFrontTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="2943" y="${455 + idx * 170}" text-anchor="middle" font-family="Georgia, serif" font-size="158" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const hookSvg = blocks.hookLines
    .map(
      (line, idx) =>
        `<text x="919" y="${965 + idx * 54}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="40" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const bodyStartY = 965 + Math.max(1, blocks.hookLines.length) * 54 + 42;
  const bodySvg = blocks.bodyLines
    .map(
      (line, idx) =>
        `<text x="919" y="${bodyStartY + idx * 48}" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#f1f5f9">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const closingStartY = bodyStartY + Math.max(1, blocks.bodyLines.length) * 48 + 38;
  const closingSvg = blocks.closingLines
    .map(
      (line, idx) =>
        `<text x="919" y="${closingStartY + idx * 48}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="36" fill="#fde68a">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="-20" y="-20" width="1640" height="2680" preserveAspectRatio="xMidYMid slice"/>`
    : buildReferenceArtScene({
        x: 0,
        y: 0,
        width: 1600,
        height: 2560,
        seedKey: `${title}|${genre}|front|ebook`,
        plan,
        role: 'front'
      });

  const wrapBackArtLayer = backArt
    ? `<image href="${escapeHtml(backArt)}" x="-20" y="-20" width="1878" height="2860" preserveAspectRatio="xMidYMid slice"/>`
    : buildReferenceArtScene({
        x: 0,
        y: 0,
        width: 1838,
        height: 2775,
        seedKey: `${title}|${genre}|back|wrap`,
        plan,
        role: 'back'
      });

  const wrapFrontArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="2004" y="-20" width="1878" height="2860" preserveAspectRatio="xMidYMid slice"/>`
    : buildReferenceArtScene({
        x: 2024,
        y: 0,
        width: 1838,
        height: 2775,
        seedKey: `${title}|${genre}|front|wrap`,
        plan,
        role: 'front'
      });

  const ebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <clipPath id="eb-clip"><rect x="0" y="0" width="1600" height="2560"/></clipPath>
    <linearGradient id="eb-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050b16" stop-opacity="0.62"/>
      <stop offset="45%" stop-color="#050b16" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#050b16" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#eb-clip)">
    ${ebookArtLayer}
    <rect x="0" y="0" width="1600" height="2560" fill="url(#eb-scrim)"/>
    <rect x="64" y="64" width="1472" height="2432" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="3" opacity="0.8"/>
    <text x="800" y="215" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${ebookTitleSvg}
    <text x="800" y="2365" text-anchor="middle" font-family="Georgia, serif" font-size="82" letter-spacing="6" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
  </g>
</svg>`;

  const wrapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3862" height="2775" viewBox="0 0 3862 2775">
  <defs>
    <clipPath id="clip-back"><rect x="0" y="0" width="1838" height="2775"/></clipPath>
    <clipPath id="clip-spine"><rect x="1838" y="0" width="186" height="2775"/></clipPath>
    <clipPath id="clip-front"><rect x="2024" y="0" width="1838" height="2775"/></clipPath>
    <linearGradient id="back-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050b16" stop-opacity="0.28"/>
      <stop offset="50%" stop-color="#050b16" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="#050b16" stop-opacity="0.68"/>
    </linearGradient>
    <linearGradient id="front-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050b16" stop-opacity="0.62"/>
      <stop offset="45%" stop-color="#050b16" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#050b16" stop-opacity="0.72"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#clip-back)">
    ${wrapBackArtLayer}
    <rect x="0" y="0" width="1838" height="2775" fill="url(#back-scrim)"/>
    <line x1="680" y1="885" x2="1158" y2="885" stroke="${escapeHtml(plan.accentColor)}" stroke-width="2" opacity="0.7"/>
    ${hookSvg}
    ${bodySvg}
    ${closingSvg}
    <text x="919" y="${closingStartY + 165}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="34" fill="#e2e8f0">${escapeHtml(plan.tagline)}</text>

    <polygon points="275,2275 320,2248 365,2275 365,2328 320,2355 275,2328" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="4"/>
    <text x="320" y="2415" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="bold" letter-spacing="2" fill="#f8fafc">${escapeHtml(publisher)}</text>

    <!-- Area barcode kosong putih bersih sesuai permintaan -->
    <rect x="1135" y="2225" width="565" height="340" rx="6" fill="#ffffff"/>
  </g>

  <g clip-path="url(#clip-spine)">
    <rect x="1838" y="0" width="186" height="2775" fill="#091529"/>
    <g transform="translate(1931, 1388) rotate(90)">
      <text x="-430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="40" letter-spacing="4" fill="#f8fafc">${escapeHtml(title)}</text>
      <polygon points="0,-12 10,0 0,12 -10,0" fill="${escapeHtml(plan.accentColor)}"/>
      <text x="430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="40" letter-spacing="4" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
    </g>
  </g>

  <g clip-path="url(#clip-front)">
    ${wrapFrontArtLayer}
    <rect x="2024" y="0" width="1838" height="2775" fill="url(#front-scrim)"/>
    <rect x="2120" y="130" width="1646" height="2515" fill="none" stroke="${escapeHtml(plan.accentColor)}" stroke-width="3" opacity="0.8"/>
    <text x="2943" y="275" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${wrapFrontTitleSvg}
    <text x="2943" y="2555" text-anchor="middle" font-family="Georgia, serif" font-size="88" letter-spacing="6" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
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
  const title = (searchParams.get('title') || 'The Glass Orchard').trim();
  const genre = (searchParams.get('genre') || 'SPECULATIVE FICTION').trim();
  const author = (searchParams.get('author') || 'M. F. Julian').trim();
  const publisher = (searchParams.get('publisher') || 'cuannovelkarya').trim();
  const synopsis = (
    searchParams.get('synopsis') ||
    'In the floating citadel of Virelia, emotions grow as translucent fruit on glass trees. In a world where feelings can be cultivated, a young woman discovers a forbidden orchard whose glass trees hold the memories of a lost past and the hopes of a future yet unwritten. An enchanting journey of love, memory, and the fragile beauty of what we feel.'
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
  <div class="meta">Brain: ${escapeHtml(result.brainProvider)} | Motif: ${escapeHtml(result.focalMotif)} | Front AI: ${result.frontGenerated ? 'Yes' : 'Layered Art'} | Back AI: ${result.backGenerated ? 'Yes' : 'Layered Art'}</div>
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
