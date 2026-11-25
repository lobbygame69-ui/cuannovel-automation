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

    const encodedPrompt = encodeURIComponent(promptText.slice(0, 480));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (!ct.includes('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = (searchParams.get('title') || 'The Ember Archive').trim();
  const genre = (searchParams.get('genre') || 'Fantasy / Mystery').trim();
  const penName = (searchParams.get('author') || 'M. F. JULIAN').trim();
  const publisher = (searchParams.get('publisher') || 'cuannovelkarya').trim();
  const synopsis = (
    searchParams.get('synopsis') ||
    'In a city where stories are forged from ember and shadow, a lone archivist uncovers a forbidden truth that could reshape the realm.'
  ).trim();

  const strictCleanRule =
    'Strictly NO text, NO letters, NO numbers, NO watermarks, NO logos, NO AI generator names, NO signatures, NO borders.';

  const plan: CoverArtPlan = {
    frontPrompt: `Bestseller novel front cover illustration for "${title}" (${genre}). Story premise: ${synopsis.slice(0, 220)}. Rich cinematic lighting, strong focal composition. ${strictCleanRule}`,
    backPrompt: `Matching atmospheric back cover background illustration for "${title}" (${genre}). Different angle and secondary setting from front cover, evoking ${synopsis.slice(0, 180)}. Softer contrast for blurb readability. ${strictCleanRule}`,
    accentHex: '#fbbf24',
    panelBgHex: '#091326'
  };

  const seed = Math.floor(Date.now() % 1000000);
  const [frontArt, backArt] = await Promise.all([
    fetchIllustrationDataUri(plan.frontPrompt, 1024, 1536, seed + 11),
    fetchIllustrationDataUri(plan.backPrompt, 1024, 1536, seed + 79)
  ]);

  const titleLines = wrapSvgLines(title, 18, 4);
  const synopsisLines = wrapSvgLines(synopsis, 42, 11);

  const frontTitleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="800" y="${560 + idx * 130}" text-anchor="middle" font-family="Georgia, serif" font-size="110" font-weight="bold" fill="#ffffff">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const backSynopsisSvg = synopsisLines
    .map(
      (line, idx) =>
        `<text x="140" y="${360 + idx * 58}" font-family="Georgia, serif" font-size="38" fill="#f8fafc">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  ${
    frontArt
      ? `<image href="${escapeHtml(frontArt)}" x="-40" y="-20" width="1680" height="2720" preserveAspectRatio="xMidYMin slice"/>
         <rect x="0" y="0" width="1600" height="2560" fill="${plan.panelBgHex}" opacity="0.28"/>
         <rect x="0" y="2120" width="1600" height="440" fill="${plan.panelBgHex}" opacity="0.86"/>`
      : `<rect x="0" y="0" width="1600" height="2560" fill="${plan.panelBgHex}"/>`
  }
  <rect x="72" y="72" width="1456" height="2416" fill="none" stroke="${plan.accentHex}" stroke-width="4" opacity="0.65"/>
  <text x="800" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="6" fill="#fde68a">${escapeHtml(genre.toUpperCase())}</text>
  ${frontTitleSvg}
  <text x="800" y="2310" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="${plan.accentHex}">${escapeHtml(penName)}</text>
</svg>`;

  const wrapSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="3862" height="2775" viewBox="0 0 3862 2775">
  ${
    backArt
      ? `<image href="${escapeHtml(backArt)}" x="-40" y="-20" width="1910" height="2890" preserveAspectRatio="xMidYMin slice"/>
         <rect x="0" y="0" width="1838" height="2775" fill="${plan.panelBgHex}" opacity="0.35"/>`
      : `<rect x="0" y="0" width="1838" height="2775" fill="${plan.panelBgHex}"/>`
  }
  ${
    frontArt
      ? `<image href="${escapeHtml(frontArt)}" x="1986" y="-20" width="1910" height="2890" preserveAspectRatio="xMidYMin slice"/>
         <rect x="2024" y="0" width="1838" height="2775" fill="${plan.panelBgHex}" opacity="0.28"/>
         <rect x="2024" y="2335" width="1838" height="440" fill="${plan.panelBgHex}" opacity="0.86"/>`
      : `<rect x="2024" y="0" width="1838" height="2775" fill="${plan.panelBgHex}"/>`
  }
  <rect x="1838" y="0" width="186" height="2775" fill="${plan.panelBgHex}"/>
  <rect x="115" y="220" width="1600" height="1350" rx="20" fill="#060d19" fill-opacity="0.84" stroke="${plan.accentHex}" stroke-opacity="0.5" stroke-width="3"/>
  <text x="140" y="295" font-family="Georgia, serif" font-size="52" font-weight="bold" fill="${plan.accentHex}">${escapeHtml(title)}</text>
  ${backSynopsisSvg}
  <text x="140" y="2560" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#f8fafc">${escapeHtml(publisher)}</text>
  <rect x="1115" y="2420" width="600" height="360" rx="10" fill="#ffffff"/>
  <rect x="2129" y="142" width="1628" height="2490" fill="none" stroke="${plan.accentHex}" stroke-width="4" opacity="0.65"/>
  <text x="2943" y="305" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="6" fill="#fde68a">${escapeHtml(genre.toUpperCase())}</text>
  ${titleLines
    .map(
      (line, idx) =>
        `<text x="2943" y="${575 + idx * 134}" text-anchor="middle" font-family="Georgia, serif" font-size="112" font-weight="bold" fill="#ffffff">${escapeHtml(line)}</text>`
    )
    .join('\n')}
  <text x="2943" y="2535" text-anchor="middle" font-family="Georgia, serif" font-size="66" font-weight="bold" fill="${plan.accentHex}">${escapeHtml(penName)}</text>
</svg>`;

  if (searchParams.get('format') === 'svg-front') {
    return new NextResponse(ebookSvg, {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
    });
  }
  if (searchParams.get('format') === 'svg-wrap') {
    return new NextResponse(wrapSvg, {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
    });
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Test Cover — ${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: start; }
    .card { background: #1e293b; padding: 16px; border-radius: 12px; }
    img { width: 100%; height: auto; border-radius: 8px; display: block; background: #091326; }
    h2 { margin: 0 0 12px; font-size: 16px; }
  </style>
</head>
<body>
  <h1>Preview Cover Saja: ${escapeHtml(title)}</h1>
  <div class="grid">
    <div class="card">
      <h2>E-Book Cover</h2>
      <img src="data:image/svg+xml;utf8,${encodeURIComponent(ebookSvg)}" alt="E-Book Cover" />
    </div>
    <div class="card">
      <h2>Paperback Full-Wrap Cover</h2>
      <img src="data:image/svg+xml;utf8,${encodeURIComponent(wrapSvg)}" alt="Full-Wrap Cover" />
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
