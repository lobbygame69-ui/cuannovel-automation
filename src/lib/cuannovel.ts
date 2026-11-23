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
