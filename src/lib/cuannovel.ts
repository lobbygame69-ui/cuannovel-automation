export interface CuanNovelBatch {
  id: string;
  user_id: string;
  telegram_chat_id: string;
  author_name: string;
  publisher_name: string;
  language: 'id' | 'en' | string;
  target_passed: number;
  passed_count: number;
  deleted_count: number;
  total_attempts: number;
  max_attempts: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CuanNovelQueueItem {
  id: string;
  batch_id: string;
  user_id: string;
  project_id: string | null;
  sequence_no: number;
  stage: string;
  revision_count: number;
  max_revisions: number;
  target_chapters: number;
  current_chapter: number;
  chapter_retry_count: number;
  quality_score: number | null;
  curator_feedback: string | null;
  drive_folder_url: string | null;
  last_error: string | null;
}

export interface AuditChapterItem {
  chapterNumber: number;
  wordCount: number;
  hasError?: boolean;
}

export interface NovelAuditResult {
  passed: boolean;
  reason: string;
  checkedChapters: number;
  minWordsRequired: number;
  retryChapterNumber?: number;
}

export interface InteriorChapterInput {
  number?: number;
  title?: string;
  content?: string;
}

export interface BuildInteriorHtmlParams {
  title: string;
  subtitle?: string;
  author?: string;
  publisher?: string;
  language?: string;
  chapters: InteriorChapterInput[];
}

export interface DrivePackagePayload {
  title: string;
  author?: string;
  publisher?: string;
  language?: string;
  ebookCoverSvg?: string;
  paperbackCoverSvg?: string;
  ebookPngBase64?: string;
  wrapPngBase64?: string;
  interiorHtml?: string;
  metadataTxt?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getEnv(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

export function resolveUserId(rawUserId?: string | null): string {
  const candidate = String(rawUserId || '').trim() || getEnv('DEFAULT_USER_ID');
  if (!candidate) {
    throw new Error('DEFAULT_USER_ID belum diatur di Environment Variables.');
  }
  if (!UUID_REGEX.test(candidate)) {
    throw new Error(`DEFAULT_USER_ID tidak berformat UUID valid: "${candidate}"`);
  }
  return candidate;
}

export function normalizeLang(raw?: string | null): 'id' | 'en' {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'en' || v === 'inggris' || v === 'english') return 'en';
  return 'id';
}

export function langLabel(lang?: string | null): string {
  return normalizeLang(lang) === 'en' ? 'Inggris (EN)' : 'Indonesia (ID)';
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatChapterParagraphs(rawContent: string): string {
  return String(rawContent || '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/**
 * Membangun HTML interior siap unggah ke Amazon KDP eBook & Paperback
 * dengan Table of Contents (TOC) interaktif agar tidak memicu "Missing Table of Contents".
 */
export function buildKdpReadyInteriorHtml(params: BuildInteriorHtmlParams): string {
  const title = String(params.title || 'Untitled Novel').trim();
  const subtitle = String(params.subtitle || '').trim();
  const author = String(params.author || getEnv('DEFAULT_AUTHOR_NAME') || 'M. F. JULIAN').trim();
  const publisher = String(
    params.publisher || getEnv('DEFAULT_PUBLISHER_NAME') || 'cuannovelkarya'
  ).trim();
  const lang = normalizeLang(params.language || getEnv('DEFAULT_LANGUAGE'));
  const year = new Date().getFullYear();

  const tocHeading = lang === 'id' ? 'Daftar Isi' : 'Table of Contents';
  const chapterPrefix = lang === 'id' ? 'Bab' : 'Chapter';
  const copyrightText =
    lang === 'id'
      ? `Hak Cipta © ${year} oleh ${escapeHtml(author)}. Diterbitkan oleh ${escapeHtml(publisher)}. Seluruh hak cipta dilindungi undang-undang.`
      : `Copyright © ${year} by ${escapeHtml(author)}. Published by ${escapeHtml(publisher)}. All rights reserved.`;
  const fictionDisclaimer =
    lang === 'id'
      ? 'Karya ini merupakan cerita fiksi. Nama tokoh, tempat, dan peristiwa adalah hasil rekaan penulis.'
      : 'This is a work of fiction. Names, characters, places, and incidents are products of the author’s imagination.';

  const normalizedChapters = (params.chapters || []).map((ch, idx) => {
    const num = Number(ch.number) > 0 ? Number(ch.number) : idx + 1;
    const chTitle = String(ch.title || `${chapterPrefix} ${num}`).trim();
    const anchorId = `chapter-${num}`;
    return {
      anchorId,
      num,
      tocLabel: `${chapterPrefix} ${num}: ${chTitle}`,
      headingText: chTitle,
      paragraphsHtml: formatChapterParagraphs(ch.content || '')
    };
  });

  const tocItemsHtml = normalizedChapters
    .map((ch) => `<li><a href="#${ch.anchorId}">${escapeHtml(ch.tocLabel)}</a></li>`)
    .join('\n');

  const chaptersSectionHtml = normalizedChapters
    .map(
      (ch) => `
    <section class="chapter" id="${ch.anchorId}">
      <div class="chapter-number">${escapeHtml(chapterPrefix.toUpperCase())} ${ch.num}</div>
      <h1>${escapeHtml(ch.headingText)}</h1>
      <div class="chapter-content">
        ${ch.paragraphsHtml}
      </div>
    </section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.65;
      color: #111827;
      margin: 0;
      padding: 0;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
    }
    .title-page {
      text-align: center;
      padding-top: 20%;
    }
    .book-title {
      font-size: 2.1em;
      font-weight: bold;
      margin-bottom: 0.4em;
    }
    .book-subtitle {
      font-size: 1.15em;
      font-style: italic;
      color: #4b5563;
      margin-bottom: 2em;
    }
    .book-author {
      font-size: 1.2em;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 2em;
    }
    .book-publisher {
      font-size: 0.95em;
      color: #6b7280;
      margin-top: 3em;
    }
    .copyright-page {
      page-break-before: always;
      break-before: page;
      padding-top: 40%;
      font-size: 0.9em;
      color: #374151;
    }
    .toc-page {
      page-break-before: always;
      break-before: page;
    }
    .toc-page h1 {
      text-align: center;
      font-size: 1.6em;
      margin-bottom: 1.2em;
    }
    .toc-list {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }
    .toc-list li {
      margin-bottom: 0.65em;
      border-bottom: 1px dotted #d1d5db;
      padding-bottom: 0.25em;
    }
    .toc-list a {
      text-decoration: none;
      color: #111827;
    }
    .chapter {
      page-break-before: always;
      break-before: page;
    }
    .chapter-number {
      text-align: center;
      font-size: 0.85em;
      letter-spacing: 0.14em;
      color: #6b7280;
      margin-top: 1.5em;
    }
    .chapter h1 {
      text-align: center;
      font-size: 1.55em;
      margin-top: 0.3em;
      margin-bottom: 1.4em;
    }
    .chapter-content p {
      text-indent: 1.5em;
      margin: 0 0 0.75em 0;
      text-align: justify;
    }
    .chapter-content p:first-of-type {
      text-indent: 0;
    }
  </style>
</head>
<body>
  <section class="title-page">
    <div class="book-title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="book-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    <div class="book-author">${escapeHtml(author)}</div>
    <div class="book-publisher">${escapeHtml(publisher)}</div>
  </section>

  <section class="copyright-page">
    <p>${copyrightText}</p>
    <p>${fictionDisclaimer}</p>
  </section>

  <nav class="toc-page" id="toc" epub:type="toc" role="doc-toc">
    <h1>${escapeHtml(tocHeading)}</h1>
    <ol class="toc-list">
      ${tocItemsHtml}
    </ol>
  </nav>

  ${chaptersSectionHtml}
</body>
</html>`;
}

/**
 * Mengirim paket naskah, cover, dan metadata ke Google Apps Script webhook.
 */
export async function uploadPackageToDrive(payload: DrivePackagePayload) {
  const webhookUrl =
    getEnv('DRIVE_UPLOAD_WEBHOOK_URL') ||
    getEnv('DRIVE_WEBHOOK_URL') ||
    getEnv('DRIVE_BRIDGE_URL');

  if (!webhookUrl) {
    throw new Error('DRIVE_UPLOAD_WEBHOOK_URL kosong');
  }

  const secret = getEnv('DRIVE_BRIDGE_SECRET');
  const body = {
    ...payload,
    author: payload.author || getEnv('DEFAULT_AUTHOR_NAME') || 'M. F. JULIAN',
    publisher: payload.publisher || getEnv('DEFAULT_PUBLISHER_NAME') || 'cuannovelkarya',
    language: normalizeLang(payload.language || getEnv('DEFAULT_LANGUAGE')),
    ...(secret ? { secret } : {})
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const text = await res.text().catch(() => '');
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // biarkan teks apa adanya
  }

  if (!res.ok) {
    throw new Error(`Upload Drive gagal (${res.status}): ${text}`);
  }

  return parsed;
}

export function auditNovelBeforePackaging(params: {
  chapters: AuditChapterItem[];
  targetChapters: number;
  minWordsPerChapter?: number;
  qualityScore?: number | null;
  minQualityScore?: number;
}): NovelAuditResult {
  const minWords = params.minWordsPerChapter ?? 1000;
  const target = Math.max(1, params.targetChapters);
  const minScore = params.minQualityScore ?? 80;

  if (params.chapters.length < target) {
    return {
      passed: false,
      reason: `Bab baru ${params.chapters.length}/${target} selesai. Belum lolos ke Packaging Paket.`,
      checkedChapters: params.chapters.length,
      minWordsRequired: minWords,
      retryChapterNumber: params.chapters.length + 1
    };
  }

  for (const ch of params.chapters) {
    if (ch.hasError) {
      return {
        passed: false,
        reason: `Bab ${ch.chapterNumber} memiliki error. Mengulang otomatis sebelum Packaging Paket.`,
        checkedChapters: params.chapters.length,
        minWordsRequired: minWords,
        retryChapterNumber: ch.chapterNumber
      };
    }
    if (ch.wordCount < minWords) {
      return {
        passed: false,
        reason: `Bab ${ch.chapterNumber} hanya ${ch.wordCount} kata (<${minWords} kata). Mengulang otomatis.`,
        checkedChapters: params.chapters.length,
        minWordsRequired: minWords,
        retryChapterNumber: ch.chapterNumber
      };
    }
  }

  if (typeof params.qualityScore === 'number' && params.qualityScore < minScore) {
    return {
      passed: false,
      reason: `Skor kualitas ${params.qualityScore} (<${minScore}). Perlu perbaikan sebelum Packaging Paket.`,
      checkedChapters: params.chapters.length,
      minWordsRequired: minWords
    };
  }

  return {
    passed: true,
    reason: `Lolos audit (${params.chapters.length}/${target} bab, semua ≥ ${minWords} kata). Siap masuk Packaging Paket.`,
    checkedChapters: params.chapters.length,
    minWordsRequired: minWords
  };
}

export function extractShortChapterInfo(errorText?: string | null): {
  chapter?: number;
  words?: number;
  isTooShort: boolean;
} {
  if (!errorText) return { isTooShort: false };
  const match = errorText.match(/Bab\s+(\d+)\s+hanya\s+(\d+)\s+kata/i);
  if (match) {
    return {
      chapter: Number(match[1]),
      words: Number(match[2]),
      isTooShort: true
    };
  }
  return {
    isTooShort: /<\s*1[.,]?000\s*kata|mengulang otomatis/i.test(errorText)
  };
}

export function buildRetryChapterInstruction(params: {
  chapterNumber: number;
  previousWords?: number;
  minWords?: number;
  language?: 'id' | 'en' | string;
}): string {
  const minWords = params.minWords ?? 1000;
  const lang = normalizeLang(params.language);
  const prevNote =
    typeof params.previousWords === 'number'
      ? `Percobaan sebelumnya untuk Bab ${params.chapterNumber} hanya menghasilkan ${params.previousWords} kata sehingga ditolak. `
      : '';

  if (lang === 'en') {
    return `${prevNote}Write a complete, rich novel chapter ${params.chapterNumber} with at least ${minWords} words (target 1,150–1,450 words) using full dialogue, sensory details, action, and internal conflict without summarizing.`;
  }
  return `${prevNote}Tulis naskah penuh Bab ${params.chapterNumber} dengan panjang minimal ${minWords} kata (target 1.150–1.450 kata) lewat dialog hidup, detail suasana, aksi nyata, dan konflik batin yang utuh tanpa merangkum.`;
}

export async function sbFetch(path: string, init: RequestInit = {}) {
  const baseUrl = getEnv('SUPABASE_URL')
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/+$/, '');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!baseUrl || !serviceKey) {
    console.error('[sbFetch] Missing env:', {
      hasUrl: Boolean(baseUrl),
      hasServiceKey: Boolean(serviceKey)
    });
    throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur.');
  }

  const headers = new Headers(init.headers || {});
  headers.set('apikey', serviceKey);
  headers.set('Authorization', `Bearer ${serviceKey}`);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Prefer')) {
    headers.set('Prefer', 'return=representation');
  }

  const cleanPath = path.replace(/^\/+/, '');
  const url = `${baseUrl}/rest/v1/${cleanPath}`;

  const res = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store'
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error('[sbFetch] Error response:', {
      path: cleanPath,
      method: init.method || 'GET',
      status: res.status,
      data
    });
    throw new Error(
      `Supabase error (${res.status}) on ${cleanPath}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

export async function createDraftBatch(params: {
  chatId: string | number;
  userId?: string | null;
  authorName?: string;
  publisherName?: string;
  language?: 'id' | 'en' | string;
  targetPassed?: number;
  maxAttempts?: number;
}): Promise<CuanNovelBatch> {
  const userId = resolveUserId(params.userId);
  const nowIso = new Date().toISOString();

  const body = {
    user_id: userId,
    telegram_chat_id: String(params.chatId),
    author_name: (params.authorName || 'M. F. JULIAN').trim(),
    publisher_name: (params.publisherName || 'cuannovelkarya').trim(),
    language: normalizeLang(params.language),
    target_passed:
      Number.isFinite(params.targetPassed) && Number(params.targetPassed) > 0
        ? Number(params.targetPassed)
        : 2,
    passed_count: 0,
    deleted_count: 0,
    total_attempts: 0,
    max_attempts:
      Number.isFinite(params.maxAttempts) && Number(params.maxAttempts) > 0
        ? Number(params.maxAttempts)
        : 10,
    status: 'draft',
    created_at: nowIso,
    updated_at: nowIso
  };

  const rows = (await sbFetch('cuannovel_batches', {
    method: 'POST',
    body: JSON.stringify(body)
  })) as CuanNovelBatch[] | null;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Insert ke cuannovel_batches tidak mengembalikan data batch.');
  }

  return rows[0];
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: Record<string, unknown>
) {
  const token = getEnv('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.error('[sendTelegramMessage] TELEGRAM_BOT_TOKEN kosong');
    throw new Error('TELEGRAM_BOT_TOKEN belum diatur.');
  }

  const payload: Record<string, unknown> = {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !(json as { ok?: boolean }).ok) {
    console.error('[sendTelegramMessage] Failed:', {
      chatId: String(chatId),
      status: res.status,
      json
    });
    throw new Error(`Telegram sendMessage gagal: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function answerCallbackQuery(callbackQueryId: string, text = 'Diproses') {
  const token = getEnv('TELEGRAM_BOT_TOKEN');
  if (!token || !callbackQueryId) return;

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text
    }),
    cache: 'no-store'
  }).catch((err) => {
    console.error('[answerCallbackQuery] Failed:', err);
  });
}

export function buildConfirmationKeyboard(batchId: string) {
  return {
    inline_keyboard: [
      [
        { text: '🚀 Mulai (Target 2)', callback_data: `start:2:${batchId}` },
        { text: '🚀 Mulai (Target 3)', callback_data: `start:3:${batchId}` }
      ],
      [
        { text: '🇮🇩 Bahasa ID', callback_data: `lang:id:${batchId}` },
        { text: '🇬🇧 Bahasa EN', callback_data: `lang:en:${batchId}` }
      ],
      [
        { text: '🛑 Batal / Stop', callback_data: `stop:${batchId}` }
      ]
    ]
  };
}

export function formatBatchSummary(batch: CuanNovelBatch): string {
  return [
    '📚 *CUANNOVEL — KONFIRMASI BATCH*',
    `• Penulis: ${batch.author_name}`,
    `• Penerbit: ${batch.publisher_name}`,
    `• Bahasa: ${langLabel(batch.language)}`,
    `• Target Lolos: ${batch.target_passed} novel (min. 20 bab, ≥1.000 kata/bab, skor ≥80)`,
    '',
    'Ubah cepat via teks:',
    'penulis: M. F. JULIAN | penerbit: cuannovelkarya | bahasa: id',
    'atau tekan tombol di bawah untuk memulai.'
  ].join('\n');
}
