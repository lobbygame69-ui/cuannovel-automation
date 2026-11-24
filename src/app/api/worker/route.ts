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

function buildInteriorHtml(
  project: ProjectRow,
  batch: CuanNovelBatch,
  chapters: ChapterRow[]
): string {
  const isEn = normalizeLang(batch.language) === 'en';
  const chapterHtml = chapters
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((ch) => {
      const paragraphs = ch.content
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n');
      return `<section class="chapter"><h2>${isEn ? 'Chapter' : 'Bab'} ${ch.chapter_number}: ${ch.title}</h2>\n${paragraphs}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'id'}">
<head>
<meta charset="UTF-8" />
<title>${project.title}</title>
<style>
  @page { size: 6in 9in; margin: 0.75in; }
  body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.65; color: #111; }
  .title-page { page-break-after: always; text-align: center; padding-top: 2.2in; }
  .chapter { page-break-before: always; }
  h1 { font-size: 22pt; margin-bottom: 0.5rem; }
  h2 { font-size: 15pt; margin-bottom: 1rem; }
  p { text-indent: 1.5em; margin: 0 0 0.75em 0; }
</style>
</head>
<body>
  <div class="title-page">
    <h1>${project.title}</h1>
    <p><strong>${project.pen_name}</strong></p>
    <p>${batch.publisher_name}</p>
  </div>
  ${chapterHtml}
</body>
</html>`;
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
      const metadataTxt = [
        `Title: ${project.title}`,
        `Author: ${project.pen_name}`,
        `Publisher: ${batch.publisher_name}`,
        `Language: ${langLabel(lang)}`,
        `Genre: ${project.genre}`,
        `Trim Size: 6" x 9" (White Paper)`,
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
