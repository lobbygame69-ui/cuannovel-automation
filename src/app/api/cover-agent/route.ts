import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getEnv } from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface CoverAgentInput {
  title: string;
  genre?: string;
  synopsis: string;
  author?: string;
  publisher?: string;
  pageCount?: number;
  uploadToDrive?: boolean;
}

interface CoverArtPlan {
  frontPrompt: string;
  backPrompt: string;
  tagline: string;
  accentColor: string;
  glowColor: string;
  primaryColor: string;
  secondaryColor: string;
  focalMotif: string;
  source: string;
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
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

function splitSynopsis(synopsis: string): {
  hookLines: string[];
  bodyLines: string[];
  closingLines: string[];
} {
  const clean = String(synopsis || '').replace(/\s+/g, ' ').trim();
  const sentences =
    clean
      .match(/[^.!?]+[.!?]+(?:\s|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) || [clean];

  const hook = sentences[0] || clean;
  const closing = sentences.length >= 3 ? sentences[sentences.length - 1] : '';
  const body =
    sentences.length >= 3
      ? sentences.slice(1, -1).join(' ')
      : sentences.length === 2
        ? sentences[1]
        : '';

  return {
    hookLines: wrapLines(hook, 38, 3),
    bodyLines: wrapLines(body, 40, 5),
    closingLines: wrapLines(closing, 38, 3)
  };
}

function calculateKdpWrapDimensions(pageCount = 180) {
  // Ukuran standar KDP 6 x 9 inci pada 300 DPI + bleed 0.125 inci
  const trimW = 1800; // 6 in * 300
  const trimH = 2700; // 9 in * 300
  const bleed = 38; // 0.125 in * 300
  const safePages = Math.max(24, Math.min(828, Number(pageCount) || 180));
  // Rumus ketebalan kertas cream KDP: 0.0025 inci per halaman * 300 DPI
  const spineW = Math.max(75, Math.round(safePages * 0.0025 * 300));
  const panelW = trimW + bleed; // 1838 px
  const totalH = trimH + bleed * 2; // 2776 px
  const totalW = panelW * 2 + spineW;

  return { panelW, spineW, totalW, totalH, bleed };
}

async function generateArtDirectionWithQwen(input: {
  title: string;
  genre: string;
  synopsis: string;
  author: string;
}): Promise<CoverArtPlan> {
  const openRouterKey = getEnv('OPENROUTER_API_KEY');
  const noTextRule =
    'epic digital fantasy book illustration, rich atmospheric lighting, cinematic depth, intricate details, no text, no letters, no typography, no watermark, no border';

  if (openRouterKey) {
    const models = [
      'qwen/qwen-2.5-72b-instruct:free',
      'qwen/qwen3-coder:free',
      'qwen/qwen-2.5-vl-72b-instruct:free'
    ];

    for (const model of models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openRouterKey}`,
            'HTTP-Referer': getEnv('APP_URL', 'https://cuannovel-automation.vercel.app'),
            'X-Title': 'CuanNovel Autonomous Cover Director'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a senior book cover illustrator director. Return ONLY valid JSON: {"frontPrompt":"...","backPrompt":"...","tagline":"...","focalMotif":"...","accentColor":"#f3c969","glowColor":"#67e8f9","primaryColor":"#071224","secondaryColor":"#12325b"}. Never put text or words inside image prompts.'
              },
              {
                role: 'user',
                content: `Title: ${input.title}\nGenre: ${input.genre}\nAuthor: ${input.author}\nSynopsis: ${input.synopsis.slice(0, 480)}`
              }
            ],
            temperature: 0.75,
            max_tokens: 900
          }),
          signal: controller.signal,
          cache: 'no-store'
        });

        if (res.ok) {
          const json = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const raw = json?.choices?.[0]?.message?.content || '';
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]) as Record<string, string>;
            if (parsed.frontPrompt && parsed.backPrompt) {
              return {
                frontPrompt: `${parsed.frontPrompt.trim()}, ${noTextRule}`,
                backPrompt: `${parsed.backPrompt.trim()}, ${noTextRule}`,
                tagline:
                  parsed.tagline?.trim() ||
                  '“An enchanting journey of memory, wonder, and fragile beauty.”',
                focalMotif: parsed.focalMotif?.trim() || 'Luminous Fantasy Artwork',
                accentColor: /^#[0-9a-fA-F]{6}$/.test(parsed.accentColor || '')
                  ? parsed.accentColor
                  : '#f3c969',
                glowColor: /^#[0-9a-fA-F]{6}$/.test(parsed.glowColor || '')
                  ? parsed.glowColor
                  : '#67e8f9',
                primaryColor: /^#[0-9a-fA-F]{6}$/.test(parsed.primaryColor || '')
                  ? parsed.primaryColor
                  : '#071224',
                secondaryColor: /^#[0-9a-fA-F]{6}$/.test(parsed.secondaryColor || '')
                  ? parsed.secondaryColor
                  : '#12325b',
                source: `qwen:${model}`
              };
            }
          }
        }
      } catch {
        // lanjut ke model Qwen berikutnya
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    frontPrompt: `Breathtaking novel front cover art for "${input.title}", ${input.genre}, ${input.synopsis.slice(0, 180)}, ${noTextRule}`,
    backPrompt: `Atmospheric scenic novel back cover background matching "${input.title}", ${input.genre}, starry night sky and distant horizon, ${noTextRule}`,
    tagline: '“An enchanting journey of memory, wonder, and fragile beauty.”',
    focalMotif: 'Atmospheric Novel Illustration',
    accentColor: '#f3c969',
    glowColor: '#67e8f9',
    primaryColor: '#071224',
    secondaryColor: '#12325b',
    source: 'built-in-director'
  };
}

async function fetchFreeAiArtworkBuffer(params: {
  prompt: string;
  width: number;
  height: number;
  seed: number;
}): Promise<{ buffer: Buffer | null; provider: string }> {
  // Jalur 1: Pollinations FLUX / Turbo (Gratis, tanpa API key & tanpa kredit)
  const models = ['flux', 'turbo'];
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    try {
      const encodedPrompt = encodeURIComponent(params.prompt);
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${params.width}&height=${params.height}&seed=${params.seed}&model=${model}&nologo=true&enhance=true`;
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const arrBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        if (contentType.startsWith('image/') && buf.length > 15000) {
          return { buffer: buf, provider: `pollinations:${model}` };
        }
      }
    } catch {
      // coba model berikutnya
    } finally {
      clearTimeout(timer);
    }
  }

  // Jalur 2: Cadangan Gemini Image jika kuota tersedia
  const geminiKey = getEnv('GEMINI_API_KEY') || getEnv('GEMINI_API_KEY_BACKUP');
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
          }),
          cache: 'no-store'
        }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data?: string } }> };
          }>;
        };
        const b64 = json?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data)
          ?.inlineData?.data;
        if (b64 && b64.length > 5000) {
          return { buffer: Buffer.from(b64, 'base64'), provider: 'gemini-2.5-flash-image' };
        }
      }
    } catch {
      // abaikan jika kuota 429
    }
  }

  return { buffer: null, provider: 'fallback-gradient' };
}

function buildFallbackBaseSvg(
  width: number,
  height: number,
  plan: CoverArtPlan,
  isFront: boolean
): string {
  const cx = Math.round(width * 0.52);
  const cy = Math.round(height * (isFront ? 0.58 : 0.35));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="bg-glow" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stop-color="${escapeXml(plan.secondaryColor)}"/>
        <stop offset="100%" stop-color="${escapeXml(plan.primaryColor)}"/>
      </radialGradient>
      <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${escapeXml(plan.accentColor)}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${escapeXml(plan.glowColor)}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg-glow)"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(width * 0.42)}" fill="url(#orb-glow)"/>
    <path d="M0 ${Math.round(height * 0.78)} Q${Math.round(width * 0.5)} ${Math.round(height * 0.7)} ${width} ${Math.round(height * 0.8)} L${width} ${height} L0 ${height} Z" fill="#040914"/>
  </svg>`;
}

async function sendFilesToGoogleDriveWebhook(payload: {
  title: string;
  author: string;
  publisher: string;
  ebookPngBase64: string;
  wrapPngBase64: string;
  wrapSvg: string;
}) {
  const webhookUrl = getEnv('DRIVE_WEBHOOK_URL');
  if (!webhookUrl) {
    return { uploaded: false, reason: 'DRIVE_WEBHOOK_URL belum diatur di environment Vercel' };
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  const text = await res.text().catch(() => '');
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // biarkan teks mentah
  }

  return {
    uploaded: res.ok,
    status: res.status,
    response: parsed
  };
}

async function buildFinishedBookCovers(input: CoverAgentInput) {
  const title = String(input.title || 'Untitled Novel').trim();
  const genre = String(input.genre || 'FICTION').trim();
  const synopsis = String(input.synopsis || '').trim();
  const author = String(input.author || 'M. F. Julian').trim();
  const publisher = String(input.publisher || 'cuannovelkarya').trim();
  const dims = calculateKdpWrapDimensions(input.pageCount);

  const plan = await generateArtDirectionWithQwen({ title, genre, synopsis, author });

  const seedBase = Math.abs(
    title.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7)
  );

  // Generate ilustrasi depan & belakang secara paralel
  const [frontArt, backArt] = await Promise.all([
    fetchFreeAiArtworkBuffer({
      prompt: plan.frontPrompt,
      width: 1024,
      height: 1536,
      seed: seedBase
    }),
    fetchFreeAiArtworkBuffer({
      prompt: plan.backPrompt,
      width: 1024,
      height: 1536,
      seed: seedBase + 99
    })
  ]);

  const frontBaseBuffer = frontArt.buffer
    ? await sharp(frontArt.buffer)
        .resize(dims.panelW, dims.totalH, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer()
    : await sharp(Buffer.from(buildFallbackBaseSvg(dims.panelW, dims.totalH, plan, true)))
        .png()
        .toBuffer();

  const backBaseBuffer = backArt.buffer
    ? await sharp(backArt.buffer)
        .resize(dims.panelW, dims.totalH, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer()
    : await sharp(Buffer.from(buildFallbackBaseSvg(dims.panelW, dims.totalH, plan, false)))
        .png()
        .toBuffer();

  const ebookBaseBuffer = await sharp(frontBaseBuffer)
    .resize(1600, 2560, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const titleLines = wrapLines(title, 13, 2);
  const syn = splitSynopsis(synopsis);

  // Overlay tipografi E-Book Cover (1600 x 2560)
  const ebookTitleXml = titleLines
    .map(
      (line, idx) =>
        `<text x="800" y="${430 + idx * 165}" text-anchor="middle" font-family="Georgia, serif" font-size="152" font-weight="bold" fill="#f8fafc">${escapeXml(line)}</text>`
    )
    .join('\n');

  const ebookOverlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
    <defs>
      <linearGradient id="eb-scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#040914" stop-opacity="0.65"/>
        <stop offset="45%" stop-color="#040914" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#040914" stop-opacity="0.72"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="2560" fill="url(#eb-scrim)"/>
    <rect x="64" y="64" width="1472" height="2432" fill="none" stroke="${escapeXml(plan.accentColor)}" stroke-width="3" opacity="0.82"/>
    <text x="800" y="215" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="8" fill="#e2e8f0">${escapeXml(genre.toUpperCase())}</text>
    ${ebookTitleXml}
    <text x="800" y="2365" text-anchor="middle" font-family="Georgia, serif" font-size="82" letter-spacing="6" fill="#f8fafc">${escapeXml(author.toUpperCase())}</text>
  </svg>`;

  const ebookPngBuffer = await sharp(ebookBaseBuffer)
    .composite([{ input: Buffer.from(ebookOverlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // Overlay tipografi Paperback Full-Wrap (Back + Spine + Front + Kotak Barcode Kosong)
  const frontCenterX = dims.panelW + dims.spineW + Math.round(dims.panelW / 2);
  const spineCenterX = dims.panelW + Math.round(dims.spineW / 2);
  const backCenterX = Math.round(dims.panelW / 2);

  const wrapTitleXml = titleLines
    .map(
      (line, idx) =>
        `<text x="${frontCenterX}" y="${455 + idx * 170}" text-anchor="middle" font-family="Georgia, serif" font-size="156" font-weight="bold" fill="#f8fafc">${escapeXml(line)}</text>`
    )
    .join('\n');

  const hookXml = syn.hookLines
    .map(
      (line, idx) =>
        `<text x="${backCenterX}" y="${950 + idx * 54}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="40" font-weight="bold" fill="#f8fafc">${escapeXml(line)}</text>`
    )
    .join('\n');

  const bodyStartY = 950 + Math.max(1, syn.hookLines.length) * 54 + 42;
  const bodyXml = syn.bodyLines
    .map(
      (line, idx) =>
        `<text x="${backCenterX}" y="${bodyStartY + idx * 48}" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#f1f5f9">${escapeXml(line)}</text>`
    )
    .join('\n');

  const closingStartY = bodyStartY + Math.max(1, syn.bodyLines.length) * 48 + 38;
  const closingXml = syn.closingLines
    .map(
      (line, idx) =>
        `<text x="${backCenterX}" y="${closingStartY + idx * 48}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="36" fill="#fde68a">${escapeXml(line)}</text>`
    )
    .join('\n');

  const wrapOverlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.totalW}" height="${dims.totalH}" viewBox="0 0 ${dims.totalW} ${dims.totalH}">
    <defs>
      <linearGradient id="back-scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#040914" stop-opacity="0.32"/>
        <stop offset="50%" stop-color="#040914" stop-opacity="0.62"/>
        <stop offset="100%" stop-color="#040914" stop-opacity="0.72"/>
      </linearGradient>
      <linearGradient id="front-scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#040914" stop-opacity="0.65"/>
        <stop offset="45%" stop-color="#040914" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#040914" stop-opacity="0.72"/>
      </linearGradient>
    </defs>

    <!-- Back Cover Overlay -->
    <rect x="0" y="0" width="${dims.panelW}" height="${dims.totalH}" fill="url(#back-scrim)"/>
    <line x1="${backCenterX - 240}" y1="875" x2="${backCenterX + 240}" y2="875" stroke="${escapeXml(plan.accentColor)}" stroke-width="2" opacity="0.75"/>
    ${hookXml}
    ${bodyXml}
    ${closingXml}
    <text x="${backCenterX}" y="${closingStartY + 155}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="34" fill="#e2e8f0">${escapeXml(plan.tagline)}</text>

    <!-- Identitas Penerbit cuannovelkarya -->
    <polygon points="275,2275 320,2248 365,2275 365,2328 320,2355 275,2328" fill="none" stroke="${escapeXml(plan.accentColor)}" stroke-width="4"/>
    <text x="320" y="2415" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="bold" letter-spacing="2" fill="#f8fafc">${escapeXml(publisher)}</text>

    <!-- Kotak Barcode Kosong Putih Bersih KDP -->
    <rect x="${dims.panelW - 705}" y="2225" width="565" height="340" rx="6" fill="#ffffff"/>

    <!-- Spine -->
    <rect x="${dims.panelW}" y="0" width="${dims.spineW}" height="${dims.totalH}" fill="#081224"/>
    <g transform="translate(${spineCenterX}, ${Math.round(dims.totalH / 2)}) rotate(90)">
      <text x="-430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="40" letter-spacing="4" fill="#f8fafc">${escapeXml(title)}</text>
      <polygon points="0,-12 10,0 0,12 -10,0" fill="${escapeXml(plan.accentColor)}"/>
      <text x="430" y="14" text-anchor="middle" font-family="Georgia, serif" font-size="40" letter-spacing="4" fill="#f8fafc">${escapeXml(author.toUpperCase())}</text>
    </g>

    <!-- Front Cover Overlay -->
    <rect x="${dims.panelW + dims.spineW}" y="0" width="${dims.panelW}" height="${dims.totalH}" fill="url(#front-scrim)"/>
    <rect x="${dims.panelW + dims.spineW + 96}" y="130" width="${dims.panelW - 192}" height="${dims.totalH - 260}" fill="none" stroke="${escapeXml(plan.accentColor)}" stroke-width="3" opacity="0.82"/>
    <text x="${frontCenterX}" y="275" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="8" fill="#e2e8f0">${escapeXml(genre.toUpperCase())}</text>
    ${wrapTitleXml}
    <text x="${frontCenterX}" y="2555" text-anchor="middle" font-family="Georgia, serif" font-size="88" letter-spacing="6" fill="#f8fafc">${escapeXml(author.toUpperCase())}</text>
  </svg>`;

  const wrapPngBuffer = await sharp({
    create: {
      width: dims.totalW,
      height: dims.totalH,
      channels: 4,
      background: '#050b16'
    }
  })
    .composite([
      { input: backBaseBuffer, top: 0, left: 0 },
      { input: frontBaseBuffer, top: 0, left: dims.panelW + dims.spineW },
      { input: Buffer.from(wrapOverlaySvg), top: 0, left: 0 }
    ])
    .png()
    .toBuffer();

  const ebookPngBase64 = ebookPngBuffer.toString('base64');
  const wrapPngBase64 = wrapPngBuffer.toString('base64');

  const driveResult =
    input.uploadToDrive !== false
      ? await sendFilesToGoogleDriveWebhook({
          title,
          author,
          publisher,
          ebookPngBase64,
          wrapPngBase64,
          wrapSvg: wrapOverlaySvg
        })
      : { uploaded: false, reason: 'uploadToDrive=false' };

  return {
    ok: true,
    title,
    author,
    publisher,
    brainProvider: plan.source,
    frontArtProvider: frontArt.provider,
    backArtProvider: backArt.provider,
    dimensions: dims,
    drive: driveResult,
    ebookDataUri: `data:image/png;base64,${ebookPngBase64}`,
    wrapDataUri: `data:image/png;base64,${wrapPngBase64}`
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CoverAgentInput>;
    if (!body?.title || !body?.synopsis) {
      return NextResponse.json(
        { ok: false, error: 'Wajib menyertakan title dan synopsis.' },
        { status: 400 }
      );
    }

    const result = await buildFinishedBookCovers({
      title: String(body.title),
      genre: body.genre ? String(body.genre) : 'FICTION',
      synopsis: String(body.synopsis),
      author: body.author ? String(body.author) : 'M. F. Julian',
      publisher: body.publisher ? String(body.publisher) : 'cuannovelkarya',
      pageCount: body.pageCount ? Number(body.pageCount) : 180,
      uploadToDrive: body.uploadToDrive !== false
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = (searchParams.get('title') || 'The Glass Orchard').trim();
  const genre = (searchParams.get('genre') || 'SPECULATIVE FICTION').trim();
  const author = (searchParams.get('author') || 'M. F. Julian').trim();
  const publisher = (searchParams.get('publisher') || 'cuannovelkarya').trim();
  const pageCount = Number(searchParams.get('pages') || '180');
  const uploadToDrive = searchParams.get('drive') === '1';

  const synopsis = (
    searchParams.get('synopsis') ||
    'In the floating citadel of Virelia, emotions grow as translucent fruit on glass trees. In a world where feelings can be cultivated, a young woman discovers a forbidden orchard whose glass trees hold the memories of a lost past and the hopes of a future yet unwritten. An enchanting journey of love, memory, and the fragile beauty of what we feel.'
  ).trim();

  const result = await buildFinishedBookCovers({
    title,
    genre,
    synopsis,
    author,
    publisher,
    pageCount,
    uploadToDrive
  });

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Cover Studio — ${escapeXml(result.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #090d14; color: #f8fafc; padding: 20px; margin: 0; }
    .meta { font-size: 13px; color: #cbd5e1; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
    .card { background: #131924; padding: 14px; border-radius: 12px; border: 1px solid #1e293b; }
    img { width: 100%; height: auto; border-radius: 8px; display: block; }
    a.btn { display: inline-block; margin-top: 10px; padding: 8px 14px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>${escapeXml(result.title)} — Bahan Jadi Siap KDP</h1>
  <div class="meta">Brain: ${escapeXml(result.brainProvider)} | Front Art: ${escapeXml(result.frontArtProvider)} | Back Art: ${escapeXml(result.backArtProvider)} | Drive: ${escapeXml(JSON.stringify(result.drive))}</div>
  <div class="grid">
    <div class="card">
      <h2>E-Book Cover (1600×2560 PNG)</h2>
      <img src="${result.ebookDataUri}" alt="E-Book Cover" />
      <a class="btn" download="${escapeXml(result.title)}-ebook.png" href="${result.ebookDataUri}">Unduh E-Book PNG</a>
    </div>
    <div class="card">
      <h2>Paperback Full-Wrap (${result.dimensions.totalW}×${result.dimensions.totalH} PNG)</h2>
      <img src="${result.wrapDataUri}" alt="Paperback Full-Wrap Cover" />
      <a class="btn" download="${escapeXml(result.title)}-paperback-wrap.png" href="${result.wrapDataUri}">Unduh Full-Wrap PNG</a>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
