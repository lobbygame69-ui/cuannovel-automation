'use client';

import { useCallback, useEffect, useState } from 'react';
import { OfficePipelineBoard, PipelineSlotState } from '../components/OfficePipelineBoard';

interface QueueRow {
  id: string;
  sequence_no: number;
  stage: string;
  current_chapter: number;
  target_chapters: number;
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
  const [autoRun, setAutoRun] = useState(false);
  const [lastWordsBySlot, setLastWordsBySlot] = useState<Record<number, number>>({});
  const [lastProviderBySlot, setLastProviderBySlot] = useState<Record<number, string>>({});

  const refreshStatus = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerWorkerOnce = useCallback(async (): Promise<boolean> => {
    const activeSlot =
      (data?.queue || []).find((r) => r.stage === 'novelku_production') ||
      (data?.queue || [])[0] ||
      null;

    setLoading(true);
    setRunningSlotNo(activeSlot ? activeSlot.sequence_no : 1);
    setWorkerMsg('Menjalankan 1 langkah worker...');

    try {
      const res = await fetch('/api/worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer cuannovel99@'
        }
      });
      const text = await res.text();
      setWorkerMsg(`HTTP ${res.status}: ${text}`);

      try {
        const parsed = JSON.parse(text) as {
          ok?: boolean;
          slot?: number;
          words?: number;
          provider?: string;
        };
        if (parsed.slot) {
          if (typeof parsed.words === 'number') {
            setLastWordsBySlot((prev) => ({ ...prev, [parsed.slot!]: parsed.words! }));
          }
          if (parsed.provider) {
            setLastProviderBySlot((prev) => ({ ...prev, [parsed.slot!]: parsed.provider! }));
          }
        }
      } catch {
        // abaikan jika respons bukan JSON murni
      }

      const latest = await refreshStatus();
      return Boolean(res.ok && latest.ok && !latest.hasError);
    } catch (err) {
      setWorkerMsg(err instanceof Error ? err.message : 'Gagal memicu worker');
      return false;
    } finally {
      setRunningSlotNo(null);
      setLoading(false);
    }
  }, [data?.queue, refreshStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(async () => {
      if (loading) return;
      const ok = await triggerWorkerOnce();
      if (!ok) {
        setAutoRun(false);
      }
    }, 3500);
    return () => clearTimeout(timer);
  }, [autoRun, loading, triggerWorkerOnce]);

  const isHealthy = Boolean(data?.ok && !data?.hasError);
  const statusBannerText = isHealthy
    ? 'STATUS: AMAN — Tidak ada error pada pipeline'
    : `STATUS: ADA ERROR — ${data?.latestError || data?.error || 'Periksa detail di bawah'}`;

  const mappedSlots: PipelineSlotState[] = (data?.queue || []).map((row) => ({
    slot: row.sequence_no,
    stage: row.stage,
    chaptersDone: row.current_chapter,
    totalChapters: row.target_chapters,
    lastWords: lastWordsBySlot[row.sequence_no],
    provider: lastProviderBySlot[row.sequence_no],
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
