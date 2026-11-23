import { NextRequest, NextResponse } from 'next/server';
import {
  answerCallbackQuery,
  buildConfirmationKeyboard,
  CuanNovelBatch,
  CuanNovelQueueItem,
  formatBatchSummary,
  getEnv,
  langLabel,
  normalizeLang,
  sbFetch,
  sendTelegramMessage
} from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';

async function getLatestBatchForChat(chatId: string): Promise<CuanNovelBatch | null> {
  const rows = (await sbFetch(
    `cuannovel_batches?telegram_chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc&limit=1`
  )) as CuanNovelBatch[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function createDraftBatch(chatId: string, overrideLang?: 'id' | 'en'): Promise<CuanNovelBatch> {
  const userId = getEnv('DEFAULT_USER_ID');
  if (!userId) {
    throw new Error('DEFAULT_USER_ID belum diatur.');
  }

  const defaultAuthor = getEnv('DEFAULT_AUTHOR_NAME', 'M. F. JULIAN');
  const defaultPublisher = getEnv('DEFAULT_PUBLISHER_NAME', 'cuannovelkarya');
  const language = overrideLang || normalizeLang(getEnv('DEFAULT_LANGUAGE', 'id'));

  const inserted = (await sbFetch('cuannovel_batches', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      telegram_chat_id: chatId,
      author_name: defaultAuthor,
      publisher_name: defaultPublisher,
      language,
      target_passed: 3,
      passed_count: 0,
      deleted_count: 0,
      total_attempts: 0,
      max_attempts: 10,
      status: 'awaiting_confirmation'
    })
  })) as CuanNovelBatch[];

  return inserted[0];
}

async function seedQueueSlots(batch: CuanNovelBatch, count: number) {
  const existing = (await sbFetch(
    `cuannovel_queue?batch_id=eq.${encodeURIComponent(batch.id)}&select=id,sequence_no`
  )) as CuanNovelQueueItem[];

  if (Array.isArray(existing) && existing.length > 0) return;

  const slots = Array.from({ length: count }, (_, idx) => ({
    batch_id: batch.id,
    user_id: batch.user_id,
    project_id: null,
    sequence_no: idx + 1,
    stage: 'scout_research',
    revision_count: 0,
    max_revisions: 2,
    target_chapters: 20,
    current_chapter: 0,
    chapter_retry_count: 0
  }));

  await sbFetch('cuannovel_queue', {
    method: 'POST',
    body: JSON.stringify(slots)
  });
}

async function handleStartBatch(chatId: string, batch: CuanNovelBatch, targetPassed: number) {
  const safeTarget = targetPassed === 2 ? 2 : 3;
  const maxAttempts = Math.max(safeTarget * 3 + 2, 8);

  const updatedRows = (await sbFetch(
    `cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        target_passed: safeTarget,
        max_attempts: maxAttempts,
        status: 'running',
        updated_at: new Date().toISOString()
      })
    }
  )) as CuanNovelBatch[];

  const activeBatch = updatedRows[0] || { ...batch, target_passed: safeTarget, status: 'running' };
  await seedQueueSlots(activeBatch, Math.max(safeTarget + 2, 4));

  await sendTelegramMessage(
    chatId,
    [
      '✅ *Batch CuanNovel Diaktifkan!*',
      `• Batch ID: ${activeBatch.id.slice(0, 8)}`,
      `• Penulis: ${activeBatch.author_name}`,
      `• Penerbit: ${activeBatch.publisher_name}`,
      `• Bahasa: ${langLabel(activeBatch.language)}`,
      `• Target Lolos: ${safeTarget} novel`,
      '',
      'Slot #1 masuk antrean Market Trend Scout dan akan diproses otomatis oleh worker terjadwal.'
    ].join('\n')
  );
}

async function handleStopBatch(chatId: string) {
  const activeRows = (await sbFetch(
    `cuannovel_batches?telegram_chat_id=eq.${encodeURIComponent(chatId)}&status=in.(running,awaiting_confirmation)&order=created_at.desc`
  )) as CuanNovelBatch[];

  if (!Array.isArray(activeRows) || activeRows.length === 0) {
    await sendTelegramMessage(chatId, 'ℹ️ Tidak ada batch CuanNovel yang sedang berjalan saat ini.');
    return;
  }

  for (const row of activeRows) {
    await sbFetch(`cuannovel_batches?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'stopped',
        updated_at: new Date().toISOString()
      })
    });
  }

  await sendTelegramMessage(
    chatId,
    `🛑 Proses cuannovel (${activeRows.length} batch aktif) berhasil dihentikan.`
  );
}

async function handleStatusBatch(chatId: string) {
  const batch = await getLatestBatchForChat(chatId);
  if (!batch) {
    await sendTelegramMessage(
      chatId,
      '📊 Belum ada batch CuanNovel tercatat. Kirim /cuannovel untuk membuat batch baru.'
    );
    return;
  }

  const queueRows = (await sbFetch(
    `cuannovel_queue?batch_id=eq.${encodeURIComponent(batch.id)}&order=sequence_no.asc`
  )) as CuanNovelQueueItem[];

  const activeSlot =
    queueRows.find((q) => q.stage !== 'completed' && q.stage !== 'failed_purged') || null;

  const lines = [
    '📊 *STATUS CUANNOVEL*',
    `• Batch: ${batch.status} (${batch.id.slice(0, 8)})`,
    `• Penulis: ${batch.author_name}`,
    `• Penerbit: ${batch.publisher_name}`,
    `• Bahasa: ${langLabel(batch.language)}`,
    `• Lolos: ${batch.passed_count}/${batch.target_passed} | Percobaan: ${batch.total_attempts}/${batch.max_attempts} | Gagal dihapus: ${batch.deleted_count}`
  ];

  if (activeSlot) {
    lines.push(
      `• Slot Aktif: #${activeSlot.sequence_no} • Tahap: ${activeSlot.stage} • Bab: ${activeSlot.current_chapter}/${activeSlot.target_chapters} • Revisi: ${activeSlot.revision_count}/${activeSlot.max_revisions}`
    );
    if (activeSlot.last_error) {
      lines.push(`• Catatan Error Terakhir: ${activeSlot.last_error.slice(0, 180)}`);
    }
  } else {
    lines.push('• Slot Aktif: Tidak ada slot berjalan');
  }

  await sendTelegramMessage(chatId, lines.join('\n'));
}

async function parseAndApplyMetaEdit(chatId: string, text: string): Promise<boolean> {
  if (!text.toLowerCase().includes('penulis:') && !text.toLowerCase().includes('penerbit:') && !text.toLowerCase().includes('bahasa:')) {
    return false;
  }

  let batch = await getLatestBatchForChat(chatId);
  if (!batch || (batch.status !== 'awaiting_confirmation' && batch.status !== 'running')) {
    batch = await createDraftBatch(chatId);
  }

  const parts = text.split('|').map((p) => p.trim());
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.startsWith('penulis:')) {
      const val = part.slice('penulis:'.length).trim();
      if (val) patch.author_name = val;
    } else if (lower.startsWith('penerbit:')) {
      const val = part.slice('penerbit:'.length).trim();
      if (val) patch.publisher_name = val;
    } else if (lower.startsWith('bahasa:')) {
      const val = part.slice('bahasa:'.length).trim();
      if (val) patch.language = normalizeLang(val);
    }
  }

  const updated = (await sbFetch(
    `cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }
  )) as CuanNovelBatch[];

  const current = updated[0] || { ...batch, ...patch };
  await sendTelegramMessage(chatId, formatBatchSummary(current), buildConfirmationKeyboard(current.id));
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const expectedSecret = getEnv('TELEGRAM_WEBHOOK_SECRET');
    if (expectedSecret) {
      const headerSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
      if (headerSecret !== expectedSecret) {
        return NextResponse.json({ ok: false, error: 'Unauthorized webhook secret' }, { status: 401 });
      }
    }

    const update = (await req.json().catch(() => null)) as {
      message?: { chat?: { id?: number | string }; text?: string };
      callback_query?: {
        id?: string;
        data?: string;
        message?: { chat?: { id?: number | string } };
      };
    } | null;

    if (!update) {
      return NextResponse.json({ ok: true, skipped: 'empty_body' });
    }

    if (update.callback_query) {
      const cbId = String(update.callback_query.id || '');
      const data = String(update.callback_query.data || '');
      const chatId = String(update.callback_query.message?.chat?.id || '');

      await answerCallbackQuery(cbId, 'OK');

      if (!chatId) {
        return NextResponse.json({ ok: true, skipped: 'missing_chat_id' });
      }

      const [action, arg1, batchId] = data.split(':');
      let batch = batchId
        ? (((await sbFetch(
            `cuannovel_batches?id=eq.${encodeURIComponent(batchId)}&limit=1`
          )) as CuanNovelBatch[]) || [])[0] || null
        : await getLatestBatchForChat(chatId);

      if (!batch) {
        batch = await createDraftBatch(chatId);
      }

      if (action === 'lang') {
        const nextLang = normalizeLang(arg1);
        const updated = (await sbFetch(
          `cuannovel_batches?id=eq.${encodeURIComponent(batch.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ language: nextLang, updated_at: new Date().toISOString() })
          }
        )) as CuanNovelBatch[];
        const current = updated[0] || { ...batch, language: nextLang };
        await sendTelegramMessage(
          chatId,
          formatBatchSummary(current),
          buildConfirmationKeyboard(current.id)
        );
      } else if (action === 'start') {
        const target = Number(arg1) === 2 ? 2 : 3;
        await handleStartBatch(chatId, batch, target);
      } else if (action === 'stop') {
        await handleStopBatch(chatId);
      }

      return NextResponse.json({ ok: true });
    }

    const msg = update.message;
    const chatId = String(msg?.chat?.id || '');
    const rawText = String(msg?.text || '').trim();

    if (!chatId || !rawText) {
      return NextResponse.json({ ok: true, skipped: 'no_text_message' });
    }

    const cmd = rawText.split(/\s+/)[0].toLowerCase().replace(/@[a-z0-9_]+$/i, '');

    if (cmd === '/stop' || rawText.toLowerCase() === 'stop') {
      await handleStopBatch(chatId);
      return NextResponse.json({ ok: true });
    }

    if (cmd === '/status' || rawText.toLowerCase() === 'status') {
      await handleStatusBatch(chatId);
      return NextResponse.json({ ok: true });
    }

    if (cmd === '/cuannovel' || cmd === '/start' || rawText.toLowerCase().includes('buatkan novel')) {
      const draft = await createDraftBatch(chatId);
      await sendTelegramMessage(
        chatId,
        formatBatchSummary(draft),
        buildConfirmationKeyboard(draft.id)
      );
      return NextResponse.json({ ok: true });
    }

    const edited = await parseAndApplyMetaEdit(chatId, rawText);
    if (edited) {
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      chatId,
      [
        'Perintah CuanNovel:',
        '• /cuannovel — buat batch novel baru (pilih bahasa ID/EN & target 2/3)',
        '• /status — cek progres batch & slot aktif',
        '• /stop — hentikan batch aktif'
      ].join('\n')
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'cuannovel-telegram-webhook' });
}
