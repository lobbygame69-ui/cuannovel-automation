import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface CoverArtPlan {
  frontPrompt: string;
  backPrompt: string;
  accentHex: string;
  panelBgHex: string;
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

async function fetchIllustrationDataUri(
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

    const encodedPrompt = encodeURIComponent(promptText.slice(0, 440));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (!ct.includes('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1500) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildBarcodeBars(xStart: number, yStart: number, height: number): string {
  const pattern = [
    2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 2, 1, 3, 1, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 1,
    3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 1
  ];
  let cursor = xStart;
  const rects: string[] = [];
  pattern.forEach((w, idx) => {
    const pxW = w * 8;
    if (idx % 2 === 0) {
      rects.push(`<rect x="${cursor}" y="${yStart}" width="${pxW}" height="${height}" fill="#111827"/>`);
    }
    cursor += pxW + 2;
  });
  return rects.join('\n');
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

  const strictCleanRule =
    'Strictly NO text, NO letters, NO numbers, NO watermarks, NO logos, NO AI generator names, NO signatures, NO borders.';

  const plan: CoverArtPlan = {
    frontPrompt: `Epic fantasy mystery book cover art for "${title}", ancient stone archway and ruins with glowing golden ember light swirls and a small lone silhouette in the lower foreground, dark atmospheric sky, clean upper space for title and lower space for author name. ${strictCleanRule}`,
    backPrompt: `Atmospheric fantasy book back cover scene for "${title}", grand ancient library hall with tall wooden bookshelves, warm glowing ember particles and soft moody lighting, clean mid-upper space for blurb text. ${strictCleanRule}`,
    accentHex: '#e5c17b',
    panelBgHex: '#0c1118'
  };

  const seed = Math.floor(Date.now() % 1000000);
  const [frontArt, backArt] = await Promise.all([
    fetchIllustrationDataUri(plan.frontPrompt, 768, 1152, seed + 17),
    fetchIllustrationDataUri(plan.backPrompt, 768, 1152, seed + 83)
  ]);

  const titleLines = wrapSvgLines(title, 15, 3);
  const blurbLines = wrapSvgLines(synopsis, 36, 6);

  const ebookTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="800" y="${540 + idx * 145}" text-anchor="middle" font-family="Georgia, serif" font-size="132" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const wrapFrontTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="2943" y="${560 + idx * 150}" text-anchor="middle" font-family="Georgia, serif" font-size="136" font-weight="bold" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const blurbSvg = blurbLines
    .map(
      (line, idx) =>
        `<text x="919" y="${410 + idx * 66}" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <linearGradient id="eb-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0e16" stop-opacity="0.72"/>
      <stop offset="45%" stop-color="#0a0e16" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#080b12" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1600" height="2560" fill="${plan.panelBgHex}"/>
  ${
    frontArt
      ? `<image href="${escapeHtml(frontArt)}" x="-40" y="-20" width="1680" height="2720" preserveAspectRatio="xMidYMin slice"/>`
      : ''
  }
  <rect x="0" y="0" width="1600" height="2560" fill="url(#eb-grad)"/>
  <rect x="68" y="68" width="1464" height="2424" fill="none" stroke="${plan.accentHex}" stroke-width="3" opacity="0.75"/>
  <text x="800" y="255" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
  ${ebookTitleSvg}
  <text x="800" y="2335" text-anchor="middle" font-family="Georgia, serif" font-size="76" letter-spacing="5" fill="#f8fafc">${escapeHtml(penName.toUpperCase())}</text>
</svg>`;

  const wrapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3862" height="2775" viewBox="0 0 3862 2775">
  <defs>
    <linearGradient id="back-fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#090d14" stop-opacity="0.65"/>
      <stop offset="50%" stop-color="#090d14" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="front-fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#090d14" stop-opacity="0.72"/>
      <stop offset="45%" stop-color="#090d14" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.82"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1838" height="2775" fill="${plan.panelBgHex}"/>
  ${
    backArt
      ? `<image href="${escapeHtml(backArt)}" x="-40" y="-20" width="1910" height="2890" preserveAspectRatio="xMidYMin slice"/>`
      : ''
  }
  <rect x="0" y="0" width="1838" height="2775" fill="url(#back-fade)"/>

  <rect x="2024" y="0" width="1838" height="2775" fill="${plan.panelBgHex}"/>
  ${
    frontArt
      ? `<image href="${escapeHtml(frontArt)}" x="1986" y="-20" width="1910" height="2890" preserveAspectRatio="xMidYMin slice"/>`
      : ''
  }
  <rect x="2024" y="0" width="1838" height="2775" fill="url(#front-fade)"/>

  <rect x="1838" y="0" width="186" height="2775" fill="#12161f"/>
  <g transform="translate(1931, 1388) rotate(90)">
    <text x="-430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(title.toUpperCase())}</text>
    <circle cx="0" cy="0" r="14" fill="${plan.accentHex}" opacity="0.85"/>
    <text x="430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="4" fill="#f8fafc">${escapeHtml(penName.toUpperCase())}</text>
  </g>

  <rect x="235" y="275" width="1368" height="720" fill="#090d14" fill-opacity="0.62" stroke="${plan.accentHex}" stroke-opacity="0.6" stroke-width="2.5"/>
  ${blurbSvg}
  <text x="919" y="885" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="40" fill="#e2e8f0">“A captivating blend of mystery and magic.” —The Chronicle</text>

  <polygon points="340,2245 395,2213 450,2245 450,2309 395,2341 340,2309" fill="none" stroke="${plan.accentHex}" stroke-width="5"/>
  <polygon points="362,2258 395,2239 428,2258 428,2296 395,2315 362,2296" fill="none" stroke="#f8fafc" stroke-width="2.5"/>
  <text x="395" y="2415" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="3" font-weight="bold" fill="#f8fafc">${escapeHtml(publisher.toUpperCase())}</text>

  <rect x="1150" y="2235" width="540" height="330" rx="8" fill="#ffffff"/>
  ${buildBarcodeBars(1195, 2265, 210)}
  <text x="1420" y="2530" text-anchor="middle" font-family="Courier, monospace" font-size="30" font-weight="bold" fill="#111827">9 786585 007853</text>

  <rect x="2125" y="135" width="1636" height="2505" fill="none" stroke="${plan.accentHex}" stroke-width="3" opacity="0.75"/>
  <text x="2943" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" letter-spacing="8" fill="#e2e8f0">${escapeHtml(genre.toUpperCase())}</text>
  ${wrapFrontTitleSvg}
  <text x="2943" y="2535" text-anchor="middle" font-family="Georgia, serif" font-size="82" letter-spacing="5" fill="#f8fafc">${escapeHtml(penName.toUpperCase())}</text>
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
  <div class="meta">Front AI Art: ${frontArt ? 'Loaded' : 'Fallback'} | Back AI Art: ${backArt ? 'Loaded' : 'Fallback'}</div>
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
