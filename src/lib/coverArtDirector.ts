export interface CoverArtPlan {
  frontPrompt: string;
  backPrompt: string;
  accentHex: string;
  panelBgHex: string;
  moodSummary: string;
}

interface CoverPlanInput {
  title: string;
  genre: string;
  synopsis: string;
  language: string;
  penName: string;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const trimmed = String(raw || '').trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildHeuristicCoverPlan(input: CoverPlanInput): CoverArtPlan {
  const g = (input.genre || '').toLowerCase();
  const shortSynopsis = String(input.synopsis || '').replace(/\s+/g, ' ').trim().slice(0, 220);

  let styleMood = 'cinematic dramatic lighting, rich depth of field, high-detail book cover illustration';
  let accentHex = '#fbbf24';
  let panelBgHex = '#091326';

  if (g.includes('romance') || g.includes('romansa')) {
    styleMood = 'romantic golden hour and twilight atmosphere, emotional lighting, soft depth, editorial book cover art';
    accentHex = '#f9a8d4';
    panelBgHex = '#1a0f1e';
  } else if (g.includes('fantasy') || g.includes('fantasi') || g.includes('mystery') || g.includes('misteri')) {
    styleMood = 'mystical dark fantasy atmosphere, glowing embers and rim lighting, atmospheric depth, bestseller book cover art';
    accentHex = '#fbbf24';
    panelBgHex = '#091326';
  } else if (g.includes('thriller') || g.includes('horror') || g.includes('horor')) {
    styleMood = 'high-contrast noir suspense lighting, moody shadows, tension-filled composition, modern thriller cover art';
    accentHex = '#f87171';
    panelBgHex = '#111318';
  }

  const cleanRule =
    'Strictly NO text, NO letters, NO numbers, NO watermarks, NO logos, NO signatures, NO borders or frames drawn into the image.';

  return {
    frontPrompt: `Book cover illustration for "${input.title}" (${input.genre}). Story essence: ${shortSynopsis}. ${styleMood}. Clear uncluttered upper area for title and lower area for author name. ${cleanRule}`,
    backPrompt: `Complementary back cover background illustration for "${input.title}" (${input.genre}). Different camera angle and secondary scene from the front cover, evoking ${shortSynopsis}. Softer contrast and calm mid-section for readable book blurb. ${cleanRule}`,
    accentHex,
    panelBgHex,
    moodSummary: styleMood
  };
}

export async function generateCoverArtPlan(params: {
  input: CoverPlanInput;
  geminiApiKey?: string;
  groqApiKey?: string;
}): Promise<CoverArtPlan> {
  const fallback = buildHeuristicCoverPlan(params.input);

  const directorPrompt = [
    'You are an award-winning Amazon KDP Book Cover Art Director.',
    `Book Title: ${params.input.title}`,
    `Genre: ${params.input.genre}`,
    `Synopsis: ${params.input.synopsis.slice(0, 350)}`,
    'Design a commercial front cover art prompt and a distinct, matching back cover background art prompt.',
    'Both prompts MUST explicitly forbid any text, letters, logos, watermarks, or signatures.',
    'Front cover must have clean breathing room at top and bottom for typography.',
    'Back cover must use a different angle/scene than front cover so they match in world & palette without looking identical.',
    'Return ONLY valid JSON: {"frontPrompt":"...","backPrompt":"...","accentHex":"#fbbf24","panelBgHex":"#091326","moodSummary":"..."}'
  ].join('\n');

  try {
    if (params.geminiApiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(params.geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: directorPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          }),
          cache: 'no-store'
        }
      );
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        } | null;
        const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = extractJson(raw);
        if (parsed?.frontPrompt && parsed?.backPrompt) {
          return {
            frontPrompt: String(parsed.frontPrompt).trim(),
            backPrompt: String(parsed.backPrompt).trim(),
            accentHex: String(parsed.accentHex || fallback.accentHex).trim(),
            panelBgHex: String(parsed.panelBgHex || fallback.panelBgHex).trim(),
            moodSummary: String(parsed.moodSummary || fallback.moodSummary).trim()
          };
        }
      }
    }

    if (params.groqApiKey) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.groqApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: directorPrompt }],
          temperature: 0.7,
          max_tokens: 1024
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as {
          choices?: Array<{ message?: { content?: string } }>;
        } | null;
        const raw = json?.choices?.[0]?.message?.content || '';
        const parsed = extractJson(raw);
        if (parsed?.frontPrompt && parsed?.backPrompt) {
          return {
            frontPrompt: String(parsed.frontPrompt).trim(),
            backPrompt: String(parsed.backPrompt).trim(),
            accentHex: String(parsed.accentHex || fallback.accentHex).trim(),
            panelBgHex: String(parsed.panelBgHex || fallback.panelBgHex).trim(),
            moodSummary: String(parsed.moodSummary || fallback.moodSummary).trim()
          };
        }
      }
    }
  } catch {
    // fallback otomatis ke heuristic plan
  }

  return fallback;
}
