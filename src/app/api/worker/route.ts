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

  throw new Error('Semua provider AI teks gagal merespons (cek GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY).');
}

async function purgeProjectCompletely(projectId: string | null) {
  if (!projectId) return;
  await sbFetch(`chapters?project_id=eq.${encodeURIComponent(projectId)}`, { method: 'DELETE' }).catch(
    () => null
  );
  await sbFetch(`novel_settings?project_id=eq.${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  }).catch(() => null);
  await sbFetch(`projects?id=eq.${encodeURIComponent(projectId)}`, { method: 'DELETE' }).catch(
    () => null
  );
}

async function uploadToDriveBridge(payload: Record<string, unknown>): Promise<string | null> {
  const bridgeUrl = getEnv('DRIVE_UPLOAD_WEBHOOK_URL');
  const bridgeSecret = getEnv('DRIVE_BRIDGE_SECRET');
  if (!bridgeUrl) return null;

  const res = await fetch(bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: bridgeSecret,
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
  // sekitar 260 kata per halaman ukuran 6x9 inci
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

  // Lembar 1 = hlm 1, Balik Lembar 1 = hlm 2, Lembar 2 = hlm 3, Lembar 3 = hlm 4, Bab 1 mulai hlm 5
  let runningPage = 5;
  const tocEntries = sortedChapters.map((ch) => {
    const startPage = runningPage;
    const pagesUsed = estimateChapterPages(ch.content);
    runningPage += pagesUsed;
    const cleanTitle = cleanChapterTitle(ch.title, ch.chapter_number, isEn);
    const label = isEn ? `Chapter ${ch.chapter_number}: ${cleanTitle}` : `Bab ${ch.chapter_number}: ${cleanTitle}`;
    return {
      ch,
      cleanTitle,
      startPage,
      label
    };
  });

  const tocRows = tocEntries
    .map(
      (entry) =>
        `<div class="toc-row"><span class="toc-label">${escapeHtml(entry.label)}</span><span class="toc-dots"></span><span class="toc-page">${entry.startPage}</span></div>`
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
    .map(({ ch, cleanTitle, startPage }) => {
      const paragraphs = splitIntoParagraphs(ch.content)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('\n');
      const heading = isEn
        ? `Chapter ${ch.chapter_number}: ${escapeHtml(cleanTitle)}`
        : `Bab ${ch.chapter_number}: ${escapeHtml(cleanTitle)}`;
      return `
        <article class="book-sheet chapter-sheet" data-page="${startPage}">
          <div class="running-header">${escapeHtml(project.title)}</div>
          <div class="chapter-number-label">${isEn ? `CHAPTER ${ch.chapter_number}` : `BAB ${ch.chapter_number}`}</div>
          <h2 class="chapter-title">${escapeHtml(cleanTitle)}</h2>
          <div class="chapter-body">
            ${paragraphs}
          </div>
          <div class="running-footer">${startPage}</div>
        </article>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'id'}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(project.title)} — ${escapeHtml(project.pen_name)}</title>
<style>
  @page {
    size: 6in 9in;
    margin: 0.75in 0.75in 0.8in 0.75in;
  }

  * {
    box-sizing: border-box;
  }

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

  .book-sheet:first-child {
    break-before: auto;
    page-break-before: auto;
  }

  .book-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  @media print {
    body {
      background: #ffffff;
      padding: 0;
    }
    .book-sheet {
      width: auto;
      min-height: auto;
      margin: 0;
      padding: 0;
      box-shadow: none;
      break-after: auto;
      page-break-after: auto;
    }
    .running-header,
    .running-footer {
      display: none;
    }
  }

  .title-sheet {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    min-height: 7.4in;
  }

  .book-title-main {
    font-size: 24pt;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: 0.3px;
    margin: 0 0 18px 0;
    color: #0f172a;
  }

  .title-divider {
    width: 64px;
    height: 2px;
    background: #94a3b8;
    margin: 10px auto 18px auto;
  }

  .book-author-main {
    font-size: 13pt;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin: 0 0 8px 0;
    color: #1e293b;
  }

  .book-publisher-sub {
    font-size: 10pt;
    color: #64748b;
    margin-top: 6px;
  }

  .meta-heading,
  .section-heading {
    font-size: 15pt;
    font-weight: 700;
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
    color: #0f172a;
  }

  .chapter-number-label {
    font-size: 9pt;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 4px;
  }

  .chapter-title {
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.3;
    margin: 0 0 18px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid #e2e8f0;
    color: #0f172a;
  }

  p {
    font-size: 10.5pt;
    line-height: 1.72;
    margin: 0 0 9px 0;
    text-indent: 1.35em;
    text-align: justify;
  }

  p.no-indent {
    text-indent: 0;
    text-align: left;
    margin-bottom: 11px;
  }

  p.signature {
    text-indent: 0;
    text-align: left;
    font-style: italic;
    margin-top: 18px;
    font-weight: 600;
  }

  .toc-list {
    margin-top: 10px;
  }

  .toc-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px dotted #cbd5e1;
    font-size: 10.5pt;
  }

  .toc-label {
    flex: 1;
    color: #0f172a;
  }

  .toc-page {
    font-weight: 700;
    color: #334155;
    min-width: 28px;
    text-align: right;
  }

  .running-header {
    font-size: 8.5pt;
    color: #64748b;
    text-align: center;
    margin-bottom: 14px;
    letter-spacing: 0.4px;
  }

  .running-footer {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid #f1f5f9;
    text-align: center;
    font-size: 9.5pt;
    color: #475569;
  }
</style>
</head>
<body>
  <!-- Lembar 1: Halaman Judul & Penulis -->
  <section class="book-sheet title-sheet" data-page="1">
    <h1 class="book-title-main">${escapeHtml(project.title)}</h1>
    <div class="title-divider"></div>
    <div class="book-author-main">${escapeHtml(project.pen_name)}</div>
    <div class="book-publisher-sub">${escapeHtml(batch.publisher_name)}</div>
  </section>

  <!-- Balik Lembar 1: Copyright sesuai bahasa novel -->
  <section class="book-sheet" data-page="2">
    ${copyrightBlock}
  </section>

  <!-- Lembar 2: Ucapan Terima Kasih Pembuka -->
  <section class="book-sheet" data-page="3">
    ${openingAck}
  </section>

  <!-- Lembar 3: Daftar Isi & Nomor Halaman -->
  <section class="book-sheet" data-page="4">
    <div class="section-heading">${isEn ? 'Table of Contents' : 'Daftar Isi'}</div>
    <div class="toc-list">
      ${tocRows}
    </div>
  </section>

  <!-- Isi Bab Buku -->
  ${chapterHtml}

  <!-- Lembar Terakhir: Ucapan Terima Kasih untuk Pembaca -->
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

function buildFrontIllustrationSvg(x: number, y: number, w: number, h: number, idPrefix: string): string {
  const cx = x + Math.round(w * 0.5);
  const horizonY = y + Math.round(h * 0.62);
  const baseY = y + h;
  const lighthouseX = cx;
  const lighthouseTopY = horizonY - Math.round(h * 0.24);

  return `
    <g id="${idPrefix}-front-art">
      <defs>
        <linearGradient id="${idPrefix}-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#071326"/>
          <stop offset="55%" stop-color="#13294b"/>
          <stop offset="100%" stop-color="#29486b"/>
        </linearGradient>
        <linearGradient id="${idPrefix}-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f2942"/>
          <stop offset="100%" stop-color="#061220"/>
        </linearGradient>
        <radialGradient id="${idPrefix}-beam" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#fde68a" stop-opacity="0.72"/>
          <stop offset="55%" stop-color="#f59e0b" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="${idPrefix}-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#040b16" stop-opacity="0.82"/>
          <stop offset="35%" stop-color="#040b16" stop-opacity="0.38"/>
          <stop offset="72%" stop-color="#040b16" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#040b16" stop-opacity="0.88"/>
        </linearGradient>
      </defs>

      <!-- Langit & Laut Penuh -->
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${idPrefix}-sky)"/>
      <circle cx="${cx + Math.round(w * 0.22)}" cy="${y + Math.round(h * 0.2)}" r="${Math.round(w * 0.075)}" fill="#fef3c7" opacity="0.85"/>

      <!-- Cahaya Suar Mercusuar -->
      <ellipse cx="${lighthouseX}" cy="${lighthouseTopY + 24}" rx="${Math.round(w * 0.44)}" ry="${Math.round(h * 0.14)}" fill="url(#${idPrefix}-beam)"/>

      <!-- Lautan & Ombak -->
      <rect x="${x}" y="${horizonY}" width="${w}" height="${baseY - horizonY}" fill="url(#${idPrefix}-sea)"/>
      <path d="M ${x} ${horizonY + 28} Q ${cx - Math.round(w * 0.25)} ${horizonY - 12}, ${cx} ${horizonY + 24} T ${x + w} ${horizonY + 22} L ${x + w} ${baseY} L ${x} ${baseY} Z" fill="#173a5e" opacity="0.65"/>
      <path d="M ${x} ${horizonY + Math.round(h * 0.11)} Q ${cx - Math.round(w * 0.2)} ${horizonY + Math.round(h * 0.07)}, ${cx} ${horizonY + Math.round(h * 0.12)} T ${x + w} ${horizonY + Math.round(h * 0.11)} L ${x + w} ${baseY} L ${x} ${baseY} Z" fill="#0b1f33" opacity="0.8"/>

      <!-- Tebing Batu & Siluet Mercusuar -->
      <polygon points="${x},${baseY} ${x},${horizonY - 18} ${cx - Math.round(w * 0.16)},${horizonY + 12} ${cx + Math.round(w * 0.2)},${horizonY + 48} ${x + w},${horizonY + 24} ${x + w},${baseY}" fill="#09111e"/>
      <polygon points="${lighthouseX - 34},${horizonY + 8} ${lighthouseX + 34},${horizonY + 8} ${lighthouseX + 18},${lighthouseTopY + 34} ${lighthouseX - 18},${lighthouseTopY + 34}" fill="#e2e8f0" opacity="0.9"/>
      <rect x="${lighthouseX - 24}" y="${lighthouseTopY + 10}" width="48" height="24" rx="4" fill="#fde047"/>
      <polygon points="${lighthouseX - 28},${lighthouseTopY + 10} ${lighthouseX},${lighthouseTopY - 22} ${lighthouseX + 28},${lighthouseTopY + 10}" fill="#0f172a"/>

      <!-- Gradasi pelindung kontras agar judul & nama penulis jelas terbaca -->
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${idPrefix}-scrim)"/>
    </g>
  `;
}

function buildBackIllustrationSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  idPrefix: string,
  barcodeX: number,
  barcodeY: number,
  barcodeW: number,
  barcodeH: number
): string {
  const cx = x + Math.round(w * 0.5);
  const horizonY = y + Math.round(h * 0.68);
  const baseY = y + h;

  return `
    <g id="${idPrefix}-back-art">
      <defs>
        <linearGradient id="${idPrefix}-back-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0b172a"/>
          <stop offset="60%" stop-color="#172c46"/>
          <stop offset="100%" stop-color="#1e354f"/>
        </linearGradient>
        <linearGradient id="${idPrefix}-back-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#050c17" stop-opacity="0.86"/>
          <stop offset="100%" stop-color="#050c17" stop-opacity="0.76"/>
        </linearGradient>
      </defs>

      <!-- Latar panorama senja & pantai (komplementer, berbeda dari cover depan) -->
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${idPrefix}-back-sky)"/>
      <circle cx="${x + Math.round(w * 0.24)}" cy="${y + Math.round(h * 0.22)}" r="${Math.round(w * 0.055)}" fill="#fcd34d" opacity="0.45"/>

      <!-- Siluet perahu & riak air di bagian bawah -->
      <rect x="${x}" y="${horizonY}" width="${w}" height="${baseY - horizonY}" fill="#071526"/>
      <path d="M ${x + Math.round(w * 0.18)} ${horizonY + 18} Q ${cx} ${horizonY + 42}, ${x + Math.round(w * 0.78)} ${horizonY + 14} L ${x + Math.round(w * 0.68)} ${horizonY + 44} L ${x + Math.round(w * 0.28)} ${horizonY + 44} Z" fill="#0f172a" opacity="0.9"/>
      <path d="M ${x} ${horizonY + 75} Q ${cx} ${horizonY + 55}, ${x + w} ${horizonY + 78} L ${x + w} ${baseY} L ${x} ${baseY} Z" fill="#040b14"/>

      <!-- Panel gelap lembut di area teks sinopsis agar tulisan mudah dibaca -->
      <rect x="${x + 120}" y="${y + 240}" width="${w - 240}" height="${Math.round(h * 0.45)}" rx="24" fill="url(#${idPrefix}-back-panel)" stroke="#fbbf24" stroke-opacity="0.28" stroke-width="3"/>

      <!-- Ruang aman Barcode ISBN KDP (2.0" x 1.2") -->
      <rect x="${barcodeX}" y="${barcodeY}" width="${barcodeW}" height="${barcodeH}" rx="12" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
    </g>
  `;
}

function buildKdpCoverSvgs(
  project: ProjectRow,
  batch: CuanNovelBatch,
  chapters: ChapterRow[]
): {
  ebookCoverSvg: string;
  paperbackCoverSvg: string;
  spineWidthInches: number;
  estimatedPages: number;
} {
  const dpi = 300;
  const trimW = 6;
  const trimH = 9;
  const bleed = 0.125;

  const estimatedPages = estimateTotalPages(chapters);
  const spineWidthInches = Number(Math.max(0.25, estimatedPages * 0.002252).toFixed(3));

  const fullWIn = Number((bleed + trimW + spineWidthInches + trimW + bleed).toFixed(3));
  const fullHIn = Number((bleed + trimH + bleed).toFixed(3));

  const fullW = Math.round(fullWIn * dpi);
  const fullH = Math.round(fullHIn * dpi);
  const bleedPx = Math.round(bleed * dpi);
  const trimWPx = Math.round(trimW * dpi);
  const spinePx = Math.round(spineWidthInches * dpi);

  const backX = bleedPx;
  const spineX = bleedPx + trimWPx;
  const frontX = spineX + spinePx;

  const titleLines = wrapSvgLines(project.title, 18, 4);
  const synopsisLines = wrapSvgLines(project.synopsis, 40, 13);

  const titleSvgFront = titleLines
    .map(
      (line, i) =>
        `<text x="${frontX + Math.round(trimWPx / 2)}" y="${580 + i * 132}" text-anchor="middle" font-family="Georgia, serif" font-size="112" font-weight="bold" fill="#ffffff">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const synopsisSvgBack = synopsisLines
    .map(
      (line, i) =>
        `<text x="${backX + 170}" y="${420 + i * 64}" font-family="Georgia, serif" font-size="42" fill="#f1f5f9">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookTitleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="800" y="${590 + i * 128}" text-anchor="middle" font-family="Georgia, serif" font-size="108" font-weight="bold" fill="#ffffff">${escapeHtml(line)}</text>`
    )
    .join('\n');

  const ebookCoverSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  ${buildFrontIllustrationSvg(0, 0, 1600, 2560, 'eb')}
  <rect x="76" y="76" width="1448" height="2408" fill="none" stroke="#fbbf24" stroke-width="4" opacity="0.55"/>
  <text x="800" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="6" fill="#fde68a">${escapeHtml((project.genre || 'NOVEL').toUpperCase())}</text>
  ${ebookTitleSvg}
  <text x="800" y="2290" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="bold" fill="#fbbf24">${escapeHtml(project.pen_name)}</text>
</svg>`;

  const barcodeW = Math.round(2.0 * dpi); // 600 px (2.0")
  const barcodeH = Math.round(1.2 * dpi); // 360 px (1.2")
  const barcodeX = spineX - 135 - barcodeW;
  const barcodeY = fullH - bleedPx - 135 - barcodeH;

  const spineCenterX = spineX + Math.round(spinePx / 2);
  const spineCenterY = Math.round(fullH / 2);

  const paperbackCoverSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}" viewBox="0 0 ${fullW} ${fullH}">
  <!-- Sisi Belakang (Kiri): ilustrasi komplementer + sinopsis + ruang barcode -->
  ${buildBackIllustrationSvg(backX, bleedPx, trimWPx, trimH * dpi, 'pb', barcodeX, barcodeY, barcodeW, barcodeH)}

  <!-- Punggung Buku / Spine (Tengah) -->
  <rect x="${spineX}" y="0" width="${spinePx}" height="${fullH}" fill="#091526"/>

  <!-- Sisi Depan (Kanan): ilustrasi penuh adegan cerita + judul + penulis -->
  ${buildFrontIllustrationSvg(frontX, bleedPx, trimWPx, trimH * dpi, 'pb')}

  <!-- Perpanjangan bleed luar seluruh kanvas -->
  <rect x="0" y="0" width="${fullW}" height="${bleedPx}" fill="#071326" opacity="0.95"/>
  <rect x="0" y="${fullH - bleedPx}" width="${fullW}" height="${bleedPx}" fill="#061220" opacity="0.95"/>
  <rect x="0" y="${bleedPx}" width="${bleedPx}" height="${trimH * dpi}" fill="#0b172a" opacity="0.95"/>
  <rect x="${fullW - bleedPx}" y="${bleedPx}" width="${bleedPx}" height="${trimH * dpi}" fill="#071326" opacity="0.95"/>

  <!-- Garis lipatan spine halus -->
  <line x1="${spineX}" y1="0" x2="${spineX}" y2="${fullH}" stroke="#94a3b8" stroke-width="2" opacity="0.4"/>
  <line x1="${frontX}" y1="0" x2="${frontX}" y2="${fullH}" stroke="#94a3b8" stroke-width="2" opacity="0.4"/>

  <!-- Konten Sampul Belakang -->
  <text x="${backX + 170}" y="335" font-family="Georgia, serif" font-size="54" font-weight="bold" fill="#fbbf24">${escapeHtml(project.title)}</text>
  ${synopsisSvgBack}
  <text x="${backX + 170}" y="${fullH - bleedPx - 210}" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#e2e8f0">${escapeHtml(batch.publisher_name)}</text>

  <!-- Teks Spine -->
  ${
    spineWidthInches >= 0.35
      ? `<g transform="translate(${spineCenterX}, ${spineCenterY}) rotate(90)">
          <text x="0" y="13" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="bold" fill="#f8fafc">${escapeHtml(project.title)} — ${escapeHtml(project.pen_name)}</text>
        </g>`
      : ''
  }

  <!-- Konten Sampul Depan -->
  <rect x="${frontX + 110}" y="${bleedPx + 110}" width="${trimWPx - 220}" height="${trimH * dpi - 220}" fill="none" stroke="#fbbf24" stroke-width="4" opacity="0.55"/>
  <text x="${frontX + Math.round(trimWPx / 2)}" y="${bleedPx + 275}" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" letter-spacing="6" fill="#fde68a">${escapeHtml((project.genre || 'NOVEL').toUpperCase())}</text>
  ${titleSvgFront}
  <text x="${frontX + Math.round(trimWPx / 2)}" y="${fullH - bleedPx - 245}" text-anchor="middle" font-family="Georgia, serif" font-size="66" font-weight="bold" fill="#fbbf24">${escapeHtml(project.pen_name)}</text>
</svg>`;

  return {
    ebookCoverSvg,
    paperbackCoverSvg,
    spineWidthInches,
    estimatedPages
  };
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = getEnv('CRON_SECRET');
    if (cronSecret) {
      const auth = req.headers.get('authorization') || '';
      const qSecret = req.nextUrl.searchParams.get('secret') || '';
      if (auth !== `Bearer ${cronSecret}` && qSecret !== cronSecret) {
        return NextResponse.json({ ok: false, error: 'Unauthorized worker trigger' }, { status: 401 });
      }
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

    if (slot.stage === 'packaging_zip' || slot.stage === 'cover_generation') {
      const projects = (await sbFetch(
        `projects?id=eq.${encodeURIComponent(slot.project_id || '')}&limit=1`
      )) as ProjectRow[];
      const chapters = (await sbFetch(
        `chapters?project_id=eq.${encodeURIComponent(slot.project_id || '')}&order=chapter_number.asc`
      )) as ChapterRow[];

      const project = projects[0];
      const chapterList = Array.isArray(chapters) ? chapters : [];
      const interiorHtml = buildInteriorHtml(project, batch, chapterList);
      const {
        ebookCoverSvg,
        paperbackCoverSvg,
        spineWidthInches,
        estimatedPages
      } = buildKdpCoverSvgs(project, batch, chapterList);

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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
