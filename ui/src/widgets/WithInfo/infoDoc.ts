/**
 * Structured copy for WithInfo flyouts.
 *
 * The lead is the job of the control in plain language, for someone who has
 * not used the effect before. It comes before the metadata. Do not open with
 * an interaction, a coefficient, or another control's side effect.
 *
 * After the metadata, answer the questions that fit this control: what it is
 * for, how to use it, where a useful region starts, where it stops helping.
 * "What you hear", "too far", and "sweet spot" are optional, not a checklist.
 * Technical behaviour goes in a later "In detail" section, and only when it
 * is actually in the code.
 *
 * Include a section only when it says something true for this control.
 *
 * - Toggle: lead, meta, what you compare, then the fade and routing detail.
 * - Listen: lead, meta, what you hear, how you use the solo, then routing detail.
 * - Choice: lead, meta with stored values, what each option is for, then
 *   the detector detail.
 * - Display: lead, how to read it. No parameter id when nothing is registered.
 *   Detail only if the scale or the update rule would otherwise be misleading.
 * - Continuous parameter: lead, meta, what you hear, how to set it, the graph,
 *   then detail. "Background" only as general context, never as this DSP.
 *
 * Practical steps name what to change and what to watch or hear. They do not
 * give a target number or a genre recipe.
 *
 * `infoDoc` escapes text. The only markup it emits is the document skeleton
 * and https links.
 */

export type InfoMeta = { label: string; value: string };

export type InfoBlock =
  | { p: string }
  | { ul: string[] }
  | { link: { href: string; label: string; note?: string } };

export type InfoSection = {
  heading: string;
  blocks: InfoBlock[];
};

export type InfoDoc = {
  name: string;
  lead: string;
  meta?: InfoMeta[];
  sections?: InfoSection[];
};

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assertHttps(href: string): string {
  if (!/^https:\/\/[^\s<>"']+$/.test(href))
    throw new Error(`infoDoc link must be a single https URL: ${href}`);
  return href;
}

function renderBlock(block: InfoBlock): string {
  if ('p' in block)
    return `<p>${escapeText(block.p)}</p>`;
  if ('ul' in block) {
    const items = block.ul.map((item) => `<li>${escapeText(item)}</li>`).join('');
    return `<ul>${items}</ul>`;
  }
  const href = assertHttps(block.link.href);
  const note = block.link.note
    ? `<p class="info-note">${escapeText(block.link.note)}</p>`
    : '';
  return `<p class="info-link"><a href="${escapeText(href)}">${escapeText(block.link.label)}</a></p>${note}`;
}

/** HTML document for a WithInfo flyout. */
export function infoDoc(doc: InfoDoc): string {
  const meta = (doc.meta ?? [])
    .map(
      (row) =>
        `<dt>${escapeText(row.label)}</dt><dd>${escapeText(row.value)}</dd>`,
    )
    .join('');
  const metaHtml = meta ? `<dl class="info-meta">${meta}</dl>` : '';
  const sections = (doc.sections ?? [])
    .filter((section) => section.blocks.length > 0)
    .map(
      (section) =>
        `<h2>${escapeText(section.heading)}</h2>${section.blocks.map(renderBlock).join('')}`,
    )
    .join('');
  return `<article class="info-doc"><h1>${escapeText(doc.name)}</h1><p class="info-lead">${escapeText(doc.lead)}</p>${metaHtml}${sections}</article>`;
}
