import { NextResponse } from 'next/server';
import { CuanNovelBatch, CuanNovelQueueItem, sbFetch } from '@/lib/cuannovel';

export const dynamic = 'force-dynamic';

interface ProjectSummaryRow {
  id: string;
  title: string;
  pen_name: string;
  genre: string;
  language: string;
  status: string;
  target_chapters: number;
  completed_chapters: number;
}

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

    const activeSlot =
      items.find((item) => item.stage !== 'completed' && item.stage !== 'failed_purged') || null;

    let activeProject: ProjectSummaryRow | null = null;
    let savedChaptersCount = 0;

    if (activeSlot?.project_id) {
      const projects = (await sbFetch(
        `projects?id=eq.${encodeURIComponent(activeSlot.project_id)}&limit=1`
      )) as ProjectSummaryRow[];
      activeProject = Array.isArray(projects) && projects.length > 0 ? projects[0] : null;

      const chapters = (await sbFetch(
        `chapters?project_id=eq.${encodeURIComponent(activeSlot.project_id)}&select=id`
      )) as Array<{ id: string }>;
      savedChaptersCount = Array.isArray(chapters) ? chapters.length : 0;
    }

    return NextResponse.json({
      ok: true,
      batch,
      queue: items,
      hasError: errorItems.length > 0,
      latestError: errorItems[0]?.last_error || null,
      activeProject,
      savedChaptersCount
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message, hasError: true }, { status: 500 });
  }
}
