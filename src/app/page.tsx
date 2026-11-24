'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OfficePipelineBoard, PipelineSlotState } from '../components/OfficePipelineBoard';
import { extractShortChapterInfo } from '../lib/cuannovel';

interface QueueRow {
  id: string;
  sequence_no: number;
  stage: string;
  current_chapter: number;
  target_chapters: number;
  drive_folder_url?: string | null;
  last_error: string | null;
}

interface BatchInfo {
  id: string;
  status: string;
  author_name: string;
  publisher_name: string;
  language: string;
  passed_count: number;
  target_passed: number;
}

interface StatusPayload {
  ok: boolean;
  error?: string;
  hasError?: boolean;
  latestError?: string | null;
  batch?: BatchInfo | null;
  queue?: QueueRow[];
}

export default function CuanNovelMonitorPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningSlotNo, setRunningSlotNo] = useState<number | null>(null);
  const [workerMsg, setWorkerMsg] = useState('');
  const [autoRun, setAutoRun] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [lastWordsBySlot, setLastWordsBySlot] = useState<Record<number, number>>({});
  const [lastProviderBySlot, setLastProviderBySlot] = useState<Record<number, string>>({});

  const autoRunRef = useRef(autoRun);
  autoRunRef.current = autoRun;

  const busyRef = useRef(false);

  const refreshStatus = useCallback(async (): Promise<StatusPayload> => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      const json = (await res.json()) as StatusPayload;
      setData(json);
      return json;
    } catch (err) {
      const fallback: StatusPayload = {
        ok: false,
        hasError: true,
        error: err instanceof Error ? err.message : 'Gagal memuat status'
      };
      setData(fallback);
      return fallback;
    }
  }, []);

  const runSingleWorkerStep = useCallback(
    async (currentData: StatusPayload | null): Promise<{
      finishedNovel: boolean;
      needsRetry: boolean;
      delayMs: number;
    }> => {
      const queue = currentData?.queue || [];
      const activeSlot =
        queue.find((r) => r.current_chapter < r.target_chapters) ||
        queue.find((r) => r.stage === 'novelku_production') ||
        queue.find((r) => /audit|pack|drive|upload/i.test(r.stage)) ||
        queue[0] ||
        null;

      if (!activeSlot) {
        return { finishedNovel: true, needsRetry: false, delayMs: 3000 };
      }

      const allDone =
        queue.length > 0 &&
        queue.every(
          (r) =>
            r.current_chapter >= r.target_chapters &&
            !r.last_error &&
            /drive|upload|done|completed/i.test(r.stage)
        );

      if (allDone) {
        return { finishedNovel: true, needsRetry: false, delayMs: 4000 };
      }

      const shortInfo = extractShortChapterInfo(activeSlot.last_error);
      setRunningSlotNo(activeSlot.sequence_no);
      setWorkerMsg(
        shortInfo.isTooShort
          ? `Bab ${shortInfo.chapter || activeSlot.current_chapter + 1} baru ${shortInfo.words ?? '?'} kata (<1.000). Mengulang otomatis...`
          : `Memproses Slot #${activeSlot.sequence_no} (${activeSlot.stage}) — Bab ${activeSlot.current_chapter}/${activeSlot.target_chapters}...`
      );

      try {
        const res = await fetch('/api/worker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer cuannovel99@'
          },
          body: JSON.stringify({
            slot: activeSlot.sequence_no,
            minWords: 1000,
            auditBeforePackaging: true,
            autoRetryShortChapter: true,
            retryAttempt: retryCount + 1
          })
        });

        const text = await res.text();
        setWorkerMsg(`HTTP ${res.status}: ${text}`);

        try {
          const parsed = JSON.parse(text) as {
            ok?: boolean;
            slot?: number;
            words?: number;
            provider?: string;
            error?: string;
          };
          if (parsed.slot) {
            if (typeof parsed.words === 'number') {
              setLastWordsBySlot((prev) => ({ ...prev, [parsed.slot!]: parsed.words! }));
            }
            if (parsed.provider) {
              setLastProviderBySlot((prev) => ({ ...prev, [parsed.slot!]: parsed.provider! }));
            }
          }
          if (!res.ok || parsed.ok === false) {
            setRetryCount((c) => c + 1);
            return { finishedNovel: false, needsRetry: true, delayMs: 3500 };
          }
        } catch {
          if (!res.ok) {
            setRetryCount((c) => c + 1);
            return { finishedNovel: false, needsRetry: true, delayMs: 3500 };
          }
        }

        const latest = await refreshStatus();
        const updatedSlot =
          (latest.queue || []).find((r) => r.sequence_no === activeSlot.sequence_no) || activeSlot;
        const stillShort = extractShortChapterInfo(updatedSlot.last_error).isTooShort;

        if (stillShort || Boolean(updatedSlot.last_error)) {
          setRetryCount((c) => c + 1);
          return { finishedNovel: false, needsRetry: true, delayMs: 2500 };
        }

        setRetryCount(0);
        return { finishedNovel: false, needsRetry: false, delayMs: 1800 };
      } catch (err) {
        setWorkerMsg(err instanceof Error ? err.message : 'Gagal memicu worker');
        setRetryCount((c) => c + 1);
        return { finishedNovel: false, needsRetry: true, delayMs: 4000 };
      } finally {
        setRunningSlotNo(null);
      }
    },
    [refreshStatus, retryCount]
  );

  const triggerWorkerOnce = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      await runSingleWorkerStep(data);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [data, runSingleWorkerStep]);

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (cancelled) return;
      const latestStatus = await refreshStatus();
      if (cancelled) return;

      if (autoRunRef.current && !busyRef.current) {
        busyRef.current = true;
        setLoading(true);
        const result = await runSingleWorkerStep(latestStatus);
        busyRef.current = false;
        setLoading(false);

        if (result.finishedNovel) {
          setAutoRun(false);
          return;
        }

        if (!cancelled && autoRunRef.current) {
          timerId = setTimeout(loop, result.delayMs);
        }
        return;
      }

      if (!cancelled && autoRunRef.current) {
        timerId = setTimeout(loop, 3000);
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [autoRun, refreshStatus, runSingleWorkerStep]);

  const isHealthy = Boolean(data?.ok && !data?.hasError);
  const statusBannerText = isHealthy
    ? 'STATUS: AMAN — Tidak ada error pada pipeline'
    : `STATUS: OTOMATIS MENGULANG — ${data?.latestError || data?.error || 'Menyesuaikan hasil bab'}`;

  const mappedSlots: PipelineSlotState[] = (data?.queue || []).map((row) => ({
    slot: row.sequence_no,
    stage: row.stage,
    chaptersDone: row.current_chapter,
    totalChapters: row.target_chapters,
    lastWords: lastWordsBySlot[row.sequence_no],
    provider: lastProviderBySlot[row.sequence_no],
    driveUrl: row.drive_folder_url || undefined,
    error: row.last_error,
    isRunning: runningSlotNo === row.sequence_no
  }));

  const batchId = data?.batch?.id || '-';
  const statusText = `${data?.batch?.status || '-'} · ${statusBannerText}`;
  const authorPublisher = data?.batch
    ? `${data.batch.author_name} / ${data.batch.publisher_name}`
    : '-';
  const passedCount = data?.batch
    ? `${data.batch.passed_count} / ${data.batch.target_passed}`
    : '0 / 0';

  return (
    <main style={{ maxWidth: 960, margin: '28px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <OfficePipelineBoard
        batchId={batchId}
        statusText={statusText}
        authorPublisher={authorPublisher}
        passedCount={passedCount}
        slots={mappedSlots}
        onRefresh={() => {
          void refreshStatus();
        }}
        onRunOneStep={() => {
          void triggerWorkerOnce();
        }}
        autoRun={autoRun}
        onToggleAutoRun={() => setAutoRun((prev) => !prev)}
        busy={loading}
      />

      {workerMsg && (
        <pre
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            overflowX: 'auto',
            marginTop: 14
          }}
        >
          {workerMsg}
        </pre>
      )}
    </main>
  );
}
