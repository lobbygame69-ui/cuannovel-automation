import { NextResponse } from 'next/server';
import { CuanNovelBatch, CuanNovelQueueItem, sbFetch } from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const batches = (await sbFetch(
      'cuannovel_batches?order=updated_at.desc&limit=1'
    )) as CuanNovelBatch[];

    const batch = Array.isArray(batches) && batches.length > 0 ? batches[0] : null;
    if (!batch) {
      return NextResponse.json({ ok: true, batch: null, queue: [], hasError: false });
    }

    const queue = (await sbFetch(
      `cuannovel_queue?batch_id=eq.${encodeURIComponent(batch.id)}&order=sequence_no.asc`
    )) as CuanNovelQueueItem[];

    const items = Array.isArray(queue) ? queue : [];
    const errorItems = items.filter((item) => Boolean(item.last_error));

    return NextResponse.json({
      ok: true,
      batch,
      queue: items,
      hasError: errorItems.length > 0,
      latestError: errorItems[0]?.last_error || null
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message, hasError: true }, { status: 500 });
  }
}
