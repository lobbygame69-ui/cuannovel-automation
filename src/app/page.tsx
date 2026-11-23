'use client';

import { useEffect, useState } from 'react';

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
  const [workerMsg, setWorkerMsg] = useState('');

  async function refreshStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      const json = (await res.json()) as StatusPayload;
      setData(json);
    } catch (err) {
      setData({
        ok: false,
        hasError: true,
        error: err instanceof Error ? err.message : 'Gagal memuat status'
      });
    } finally {
      setLoading(false);
    }
  }

  async function triggerWorkerOnce() {
    setLoading(true);
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
      await refreshStatus();
    } catch (err) {
      setWorkerMsg(err instanceof Error ? err.message : 'Gagal memicu worker');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  const isHealthy = data?.ok && !data?.hasError;

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        CuanNovel — Panel Status Pipeline
      </h1>

      <div
        style={{
          padding: 14,
          borderRadius: 8,
          marginBottom: 16,
          background: isHealthy ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${isHealthy ? '#10b981' : '#ef4444'}`,
          color: isHealthy ? '#065f46' : '#991b1b',
          fontWeight: 600
        }}
      >
        {isHealthy
          ? 'STATUS: AMAN — Tidak ada error pada pipeline'
          : `STATUS: ADA ERROR — ${data?.latestError || data?.error || 'Periksa detail di bawah'}`}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          onClick={refreshStatus}
          disabled={loading}
          style={{ padding: '8px 14px', cursor: 'pointer', borderRadius: 6 }}
        >
          {loading ? 'Memproses...' : 'Refresh Status'}
        </button>
        <button
          onClick={triggerWorkerOnce}
          disabled={loading}
          style={{ padding: '8px 14px', cursor: 'pointer', borderRadius: 6 }}
        >
          Jalankan 1 Langkah Worker
        </button>
      </div>

      {workerMsg && (
        <pre
          style={{
            background: '#f4f4f5',
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            overflowX: 'auto',
            marginBottom: 18
          }}
        >
          {workerMsg}
        </pre>
      )}

      {data?.batch && (
        <div style={{ marginBottom: 18, fontSize: 14, lineHeight: 1.6 }}>
          <div><strong>Batch ID:</strong> {data.batch.id}</div>
          <div><strong>Status Batch:</strong> {data.batch.status}</div>
          <div>
            <strong>Penulis / Penerbit:</strong> {data.batch.author_name} / {data.batch.publisher_name}
          </div>
          <div>
            <strong>Lolos:</strong> {data.batch.passed_count} / {data.batch.target_passed}
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #d4d4d8' }}>
            <th style={{ padding: 8 }}>Slot</th>
            <th style={{ padding: 8 }}>Stage</th>
            <th style={{ padding: 8 }}>Bab</th>
            <th style={{ padding: 8 }}>Error</th>
          </tr>
        </thead>
        <tbody>
          {(data?.queue || []).map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid #e4e4e7' }}>
              <td style={{ padding: 8 }}>#{row.sequence_no}</td>
              <td style={{ padding: 8 }}>{row.stage}</td>
              <td style={{ padding: 8 }}>
                {row.current_chapter}/{row.target_chapters}
              </td>
              <td style={{ padding: 8, color: row.last_error ? '#dc2626' : '#16a34a' }}>
                {row.last_error || 'OK'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
