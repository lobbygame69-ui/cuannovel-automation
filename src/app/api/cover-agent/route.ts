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

interface CoverAgentOutput {
  ok: boolean;
  agent: 'cuannovel-cover-designer';
  title: string;
  author: string;
  publisher: string;
  tagline: string;
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

async function planVisualDirection(input: CoverAgentInput): Promise<{
  frontPrompt: string;
  backPrompt: string;
  tagline: string;
  accentHex: string;
  darkBgHex: string;
  secondaryHex: string;
}> {
  const cleanSynopsis = String(input.synopsis || '').replace(/\s+/g, ' ').trim();
  const genre = String(input.genre || 'FICTION').trim();
  const noTextRule =
    'Strictly NO text, NO letters, NO words, NO numbers, NO watermarks, NO logos, NO signatures, NO borders.';

  const fallback = {
    frontPrompt: `Rich commercial novel front cover art for "${input.title}" (${genre}). Depicts ${cleanSynopsis.slice(0, 220)}, dramatic lighting, strong central focal scene, clean dark upper space for title and lower space for author name. ${noTextRule}`,
    backPrompt: `Matching atmospheric novel back cover art for "${input.title}" (${genre}). Complementary scene from the same story world with different camera angle and glowing highlights. ${noTextRule}`,
    tagline: '“Every hidden truth leaves a mark that cannot be undone.”',
    accentHex: '#e5c17b',
    darkBgHex: '#0b0f17',
    secondaryHex: '#2dd4bf'
  };

  const keys = getGeminiKeys();
  const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];

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
                        'You are a dedicated Book Cover Designer Agent for cuannovel.',
                        'Design ONLY the visual art direction from the book title and description below.',
                        `Title: ${input.title}`,
                        `Genre: ${genre}`,
                        `Description: ${cleanSynopsis.slice(0, 400)}`,
                        'Return ONLY valid JSON:',
                        '{"frontPrompt":"...","backPrompt":"...","tagline":"...","accentHex":"#e5c17b","darkBgHex":"#0b0f17","secondaryHex":"#2dd4bf"}'
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
        if (match) {
          const parsed = JSON.parse(match[0]) as Record<string, unknown>;
          if (parsed.frontPrompt && parsed.backPrompt) {
            return {
              frontPrompt: `${String(parsed.frontPrompt).trim()} ${noTextRule}`,
              backPrompt: `${String(parsed.backPrompt).trim()} ${noTextRule}`,
              tagline: String(parsed.tagline || fallback.tagline).trim(),
              accentHex: String(parsed.accentHex || fallback.accentHex).trim(),
              darkBgHex: String(parsed.darkBgHex || fallback.darkBgHex).trim(),
              secondaryHex: String(parsed.secondaryHex || fallback.secondaryHex).trim()
            };
          }
        }
      } catch {
        // lanjut
      }
    }
  }

  return fallback;
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

function buildRichArtLayer(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  seedKey: string;
  accentHex: string;
  secondaryHex: string;
  darkBgHex: string;
  mode: 'front' | 'back';
}): string {
  const s = hashSeed(params.seedKey);
  const cx = params.x + Math.round(params.width * (params.mode === 'front' ? 0.5 : 0.48));
  const cy = params.y + Math.round(params.height * (params.mode === 'front' ? 0.58 : 0.64));
  const rMain = Math.round(Math.min(params.width, params.height) * 0.34);

  const rays: string[] = [];
  const countRays = 12;
  for (let i = 0; i < countRays; i++) {
    const angle = ((i * 360) / countRays + (s % 25)) * (Math.PI / 180);
    const x2 = cx + Math.round(Math.cos(angle) * rMain * 1.45);
    const y2 = cy + Math.round(Math.sin(angle) * rMain * 1.45);
    rays.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${i % 2 === 0 ? params.accentHex : params.secondaryHex}" stroke-width="3" opacity="0.22"/>`
    );
  }

  const orbs: string[] = [];
  for (let i = 0; i < 18; i++) {
    const ox = params.x + Math.round((((s + i * 977) % 1000) / 1000) * params.width);
    const oy = params.y + Math.round(params.height * 0.25 + (((s + i * 613) % 1000) / 1000) * params.height * 0.7);
    const radius = 5 + ((s + i * 29) % 18);
    const op = (0.28 + (((s + i * 41) % 55) / 100)).toFixed(2);
    const fill = i % 3 === 0 ? params.secondaryHex : params.accentHex;
    orbs.push(`<circle cx="${ox}" cy="${oy}" r="${radius}" fill="${fill}" opacity="${op}"/>`);
  }

  const horizonY = params.y + Math.round(params.height * 0.74);

  return `
    <rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" fill="${params.darkBgHex}"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(rMain * 1.35)}" fill="${params.accentHex}" opacity="0.14"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(rMain * 0.82)}" fill="${params.secondaryHex}" opacity="0.16"/>
    ${rays.join('\n')}
    <path d="M ${params.x} ${horizonY + 160} Q ${cx - Math.round(params.width * 0.22)} ${horizonY - 110} ${cx} ${horizonY + 40} T ${params.x + params.width} ${horizonY + 80} L ${params.x + params.width} ${params.y + params.height} L ${params.x} ${params.y + params.height} Z" fill="#0d1322" stroke="${params.accentHex}" stroke-opacity="0.35" stroke-width="3"/>
    <path d="M ${cx - Math.round(rMain * 0.55)} ${params.y + params.height} L ${cx - Math.round(rMain * 0.35)} ${cy - Math.round(rMain * 0.45)} Q ${cx} ${cy - Math.round(rMain * 0.9)} ${cx + Math.round(rMain * 0.35)} ${cy - Math.round(rMain * 0.45)} L ${cx + Math.round(rMain * 0.55)} ${params.y + params.height} Z" fill="#131b2e" stroke="${params.accentHex}" stroke-opacity="0.55" stroke-width="4"/>
    ${orbs.join('\n')}
  `;
}

async function runCoverDesignerAgent(input: CoverAgentInput): Promise<CoverAgentOutput> {
  const title = String(input.title || 'Untitled Novel').trim();
  const genre = String(input.genre || 'FICTION').trim();
  const synopsis = String(input.synopsis || '').trim();
  const author = String(input.author || 'M. F. Julian').trim();
  const publisher = String(input.publisher || 'cuannovelkarya').trim();

  const spec = await planVisualDirection({ title, genre, synopsis, author, publisher });
  const frontArt = await generateArtworkDataUri(spec.frontPrompt);
  const backArt = await generateArtworkDataUri(spec.backPrompt);

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
        `<text x="919" y="${350 + idx * 58}" text-anchor="middle" font-family="Georgia, serif" font-size="40" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="-20" y="-20" width="1640" height="2680" preserveAspectRatio="xMidYMid slice"/>`
    : buildRichArtLayer({
        x: 0,
        y: 0,
        width: 1600,
        height: 2560,
        seedKey: `${title}|${genre}|front|ebook`,
        accentHex: spec.accentHex,
        secondaryHex: spec.secondaryHex,
        darkBgHex: spec.darkBgHex,
        mode: 'front'
      });

  const wrapBackArtLayer = backArt
    ? `<image href="${escapeHtml(backArt)}" x="-20" y="-20" width="1878" height="2860" preserveAspectRatio="xMidYMid slice"/>`
    : buildRichArtLayer({
        x: 0,
        y: 0,
        width: 1838,
        height: 2775,
        seedKey: `${title}|${genre}|back|wrap`,
        accentHex: spec.accentHex,
        secondaryHex: spec.secondaryHex,
        darkBgHex: spec.darkBgHex,
        mode: 'back'
      });

  const wrapFrontArtLayer = frontArt
    ? `<image href="${escapeHtml(frontArt)}" x="2004" y="-20" width="1878" height="2860" preserveAspectRatio="xMidYMid slice"/>`
    : buildRichArtLayer({
        x: 2024,
        y: 0,
        width: 1838,
        height: 2775,
        seedKey: `${title}|${genre}|front|wrap`,
        accentHex: spec.accentHex,
        secondaryHex: spec.secondaryHex,
        darkBgHex: spec.darkBgHex,
        mode: 'front'
      });

  const ebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <clipPath id="eb-clip"><rect x="0" y="0" width="1600" height="2560"/></clipPath>
    <linearGradient id="eb-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#080c14" stop-opacity="0.62"/>
      <stop offset="45%" stop-color="#080c14" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#eb-clip)">
    ${ebookArtLayer}
    <rect x="0" y="0" width="1600" height="2560" fill="url(#eb-scrim)"/>
    <rect x="68" y="68" width="1464" height="2424" fill="none" stroke="${escapeHtml(spec.accentHex)}" stroke-width="3" opacity="0.78"/>
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
      <stop offset="0%" stop-color="#080c14" stop-opacity="0.46"/>
      <stop offset="50%" stop-color="#080c14" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.62"/>
    </linearGradient>
    <linearGradient id="front-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#080c14" stop-opacity="0.62"/>
      <stop offset="45%" stop-color="#080c14" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.72"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#clip-back)">
    ${wrapBackArtLayer}
    <rect x="0" y="0" width="1838" height="2775" fill="url(#back-scrim)"/>
    <rect x="235" y="250" width="1368" height="750" fill="#090d14" fill-opacity="0.72" stroke="${escapeHtml(spec.accentHex)}" stroke-opacity="0.75" stroke-width="2.5"/>
    ${blurbSvg}
    <text x="919" y="925" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="36" fill="#e2e8f0">${escapeHtml(spec.tagline)}</text>
    <polygon points="340,2245 395,2213 450,2245 450,2309 395,2341 340,2309" fill="none" stroke="${escapeHtml(spec.accentHex)}" stroke-width="5"/>
    <polygon points="362,2258 395,2239 428,2258 428,2296 395,2315 362,2296" fill="none" stroke="#f8fafc" stroke-width="2.5"/>
    <text x="395" y="2415" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="3" font-weight="bold" fill="#f8fafc">${escapeHtml(publisher)}</text>
    <rect x="1150" y="2235" width="540" height="330" rx="8" fill="#ffffff"/>
  </g>

  <g clip-path="url(#clip-spine)">
    <rect x="1838" y="0" width="186" height="2775" fill="#12161f"/>
    <g transform="translate(1931, 1388) rotate(90)">
      <text x="-430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(title.toUpperCase())}</text>
      <circle cx="0" cy="0" r="14" fill="${escapeHtml(spec.accentHex)}" opacity="0.85"/>
      <text x="430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
    </g>
  </g>

  <g clip-path="url(#clip-front)">
    ${wrapFrontArtLayer}
    <rect x="2024" y="0" width="1838" height="2775" fill="url(#front-scrim)"/>
    <rect x="2125" y="135" width="1636" height="2505" fill="none" stroke="${escapeHtml(spec.accentHex)}" stroke-width="3" opacity="0.78"/>
    <text x="2943" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${wrapFrontTitleSvg}
    <text x="2943" y="2535" text-anchor="middle" font-family="Georgia, serif" font-size="82" letter-spacing="5" fill="#f8fafc">${escapeHtml(author.toUpperCase())}</text>
  </g>
</svg>`;

  return {
    ok: true,
    agent: 'cuannovel-cover-designer',
    title,
    author,
    publisher,
    tagline: spec.tagline,
    frontPrompt: spec.frontPrompt,
    backPrompt: spec.backPrompt,
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
  <div class="meta">Front AI Image: ${result.frontGenerated ? 'AI Generated' : 'Layered Art'} | Back AI Image: ${result.backGenerated ? 'AI Generated' : 'Layered Art'}</div>
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
