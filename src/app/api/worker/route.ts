import { NextRequest, NextResponse } from 'next/server';
import {
  auditNovelBeforePackaging,
  buildRetryChapterInstruction,
  CuanNovelBatch,
  CuanNovelQueueItem,
  getEnv,
  langLabel,
  normalizeLang,
  sbFetch,
  sendTelegramMessage
} from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  pen_name: string;
  genre: string;
  language: string;
  synopsis: string;
  status: string;
  target_chapters: number;
  completed_chapters: number;
}

interface ChapterRow {
  id: string;
  chapter_number: number;
  title: string;
  content: string;
}

function countWords(text: string): number {
  const cleaned = String(text || '')
    .replace(/[#*_`>-]+/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = String(raw || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseStreamedNovelkuResponse(rawText: string): {
  ok?: boolean;
  error?: string;
  data?: { chapter_title?: string; content?: string };
} {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) {
    throw new Error('Respons dari NOVELKU AI kosong.');
  }

  for (let i = cleaned.lastIndexOf('{'); i !== -1; i = cleaned.lastIndexOf('{', i - 1)) {
    const candidate = cleaned.slice(i).trim();
    try {
      return JSON.parse(candidate) as {
        ok?: boolean;
        error?: string;
        data?: { chapter_title?: string; content?: string };
      };
    } catch {
      // lanjut cari '{' sebelumnya
    }
  }

  throw new Error(`Format respons NOVELKU AI tidak valid: ${cleaned.slice(0, 200)}`);
}

async function generateChapterViaNovelkuAi(params: {
  project: ProjectRow;
  slot: CuanNovelQueueItem;
  nextChapterNum: number;
  isEn: boolean;
  previousShortWords?: number;
}): Promise<{ chapterTitle: string; content: string; provider: string }> {
  const novelkuUrl = getEnv('NOVELKU_AI_URL').replace(/\/+$/, '');
  const novelkuSecret = getEnv('NOVELKU_WORKER_SECRET') || getEnv('CRON_SECRET');

  if (!novelkuUrl) {
    throw new Error('NOVELKU_AI_URL belum diatur di Environment Variables Vercel.');
  }
  if (!novelkuSecret) {
    throw new Error('NOVELKU_WORKER_SECRET (atau CRON_SECRET) belum diatur di Environment Variables Vercel.');
  }

  const retryNote = buildRetryChapterInstruction({
    chapterNumber: params.nextChapterNum,
    previousWords: params.previousShortWords,
    minWords: 1000,
    language: params.isEn ? 'en' : 'id'
  });

  const combinedNote = [params.slot.curator_feedback || '', retryNote]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${novelkuUrl}/api/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${novelkuSecret}`
      },
      body: JSON.stringify({
        action: 'write_chapter',
        payload: {
          project_id: params.project.id,
          title: params.project.title,
          pen_name: params.project.pen_name,
          genre: params.project.genre,
          synopsis: params.project.synopsis,
          language: params.isEn ? 'English' : 'Indonesian',
          chapter_number: params.nextChapterNum,
          target_chapters: params.slot.target_chapters || 20,
          min_words: 1000,
          revision_note: combinedNote
        }
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`NOVELKU AI HTTP ${res.status}: ${rawText.slice(0, 220)}`);
    }

    const parsed = parseStreamedNovelkuResponse(rawText);
    if (parsed.ok === false || !parsed.data?.content) {
      throw new Error(parsed.error || 'NOVELKU AI tidak mengembalikan konten bab.');
    }

    const chapterTitle = String(
      parsed.data.chapter_title ||
        `${params.isEn ? 'Chapter' : 'Bab'} ${params.nextChapterNum}`
    ).trim();
    const content = String(parsed.data.content).trim();

    return {
      chapterTitle,
      content,
      provider: 'novelku-ai:/api/ai'
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Permintaan ke NOVELKU AI melewati batas waktu 45 detik.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiText(prompt: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;
  const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 4096 }
        }),
        cache: 'no-store'
      }
    );
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return text;
  }
  return null;
}

async function resolveGroqModel(apiKey: string): Promise<string> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        data?: Array<{ id?: string }>;
      } | null;
      const candidate = (json?.data || [])
        .map((m) => String(m.id || '').trim())
        .find(
          (id) =>
            id &&
            !/whisper|guard|tts|embed|orpheus|playai|allam|safeguard/i.test(id)
        );
      if (candidate) return candidate;
    }
  } catch {
    // gunakan cadangan
  }
  return 'llama-3.1-8b-instant';
}

async function callGroqText(prompt: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;
  const model = await resolveGroqModel(apiKey);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 4096
    }),
    cache: 'no-store'
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

async function callOpenRouterText(prompt: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': getEnv('APP_URL', 'https://cuannovel-automation.vercel.app'),
      'X-Title': 'CuanNovel Orchestrator'
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 4096
    }),
    cache: 'no-store'
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

async function generateWithFailover(prompt: string): Promise<{ text: string; provider: string }> {
  const geminiPrimary = getEnv('GEMINI_API_KEY');
  const geminiBackup = getEnv('GEMINI_API_KEY_BACKUP');
  const groqKey = getEnv('GROQ_API_KEY');
  const openRouterKey = getEnv('OPENROUTER_API_KEY');

  const g1 = await callGeminiText(prompt, geminiPrimary);
  if (g1) return { text: g1, provider: 'gemini-primary' };

  const g2 = await callGeminiText(prompt, geminiBackup);
  if (g2) return { text: g2, provider: 'gemini-backup' };

  const gr = await callGroqText(prompt, groqKey);
  if (gr) return { text: gr, provider: 'groq' };

  const or = await callOpenRouterText(prompt, openRouterKey);
  if (or) return { text: or, provider: 'openrouter-free' };

  throw new Error(
    'Semua provider AI teks gagal merespons (cek GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY).'
  );
}

async function purgeProjectCompletely(projectId: string | null) {
  if (!projectId) return;
  await sbFetch(`chapters?project_id=eq.${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  }).catch(() => null);
  await sbFetch(`novel_settings?project_id=eq.${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  }).catch(() => null);
  await sbFetch(`projects?id=eq.${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  }).catch(() => null);
}

async function uploadToDriveBridge(payload: Record<string, unknown>): Promise<string | null> {
  const bridgeUrl =
    getEnv('DRIVE_UPLOAD_WEBHOOK_URL') ||
    getEnv('DRIVE_WEBHOOK_URL') ||
    getEnv('DRIVE_BRIDGE_URL');
  const bridgeSecret = getEnv('DRIVE_BRIDGE_SECRET');
  if (!bridgeUrl) return null;

  const res = await fetch(bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(bridgeSecret ? { secret: bridgeSecret } : {}),
      ...payload
    }),
    cache: 'no-store'
  });

  if (!res.ok) {
    throw new Error(`Drive bridge error (${res.status})`);
  }

  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    folderUrl?: string;
    error?: string;
  } | null;

  if (!json?.ok) {
    throw new Error(json?.error || 'Drive bridge mengembalikan ok=false');
  }

  return json.folderUrl || null;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanChapterTitle(title: string, chapterNum: number, isEn: boolean): string {
  const raw = String(title || '').trim();
  if (!raw) {
    return isEn ? `Chapter ${chapterNum}` : `Bab ${chapterNum}`;
  }
  const prefixRegex = isEn
    ? new RegExp(`^chapter\\s+${chapterNum}\\s*[:\\-–—.]*\\s*`, 'i')
    : new RegExp(`^bab\\s+${chapterNum}\\s*[:\\-–—.]*\\s*`, 'i');
  return raw.replace(prefixRegex, '').trim() || raw;
}

function splitIntoParagraphs(content: string): string[] {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\n+/g, ' ').trim())
    .filter(Boolean);

  if (blocks.length > 1) return blocks;

  return normalized
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function estimateChapterPages(content: string): number {
  const words = countWords(content);
  return Math.max(3, Math.ceil(words / 260));
}

function buildInteriorHtml(
  project: ProjectRow,
  batch: CuanNovelBatch,
  chapters: ChapterRow[]
): string {
  const isEn = normalizeLang(batch.language) === 'en';
  const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const yearNow = new Date().getFullYear();

  let runningPage = 5;
  const tocEntries = sortedChapters.map((ch) => {
    const startPage = runningPage;
    const pagesUsed = estimateChapterPages(ch.content);
    runningPage += pagesUsed;
    const cleanTitle = cleanChapterTitle(ch.title, ch.chapter_number, isEn);
    const label = isEn
      ? `Chapter ${ch.chapter_number}: ${cleanTitle}`
      : `Bab ${ch.chapter_number}: ${cleanTitle}`;
    return {
      ch,
      anchorId: `chapter-${ch.chapter_number}`,
      cleanTitle,
      startPage,
      label
    };
  });

  // Menggunakan <li><a href="#chapter-X"> agar terdeteksi otomatis sebagai Interactive TOC oleh Kindle KDP
  const tocRows = tocEntries
    .map(
      (entry) =>
        `<li class="toc-row"><a class="toc-label" href="#${entry.anchorId}">${escapeHtml(entry.label)}</a><span class="toc-page">${entry.startPage}</span></li>`
    )
    .join('\n');

  const copyrightBlock = isEn
    ? `
      <div class="meta-heading">Copyright</div>
      <p class="no-indent">Copyright &copy; ${yearNow} ${escapeHtml(project.pen_name)}. Published by ${escapeHtml(batch.publisher_name)}.</p>
      <p class="no-indent">All rights reserved. No part of this book may be reproduced, stored in a retrieval system, or transmitted in any form or by any means—electronic, mechanical, photocopying, recording, or otherwise—without prior written permission from the author and publisher.</p>
      <p class="no-indent">This is a work of fiction. Names, characters, places, and incidents are products of the author's imagination or are used fictitiously.</p>
    `
    : `
      <div class="meta-heading">Hak Cipta</div>
      <p class="no-indent">Hak Cipta &copy; ${yearNow} ${escapeHtml(project.pen_name)}. Diterbitkan oleh ${escapeHtml(batch.publisher_name)}.</p>
      <p class="no-indent">Seluruh hak cipta dilindungi undang-undang. Dilarang memperbanyak, menyimpan dalam sistem penyimpanan data, atau menyebarkan bagian mana pun dari buku ini dalam bentuk atau cara apa pun tanpa izin tertulis dari penulis dan penerbit.</p>
      <p class="no-indent">Novel ini merupakan karya fiksi. Nama tokoh, tempat, dan peristiwa merupakan rekaan penulis atau digunakan secara fiktif.</p>
    `;

  const openingAck = isEn
    ? `
      <div class="section-heading">Acknowledgments</div>
      <p>Thank you for picking up this book and stepping into its world. Every scene was written with care to accompany your quiet hours and spark your imagination.</p>
      <p>My sincere gratitude goes to every reader who gives new stories a chance to breathe.</p>
    `
    : `
      <div class="section-heading">Ucapan Terima Kasih</div>
      <p>Terima kasih telah membuka buku ini dan melangkah masuk ke dalam kisahnya. Setiap bagian ditulis dengan penuh perhatian untuk menemani waktu baca Anda.</p>
      <p>Rasa terima kasih yang tulus saya sampaikan kepada setiap pembaca yang selalu meluangkan waktu untuk menikmati karya cerita.</p>
    `;

  const closingAck = isEn
    ? `
      <div class="section-heading">Thank You, Dear Reader</div>
      <p>Thank you for staying until the final page of <em>${escapeHtml(project.title)}</em>. Your time, patience, and support mean more than words can express.</p>
      <p>If this story stayed with you, I hope you will look forward to the next journey ahead.</p>
      <p class="signature">— ${escapeHtml(project.pen_name)}</p>
    `
    : `
      <div class="section-heading">Terima Kasih untuk Pembaca</div>
      <p>Terima kasih telah membaca <em>${escapeHtml(project.title)}</em> hingga halaman terakhir. Waktu, perhatian, dan dukungan Anda sangat berarti bagi perjalanan penulisan ini.</p>
      <p>Apabila kisah ini meninggalkan kesan tersendiri, semoga kita dapat bertemu kembali di karya berikutnya.</p>
      <p class="signature">— ${escapeHtml(project.pen_name)}</p>
    `;

  const chapterHtml = tocEntries
    .map(({ ch, anchorId, cleanTitle, startPage }) => {
      const paragraphs = splitIntoParagraphs(ch.content)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('\n');
      return `
        <article class="book-sheet chapter-sheet" id="${anchorId}" data-page="${startPage}">
          <div class="running-header">${escapeHtml(project.title)}</div>
          <div class="chapter-number-label">${isEn ? `CHAPTER ${ch.chapter_number}` : `BAB ${ch.chapter_number}`}</div>
          <h1 class="chapter-title">${escapeHtml(cleanTitle)}</h1>
          <div class="chapter-body">
            ${paragraphs}
          </div>
          <div class="running-footer">${startPage}</div>
        </article>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${isEn ? 'en' : 'id'}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(project.title)} — ${escapeHtml(project.pen_name)}</title>
<style>
  @page {
    size: 6in 9in;
    margin: 0.75in 0.75in 0.8in 0.75in;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 12px;
    background: #e2e8f0;
    font-family: "Georgia", "Times New Roman", serif;
    color: #18181b;
    line-height: 1.72;
  }
  .book-sheet {
    width: 6in;
    min-height: 9in;
    margin: 0 auto 24px auto;
    padding: 0.75in 0.75in 0.8in 0.75in;
    background: #ffffff;
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14);
    position: relative;
    break-before: page;
    page-break-before: always;
    break-after: page;
    page-break-after: always;
  }
  .book-sheet:first-child { break-before: auto; page-break-before: auto; }
  .book-sheet:last-child { break-after: auto; page-break-after: auto; }
  @media print {
    body { background: #ffffff; padding: 0; }
    .book-sheet {
      width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none;
      break-after: auto; page-break-after: auto;
    }
    .running-header, .running-footer { display: none; }
  }
  .title-sheet {
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    text-align: center; min-height: 7.4in;
  }
  .book-title-main {
    font-size: 24pt; line-height: 1.25; font-weight: 700; letter-spacing: 0.3px;
    margin: 0 0 18px 0; color: #0f172a;
  }
  .title-divider { width: 64px; height: 2px; background: #94a3b8; margin: 10px auto 18px auto; }
  .book-author-main {
    font-size: 13pt; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
    margin: 0 0 8px 0; color: #1e293b;
  }
  .book-publisher-sub { font-size: 10pt; color: #64748b; margin-top: 6px; }
  .meta-heading, .section-heading {
    font-size: 15pt; font-weight: 700; margin: 0 0 16px 0; padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0; color: #0f172a;
  }
  .chapter-number-label {
    font-size: 9pt; letter-spacing: 2px; text-transform: uppercase; color: #64748b; margin-bottom: 4px;
  }
  .chapter-title {
    font-size: 16pt; font-weight: 700; line-height: 1.3; margin: 0 0 18px 0; padding-bottom: 10px;
    border-bottom: 1px solid #e2e8f0; color: #0f172a;
  }
  p { font-size: 10.5pt; line-height: 1.72; margin: 0 0 9px 0; text-indent: 1.35em; text-align: justify; }
  p.no-indent { text-indent: 0; text-align: left; margin-bottom: 11px; }
  p.signature { text-indent: 0; text-align: left; font-style: italic; margin-top: 18px; font-weight: 600; }
  .toc-list { list-style: none; padding-left: 0; margin: 10px 0 0 0; }
  .toc-row {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    padding: 7px 0; border-bottom: 1px dotted #cbd5e1; font-size: 10.5pt;
  }
  .toc-label { flex: 1; color: #0f172a; text-decoration: none; }
  .toc-page { font-weight: 700; color: #334155; min-width: 28px; text-align: right; }
  .running-header { font-size: 8.5pt; color: #64748b; text-align: center; margin-bottom: 14px; letter-spacing: 0.4px; }
  .running-footer {
    margin-top: 22px; padding-top: 10px; border-top: 1px solid #f1f5f9;
    text-align: center; font-size: 9.5pt; color: #475569;
  }
</style>
</head>
<body>
  <section class="book-sheet title-sheet" data-page="1">
    <div class="book-title-main">${escapeHtml(project.title)}</div>
    <div class="title-divider"></div>
    <div class="book-author-main">${escapeHtml(project.pen_name)}</div>
    <div class="book-publisher-sub">${escapeHtml(batch.publisher_name)}</div>
  </section>

  <section class="book-sheet" data-page="2">
    ${copyrightBlock}
  </section>

  <section class="book-sheet" data-page="3">
    ${openingAck}
  </section>

  <nav class="book-sheet" id="toc" epub:type="toc" role="doc-toc" data-page="4">
    <h1 class="section-heading">${isEn ? 'Table of Contents' : 'Daftar Isi'}</h1>
    <ol class="toc-list">
      ${tocRows}
    </ol>
  </nav>

  ${chapterHtml}

  <section class="book-sheet" data-page="${runningPage}">
    ${closingAck}
  </section>
</body>
</html>`;
}

function estimateTotalPages(chapters: ChapterRow[]): number {
  const totalWords = chapters.reduce((acc, ch) => acc + countWords(ch.content), 0);
  const contentPages = Math.max(24, Math.ceil(totalWords / 260));
  return 5 + contentPages;
}

function resolveBaseAppUrl(req?: NextRequest): string {
  const configured = getEnv('APP_URL');
  if (configured) return configured.replace(/\/+$/, '');
  if (req?.nextUrl?.origin) return req.nextUrl.origin.replace(/\/+$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return 'https://cuannovel-automation.vercel.app';
}

async function callCoverDesignerAgent(params: {
  baseUrl: string;
  project: ProjectRow;
  batch: CuanNovelBatch;
  chapters: ChapterRow[];
}): Promise<{
  ebookCoverSvg: string;
  paperbackCoverSvg: string;
  ebookPngBase64?: string;
  wrapPngBase64?: string;
  spineWidthInches: number;
  estimatedPages: number;
}> {
  const estimatedPages = estimateTotalPages(params.chapters);
  const spineWidthInches = Number(Math.max(0.25, estimatedPages * 0.002252).toFixed(3));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const res = await fetch(`${params.baseUrl}/api/cover-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: params.project.title,
        genre: params.project.genre || 'FICTION',
        synopsis: params.project.synopsis,
        author: params.project.pen_name || params.batch.author_name || 'M. F. Julian',
        publisher: params.batch.publisher_name || 'cuannovelkarya',
        language: params.batch.language || 'id',
        pageCount: estimatedPages,
        uploadToDrive: false
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Cover Designer Agent HTTP ${res.status}: ${errText.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      ok?: boolean;
      ebookSvg?: string;
      wrapSvg?: string;
      ebookDataUri?: string;
      wrapDataUri?: string;
      error?: string;
    };

    if (!json?.ok || !json.ebookSvg || !json.wrapSvg) {
      throw new Error(json?.error || 'Cover Designer Agent tidak mengembalikan SVG cover.');
    }

    const ebookPngBase64 = json.ebookDataUri?.startsWith('data:image/png;base64,')
      ? json.ebookDataUri.replace('data:image/png;base64,', '')
      : undefined;
    const wrapPngBase64 = json.wrapDataUri?.startsWith('data:image/png;base64,')
      ? json.wrapDataUri.replace('data:image/png;base64,', '')
      : undefined;

    return {
      ebookCoverSvg: json.ebookSvg,
      paperbackCoverSvg: json.wrapSvg,
      ebookPngBase64,
      wrapPngBase64,
      spineWidthInches,
      estimatedPages
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = getEnv('CRON_SECRET');
  if (!cronSecret) return true;
  const auth = req.headers.get('authorization') || '';
  const qSecret = req.nextUrl.searchParams.get('secret') || '';
  return auth === `Bearer ${cronSecret}` || qSecret === cronSecret;
}

async function runNextQueueStep(req?: NextRequest) {
  let activeSlotId: string | null = null;

  try {
    const batches = (await sbFetch(
      'cuannovel_batches?status=eq.running&order=created_at.asc&limit=1'
    )) as CuanNovelBatch[];

    if (!Array.isArray(batches) || batches.length === 0) {
      return NextResponse.json({ ok: true, message: 'No running batch' });
    }

    const batch = batches[0];
    const lang = normalizeLang(batch.language);
    const isEn = lang === 'en';

    const queueItems = (await sbFetch(
      `cuannovel_queue?batch_id=eq.${encodeURIComponent(batch.id)}&stage=not.in.(completed,failed_purged)&order=sequence_no.asc&limit=1`
    )) as CuanNovelQueueItem[];

    const slot = Array.isArray(queueItems) && queueItems.length > 0 ? queueItems[0] : null;
    if (!slot) {
      await sbFetch(`cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', updated_at: new Date().toISOString() })
      });
      await sendTelegramMessage(
        batch.telegram_chat_id,
        `🏁 Batch CuanNovel selesai. Lolos: ${batch.passed_count}/${batch.target_passed} | Dihapus: ${batch.deleted_count}.`
      );
      return NextResponse.json({ ok: true, message: 'Batch completed' });
    }

    activeSlotId = slot.id;

    // 1. RISET & KONSEP NOVEL
    if (slot.stage === 'scout_research' || slot.stage === 'trend_rework') {
      const existingFps = (await sbFetch(
        `cuannovel_fingerprints?user_id=eq.${encodeURIComponent(batch.user_id)}&order=created_at.desc&limit=25`
      )) as Array<{ project_title?: string; core_conflict?: string; cover_main_object?: string }>;

      const avoidList = (existingFps || [])
        .map(
          (f) =>
            `- Judul: ${f.project_title || ''} | Konflik: ${f.core_conflict || ''} | Objek Cover: ${f.cover_main_object || ''}`
        )
        .join('\n');

      const langInstruction = isEn
        ? 'Write ALL output strictly in natural, engaging English.'
        : 'Tulis SELURUH output secara ketat dalam Bahasa Indonesia yang alami dan memikat.';

      const prompt = [
        langInstruction,
        'Create a unique commercial novel concept for Amazon KDP.',
        avoidList ? `Do NOT duplicate these prior concepts:\n${avoidList}` : '',
        slot.curator_feedback ? `Fix these prior issues:\n${slot.curator_feedback}` : '',
        'Return ONLY valid JSON with keys:',
        '{"title":"...","genre":"...","synopsis":"...","premise":"...","theme":"...","tone":"...","setting_details":"...","core_conflict":"...","character_dynamic":"...","plot_tropes":"...","cover_palette":"...","cover_main_object":"..."}'
      ]
        .filter(Boolean)
        .join('\n\n');

      const { text } = await generateWithFailover(prompt);
      const parsed = extractJsonObject(text);
      if (!parsed || !parsed.title) {
        throw new Error('Gagal mem-parsing JSON konsep novel dari AI.');
      }

      const title = String(parsed.title).trim();
      const genre = String(parsed.genre || 'Fiction').trim();
      const synopsis = String(parsed.synopsis || '').trim();

      const createdProjects = (await sbFetch('projects', {
        method: 'POST',
        body: JSON.stringify({
          user_id: batch.user_id,
          title,
          pen_name: batch.author_name,
          genre,
          language: lang,
          synopsis,
          status: 'draft',
          target_chapters: slot.target_chapters || 20,
          completed_chapters: 0
        })
      })) as ProjectRow[];

      const project = createdProjects[0];

      await sbFetch('novel_settings', {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id,
          user_id: batch.user_id,
          premise: String(parsed.premise || synopsis).trim(),
          synopsis,
          theme: String(parsed.theme || '').trim(),
          tone: String(parsed.tone || '').trim(),
          setting_details: String(parsed.setting_details || '').trim(),
          trim_size: '6x9',
          paper_type: 'white'
        })
      });

      await sbFetch('cuannovel_fingerprints', {
        method: 'POST',
        body: JSON.stringify({
          user_id: batch.user_id,
          project_title: title,
          genre,
          core_conflict: String(parsed.core_conflict || 'Central conflict').trim(),
          setting_world: String(parsed.setting_world || 'Contemporary world').trim(),
          character_dynamic: String(parsed.character_dynamic || 'Lead vs rival').trim(),
          plot_tropes: String(parsed.plot_tropes || 'Twist & redemption').trim(),
          cover_palette: String(parsed.cover_palette || 'Deep navy & gold').trim(),
          cover_main_object: String(parsed.cover_main_object || 'Lantern in rain').trim(),
          final_status: 'active'
        })
      });

      await sbFetch(`cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          total_attempts: (batch.total_attempts || 0) + 1,
          updated_at: new Date().toISOString()
        })
      });

      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          project_id: project.id,
          stage: 'novelku_production',
          current_chapter: 0,
          chapter_retry_count: 0,
          last_error: null,
          updated_at: new Date().toISOString()
        })
      });

      return NextResponse.json({ ok: true, slot: slot.sequence_no, stage: 'scout_research', title });
    }

    // 2. PRODUKSI BAB NOVELKU AI
    if (slot.stage === 'novelku_production') {
      if (!slot.project_id) {
        throw new Error('Slot novelku_production tidak memiliki project_id.');
      }

      const projects = (await sbFetch(
        `projects?id=eq.${encodeURIComponent(slot.project_id)}&limit=1`
      )) as ProjectRow[];
      const project = projects[0];
      if (!project) {
        throw new Error('Proyek tidak ditemukan di database.');
      }

      const nextChapterNum = (slot.current_chapter || 0) + 1;
      const prevShortMatch = slot.last_error?.match(/hanya\s+(\d+)\s+kata/i);
      const previousShortWords = prevShortMatch ? Number(prevShortMatch[1]) : undefined;

      const { chapterTitle, content, provider } = await generateChapterViaNovelkuAi({
        project,
        slot,
        nextChapterNum,
        isEn,
        previousShortWords
      });
      const words = countWords(content);

      if (words < 1000 && (slot.chapter_retry_count || 0) < 4) {
        await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            chapter_retry_count: (slot.chapter_retry_count || 0) + 1,
            last_error: `Bab ${nextChapterNum} hanya ${words} kata (<1.000 kata), mengulang otomatis.`,
            updated_at: new Date().toISOString()
          })
        });
        return NextResponse.json({ ok: true, retriedChapter: nextChapterNum, words, provider });
      }

      await sbFetch('chapters', {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id,
          chapter_number: nextChapterNum,
          title: chapterTitle,
          content
        })
      });

      const targetChapters = slot.target_chapters || 20;
      const doneAllChapters = nextChapterNum >= targetChapters;

      await sbFetch(`projects?id=eq.${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          completed_chapters: nextChapterNum,
          status: doneAllChapters ? 'for_audit' : 'draft'
        })
      });

      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          current_chapter: nextChapterNum,
          chapter_retry_count: 0,
          stage: doneAllChapters ? 'curator_audit' : 'novelku_production',
          last_error: null,
          updated_at: new Date().toISOString()
        })
      });

      return NextResponse.json({
        ok: true,
        slot: slot.sequence_no,
        chapter: nextChapterNum,
        words,
        provider,
        nextStage: doneAllChapters ? 'curator_audit' : 'novelku_production'
      });
    }

    // 3. AUDIT KURATOR
    if (slot.stage === 'curator_audit') {
      const chapters = (await sbFetch(
        `chapters?project_id=eq.${encodeURIComponent(slot.project_id || '')}&order=chapter_number.asc`
      )) as ChapterRow[];

      const list = Array.isArray(chapters) ? chapters : [];
      const targetChapters = slot.target_chapters || 20;

      const preAudit = auditNovelBeforePackaging({
        chapters: list.map((c) => ({
          chapterNumber: c.chapter_number,
          wordCount: countWords(c.content),
          hasError: !c.content || c.content.trim().length < 50
        })),
        targetChapters,
        minWordsPerChapter: 1000,
        qualityScore: slot.quality_score,
        minQualityScore: 80
      });

      const auditPrompt = [
        `Evaluate this ${list.length}-chapter novel (${langLabel(lang)}).`,
        `Pre-audit word check: ${preAudit.reason}. Required: >= ${targetChapters} chapters and >= 1000 words/chapter and score >= 80.`,
        `Chapter titles: ${list.map((c) => `${c.chapter_number}. ${c.title}`).join(' | ')}`,
        'Return ONLY valid JSON: {"score":85,"passed":true,"feedback":"short note"}'
      ].join('\n');

      const { text } = await generateWithFailover(auditPrompt);
      const parsed = extractJsonObject(text);
      const score = Number(parsed?.score ?? 80);
      const passed =
        preAudit.passed &&
        score >= 80 &&
        Boolean(parsed?.passed ?? true);

      const feedback = String(parsed?.feedback || preAudit.reason).trim();

      if (passed) {
        await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            stage: 'packaging_zip',
            quality_score: score,
            curator_feedback: feedback || 'Lolos audit sebelum Packaging Paket',
            last_error: null,
            updated_at: new Date().toISOString()
          })
        });
        return NextResponse.json({
          ok: true,
          slot: slot.sequence_no,
          stage: 'packaging_zip',
          auditPassed: true,
          score
        });
      }

      if ((slot.revision_count || 0) < (slot.max_revisions || 2)) {
        await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            stage: 'novelku_production',
            current_chapter: 0,
            chapter_retry_count: 0,
            revision_count: (slot.revision_count || 0) + 1,
            quality_score: score,
            curator_feedback: feedback || preAudit.reason,
            last_error: preAudit.passed ? null : preAudit.reason,
            updated_at: new Date().toISOString()
          })
        });
        return NextResponse.json({
          ok: true,
          slot: slot.sequence_no,
          revision: (slot.revision_count || 0) + 1,
          auditPassed: false,
          score
        });
      }

      await purgeProjectCompletely(slot.project_id);
      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'failed_purged',
          quality_score: score,
          curator_feedback: feedback || 'Gagal setelah 2x revisi; proyek dihapus bersih.',
          updated_at: new Date().toISOString()
        })
      });

      await sbFetch(`cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_count: (batch.deleted_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
      });

      await sendTelegramMessage(
        batch.telegram_chat_id,
        `🗑️ Slot #${slot.sequence_no} gagal setelah 2x revisi (skor ${score}) dan dihapus bersih. Lanjut ke slot berikutnya.`
      );

      return NextResponse.json({ ok: true, slot: slot.sequence_no, stage: 'failed_purged', score });
    }

    // 4. DESAIN COVER AI (VIA /api/cover-agent) & PACKAGING KDP KE GOOGLE DRIVE
    if (slot.stage === 'packaging_zip') {
      const projects = (await sbFetch(
        `projects?id=eq.${encodeURIComponent(slot.project_id || '')}&limit=1`
      )) as ProjectRow[];
      const chapters = (await sbFetch(
        `chapters?project_id=eq.${encodeURIComponent(slot.project_id || '')}&order=chapter_number.asc`
      )) as ChapterRow[];

      const project = projects[0];
      if (!project) {
        throw new Error('Proyek untuk tahap packaging tidak ditemukan.');
      }

      const chapterList = Array.isArray(chapters) ? chapters : [];
      const interiorHtml = buildInteriorHtml(project, batch, chapterList);
      const baseUrl = resolveBaseAppUrl(req);

      const {
        ebookCoverSvg,
        paperbackCoverSvg,
        ebookPngBase64,
        wrapPngBase64,
        spineWidthInches,
        estimatedPages
      } = await callCoverDesignerAgent({
        baseUrl,
        project,
        batch,
        chapters: chapterList
      });

      const metadataTxt = [
        `Title: ${project.title}`,
        `Author: ${project.pen_name}`,
        `Publisher: ${batch.publisher_name}`,
        `Language: ${langLabel(lang)}`,
        `Genre: ${project.genre}`,
        `Trim Size: 6" x 9" (White Paper, Bleed 0.125")`,
        `Estimated Pages: ${estimatedPages} | Spine Width: ${spineWidthInches}"`,
        `Chapters: ${chapterList.length}`,
        `Quality Score: ${slot.quality_score ?? 85}/100`,
        `Synopsis: ${project.synopsis}`
      ].join('\n');

      const folderUrl = await uploadToDriveBridge({
        title: project.title,
        author: project.pen_name,
        publisher: batch.publisher_name,
        language: lang,
        interiorHtml,
        ebookCoverSvg,
        paperbackCoverSvg,
        ...(ebookPngBase64 ? { ebookPngBase64 } : {}),
        ...(wrapPngBase64 ? { wrapPngBase64 } : {}),
        spineWidthInches,
        estimatedPages,
        metadataTxt
      });

      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slot.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'completed',
          drive_folder_url: folderUrl,
          last_error: null,
          updated_at: new Date().toISOString()
        })
      });

      const nextPassed = (batch.passed_count || 0) + 1;
      const reachedTarget = nextPassed >= (batch.target_passed || 3);

      await sbFetch(`cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          passed_count: nextPassed,
          status: reachedTarget ? 'completed' : 'running',
          updated_at: new Date().toISOString()
        })
      });

      await sendTelegramMessage(
        batch.telegram_chat_id,
        [
          `🎉 Novel Lolos Auditor & Terkirim (${nextPassed}/${batch.target_passed}): *${project.title}*`,
          `• Penulis: ${project.pen_name} | Penerbit: ${batch.publisher_name}`,
          `• Bahasa: ${langLabel(lang)} | Skor: ${slot.quality_score ?? 85}/100`,
          folderUrl
            ? `• Folder Google Drive: ${folderUrl}`
            : '• Folder Google Drive: Belum dikonfigurasi (DRIVE_UPLOAD_WEBHOOK_URL kosong)',
          reachedTarget ? '🏁 Target batch tercapai, batch selesai!' : '➡️ Melanjutkan ke novel berikutnya.'
        ].join('\n')
      );

      return NextResponse.json({
        ok: true,
        slot: slot.sequence_no,
        stage: 'completed',
        passedCount: nextPassed,
        folderUrl
      });
    }

    return NextResponse.json({ ok: true, skippedStage: slot.stage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (activeSlotId) {
      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(activeSlotId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          last_error: message,
          updated_at: new Date().toISOString()
        })
      }).catch(() => null);
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized worker trigger' }, { status: 401 });
  }

  let bodyData: Record<string, unknown> = {};
  try {
    bodyData = (await req.json()) as Record<string, unknown>;
  } catch {
    bodyData = {};
  }

  if (bodyData.action === 'delete_slot') {
    const slotNo = Number(bodyData.slot);
    const slotId = typeof bodyData.slotId === 'string' ? bodyData.slotId.trim() : '';
    const projectId = typeof bodyData.projectId === 'string' ? bodyData.projectId.trim() : '';

    let resolvedProjectId = projectId;
    if (!resolvedProjectId && slotId) {
      const rows = (await sbFetch(
        `cuannovel_queue?id=eq.${encodeURIComponent(slotId)}&limit=1`
      )) as Array<{ project_id?: string | null }>;
      resolvedProjectId = String(rows?.[0]?.project_id || '').trim();
    } else if (!resolvedProjectId && Number.isFinite(slotNo) && slotNo > 0) {
      const rows = (await sbFetch(
        `cuannovel_queue?sequence_no=eq.${slotNo}&order=id.desc&limit=1`
      )) as Array<{ project_id?: string | null }>;
      resolvedProjectId = String(rows?.[0]?.project_id || '').trim();
    }

    if (resolvedProjectId) {
      await purgeProjectCompletely(resolvedProjectId);
    }

    if (slotId) {
      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slotId)}`, {
        method: 'DELETE'
      }).catch(() => null);
    } else if (Number.isFinite(slotNo) && slotNo > 0) {
      await sbFetch(`cuannovel_queue?sequence_no=eq.${slotNo}`, {
        method: 'DELETE'
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      action: 'delete_slot',
      deletedSlot: Number.isFinite(slotNo) ? slotNo : null,
      deletedProjectId: resolvedProjectId || null
    });
  }

  if (bodyData.action === 'set_stage') {
    const slotNo = Number(bodyData.slot);
    const slotId = typeof bodyData.slotId === 'string' ? bodyData.slotId.trim() : '';
    const targetStage =
      typeof bodyData.stage === 'string' && bodyData.stage.trim()
        ? bodyData.stage.trim()
        : 'packaging_zip';

    if (slotId) {
      await sbFetch(`cuannovel_queue?id=eq.${encodeURIComponent(slotId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: targetStage,
          last_error: null,
          updated_at: new Date().toISOString()
        })
      });
    } else if (Number.isFinite(slotNo) && slotNo > 0) {
      await sbFetch(`cuannovel_queue?sequence_no=eq.${slotNo}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: targetStage,
          last_error: null,
          updated_at: new Date().toISOString()
        })
      });
    }

    return NextResponse.json({
      ok: true,
      action: 'set_stage',
      slot: Number.isFinite(slotNo) ? slotNo : null,
      stage: targetStage
    });
  }

  return runNextQueueStep(req);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized cron trigger' }, { status: 401 });
  }
  return runNextQueueStep(req);
}
