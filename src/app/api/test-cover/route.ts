import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface CoverDesignSpec {
  frontArtPrompt: string;
  backArtPrompt: string;
  accentHex: string;
  darkBgHex: string;
  tagline: string;
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

async function callGeminiCoverDesigner(
  prompt: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  if (!apiKey) return null;
  const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
        return JSON.parse(match[0]) as Record<string, unknown>;
      }
    } catch {
      // lanjut model berikutnya
    }
  }
  return null;
}

async function designCoverWithAi(params: {
  title: string;
  genre: string;
  synopsis: string;
}): Promise<CoverDesignSpec> {
  const cleanSynopsis = String(params.synopsis || '').replace(/\s+/g, ' ').trim();
  const noTextRule =
    'No text, no letters, no words, no watermarks, no logos, no borders.';

  const fallback: CoverDesignSpec = {
    frontArtPrompt: `Fantasy mystery book cover art for "${params.title}" (${params.genre}), ancient stone archway with glowing golden ember magic swirls and a lone archivist silhouette in lower foreground, dramatic cinematic lighting, clean dark upper space for title. ${noTextRule}`,
    backArtPrompt: `Grand ancient circular library archive hall with multi-level wooden bookshelves, warm golden lantern light and floating glowing embers, moody cinematic atmosphere, fantasy book back cover art. ${noTextRule}`,
    accentHex: '#e5c17b',
    darkBgHex: '#0b0f17',
    tagline: '“Secrets forged in ember can reshape an entire world.”'
  };

  const geminiKey = getEnv('GEMINI_API_KEY') || getEnv('GEMINI_API_KEY_BACKUP');
  if (!geminiKey) return fallback;

  const directorPrompt = [
    'You are a senior Amazon KDP Book Cover Art Director.',
    `Title: ${params.title}`,
    `Genre: ${params.genre}`,
    `Synopsis: ${cleanSynopsis.slice(0, 350)}`,
    'Write two specific illustration prompts tailored to this title and synopsis:',
    '1. frontArtPrompt: vivid focal artwork for the front cover with clean breathing room for title at top and author at bottom.',
    '2. backArtPrompt: rich interior/environment scene for the back cover (such as an ancient library, archive, or atmospheric setting matching the story world, different camera angle from front).',
    '3. tagline: a short evocative 1-sentence hook/quote fitting the story.',
    'Both art prompts MUST explicitly forbid any text, letters, logos, or watermarks.',
    'Return ONLY valid JSON: {"frontArtPrompt":"...","backArtPrompt":"...","tagline":"...","accentHex":"#e5c17b","darkBgHex":"#0b0f17"}'
  ].join('\n');

  const parsed = await callGeminiCoverDesigner(directorPrompt, geminiKey);
  if (!parsed?.frontArtPrompt || !parsed?.backArtPrompt) {
    return fallback;
  }

  return {
    frontArtPrompt: `${String(parsed.frontArtPrompt).trim()} ${noTextRule}`,
    backArtPrompt: `${String(parsed.backArtPrompt).trim()} ${noTextRule}`,
    accentHex: String(parsed.accentHex || fallback.accentHex).trim(),
    darkBgHex: String(parsed.darkBgHex || fallback.darkBgHex).trim(),
    tagline: String(parsed.tagline || fallback.tagline).trim()
  };
}

async function fetchSingleAttempt(
  promptText: string,
  width: number,
  height: number,
  seed: number
): Promise<string | null> {
  const customEndpoint = getEnv('COVER_IMAGE_API_URL');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 16000);

  try {
    if (customEndpoint) {
      const res = await fetch(customEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, width, height, seed }),
        signal: controller.signal,
        cache: 'no-store'
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || 'image/jpeg';
        if (ct.includes('image/')) {
          const buf = Buffer.from(await res.arrayBuffer());
          return `data:${ct};base64,${buf.toString('base64')}`;
        }
        const json = (await res.json().catch(() => null)) as {
          imageBase64?: string;
          url?: string;
        } | null;
        if (json?.imageBase64) return `data:image/png;base64,${json.imageBase64}`;
        if (json?.url) return json.url;
      }
    }

    const encodedPrompt = encodeURIComponent(promptText.slice(0, 360));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (!ct.includes('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchIllustrationWithRetry(
  promptText: string,
  width: number,
  height: number,
  seed: number
): Promise<string | null> {
  const first = await fetchSingleAttempt(promptText, width, height, seed);
  if (first) return first;
  return fetchSingleAttempt(promptText, width, height, seed + 313);
}

function buildBackLibraryFallbackGroup(accentHex: string): string {
  // Grup ilustrasi arsip perpustakaan bertingkat dengan cahaya lentera hangat (dapat dirender langsung di SVG)
  const bookSpinesLeft: string[] = [];
  const bookSpinesRight: string[] = [];
  for (let row = 0; row < 5; row++) {
    const yBase = 1120 + row * 210;
    for (let col = 0; col < 11; col++) {
      const h = 135 + ((row * 17 + col * 23) % 45);
      const opacity = (0.35 + ((row + col) % 4) * 0.14).toFixed(2);
      bookSpinesLeft.push(
        `<rect x="${160 + col * 38}" y="${yBase - h}" width="30" height="${h}" rx="3" fill="#3b2314" stroke="${accentHex}" stroke-opacity="0.22" stroke-width="1.5" opacity="${opacity}"/>`
      );
      bookSpinesRight.push(
        `<rect x="${1260 + col * 38}" y="${yBase - h}" width="30" height="${h}" rx="3" fill="#3b2314" stroke="${accentHex}" stroke-opacity="0.22" stroke-width="1.5" opacity="${opacity}"/>`
      );
    }
  }

  return `
    <g id="back-archive-scene">
      <rect x="0" y="0" width="1838" height="2775" fill="url(#back-hall-grad)"/>
      <!-- Lengkungan kubah arsip utama -->
      <path d="M 140 2775 L 140 1240 Q 919 640 1698 1240 L 1698 2775 Z" fill="#141118" stroke="${accentHex}" stroke-opacity="0.32" stroke-width="4"/>
      <path d="M 320 2775 L 320 1360 Q 919 880 1518 1360 L 1518 2775 Z" fill="#1b1518" stroke="${accentHex}" stroke-opacity="0.24" stroke-width="3"/>
      <!-- Cahaya hangat pusat ruang arsip -->
      <ellipse cx="919" cy="1660" rx="680" ry="640" fill="url(#back-ember-glow)"/>
      <!-- Balkon & pagar besi arsip lantai 2 -->
      <rect x="140" y="1380" width="1558" height="36" fill="#0d0f14" stroke="${accentHex}" stroke-opacity="0.4" stroke-width="2"/>
      <rect x="140" y="1820" width="1558" height="36" fill="#0d0f14" stroke="${accentHex}" stroke-opacity="0.4" stroke-width="2"/>
      <!-- Rak-rak buku bertingkat kiri & kanan -->
      ${bookSpinesLeft.join('\n')}
      ${bookSpinesRight.join('\n')}
      <!-- Meja baca & lentera cahaya di tengah -->
      <ellipse cx="919" cy="1860" rx="260" ry="38" fill="#0b0d12" stroke="${accentHex}" stroke-opacity="0.35" stroke-width="2"/>
      <circle cx="919" cy="1760" r="34" fill="#fde68a" opacity="0.85"/>
      <circle cx="919" cy="1760" r="130" fill="#f59e0b" opacity="0.24"/>
      <!-- Partikel bara beterbangan -->
      <circle cx="620" cy="1480" r="6" fill="#fbbf24" opacity="0.8"/>
      <circle cx="790" cy="1320" r="4" fill="#fde68a" opacity="0.85"/>
      <circle cx="1120" cy="1460" r="7" fill="#f59e0b" opacity="0.72"/>
      <circle cx="980" cy="1620" r="5" fill="#fbbf24" opacity="0.8"/>
      <circle cx="540" cy="1960" r="5" fill="#fde68a" opacity="0.65"/>
      <circle cx="1290" cy="1940" r="6" fill="#f59e0b" opacity="0.7"/>
    </g>
  `;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = (searchParams.get('title') || 'The Ember Archive').trim();
  const genre = (searchParams.get('genre') || 'FANTASY / MYSTERY').trim();
  const penName = (searchParams.get('author') || 'M. F. JULIAN').trim();
  const publisher = (searchParams.get('publisher') || 'CUANNOVEL KARYA').trim();
  const synopsis = (
    searchParams.get('synopsis') ||
    'In a world where knowledge is forbidden and secrets are forged from ember and shadow, a lone archivist uncovers a truth that could reshape the realm—or ignite a war.'
  ).trim();

  const design = await designCoverWithAi({ title, genre, synopsis });
  const seed = Math.floor(Date.now() % 1000000);

  // Ambil gambar depan dan belakang secara berurutan dengan retry otomatis
  const frontArt = await fetchIllustrationWithRetry(design.frontArtPrompt, 768, 1152, seed + 19);
  const backArt = await fetchIllustrationWithRetry(design.backArtPrompt, 768, 1152, seed + 89);

  const titleLines = wrapSvgLines(title, 15, 3);
  const blurbLines = wrapSvgLines(synopsis, 36, 6);

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
        `<text x="919" y="${395 + idx * 64}" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <clipPath id="eb-clip">
      <rect x="0" y="0" width="1600" height="2560"/>
    </clipPath>
    <linearGradient id="eb-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#080c14" stop-opacity="0.68"/>
      <stop offset="42%" stop-color="#080c14" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.74"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#eb-clip)">
    <rect x="0" y="0" width="1600" height="2560" fill="${design.darkBgHex}"/>
    ${
      frontArt
        ? `<image href="${escapeHtml(frontArt)}" x="-30" y="-20" width="1660" height="2700" preserveAspectRatio="xMidYMid slice"/>`
        : ''
    }
    <rect x="0" y="0" width="1600" height="2560" fill="url(#eb-scrim)"/>
    <rect x="68" y="68" width="1464" height="2424" fill="none" stroke="${design.accentHex}" stroke-width="3" opacity="0.78"/>
    <text x="800" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${ebookTitleSvg}
    <text x="800" y="2335" text-anchor="middle" font-family="Georgia, serif" font-size="76" letter-spacing="5" fill="#f8fafc">${escapeHtml(penName.toUpperCase())}</text>
  </g>
</svg>`;

  const wrapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3862" height="2775" viewBox="0 0 3862 2775">
  <defs>
    <clipPath id="clip-back">
      <rect x="0" y="0" width="1838" height="2775"/>
    </clipPath>
    <clipPath id="clip-spine">
      <rect x="1838" y="0" width="186" height="2775"/>
    </clipPath>
    <clipPath id="clip-front">
      <rect x="2024" y="0" width="1838" height="2775"/>
    </clipPath>
    <radialGradient id="back-ember-glow" cx="50%" cy="62%" r="55%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.48"/>
      <stop offset="55%" stop-color="#92400e" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#090d14" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="back-hall-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="55%" stop-color="#231918"/>
      <stop offset="100%" stop-color="#351908"/>
    </linearGradient>
    <linearGradient id="back-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#080c14" stop-opacity="0.42"/>
      <stop offset="50%" stop-color="#080c14" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.58"/>
    </linearGradient>
    <linearGradient id="front-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#080c14" stop-opacity="0.68"/>
      <stop offset="42%" stop-color="#080c14" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.74"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#clip-back)">
    <rect x="0" y="0" width="1838" height="2775" fill="${design.darkBgHex}"/>
    ${
      backArt
        ? `<image href="${escapeHtml(backArt)}" x="-30" y="-20" width="1898" height="2880" preserveAspectRatio="xMidYMid slice"/>`
        : buildBackLibraryFallbackGroup(design.accentHex)
    }
    <rect x="0" y="0" width="1838" height="2775" fill="url(#back-scrim)"/>

    <rect x="235" y="270" width="1368" height="710" fill="#090d14" fill-opacity="0.72" stroke="${design.accentHex}" stroke-opacity="0.75" stroke-width="2.5"/>
    ${blurbSvg}
    <text x="919" y="880" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="38" fill="#e2e8f0">${escapeHtml(design.tagline)}</text>

    <polygon points="340,2245 395,2213 450,2245 450,2309 395,2341 340,2309" fill="none" stroke="${design.accentHex}" stroke-width="5"/>
    <polygon points="362,2258 395,2239 428,2258 428,2296 395,2315 362,2296" fill="none" stroke="#f8fafc" stroke-width="2.5"/>
    <text x="395" y="2415" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="3" font-weight="bold" fill="#f8fafc">${escapeHtml(publisher.toUpperCase())}</text>

    <!-- Kotak kosong tempat barcode KDP (tanpa tulisan maupun garis barcode) -->
    <rect x="1150" y="2235" width="540" height="330" rx="8" fill="#ffffff"/>
  </g>

  <g clip-path="url(#clip-spine)">
    <rect x="1838" y="0" width="186" height="2775" fill="#12161f"/>
    <g transform="translate(1931, 1388) rotate(90)">
      <text x="-430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(title.toUpperCase())}</text>
      <circle cx="0" cy="0" r="14" fill="${design.accentHex}" opacity="0.85"/>
      <text x="430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(penName.toUpperCase())}</text>
    </g>
  </g>

  <g clip-path="url(#clip-front)">
    <rect x="2024" y="0" width="1838" height="2775" fill="${design.darkBgHex}"/>
    ${
      frontArt
        ? `<image href="${escapeHtml(frontArt)}" x="1994" y="-20" width="1898" height="2880" preserveAspectRatio="xMidYMid slice"/>`
        : ''
    }
    <rect x="2024" y="0" width="1838" height="2775" fill="url(#front-scrim)"/>
    <rect x="2125" y="135" width="1636" height="2505" fill="none" stroke="${design.accentHex}" stroke-width="3" opacity="0.78"/>
    <text x="2943" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
    ${wrapFrontTitleSvg}
    <text x="2943" y="2535" text-anchor="middle" font-family="Georgia, serif" font-size="82" letter-spacing="5" fill="#f8fafc">${escapeHtml(penName.toUpperCase())}</text>
  </g>
</svg>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Test Cover — ${escapeHtml(title)}</title>
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
  <h1>Preview Cover: ${escapeHtml(title)}</h1>
  <div class="meta">Front AI Art: ${frontArt ? 'Loaded' : 'Fallback'} | Back AI Art: ${backArt ? 'Loaded' : 'Archive Fallback'}</div>
  <div class="grid">
    <div class="card">
      <h2>E-Book Cover</h2>
      <div class="svg-box">${ebookSvg}</div>
    </div>
    <div class="card">
      <h2>Paperback Full-Wrap Cover</h2>
      <div class="svg-box">${wrapSvg}</div>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
