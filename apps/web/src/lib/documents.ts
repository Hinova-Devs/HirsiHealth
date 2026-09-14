import type { MedplumClient } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';

/** Medplum's binary storage host — proxied in dev because it sends no CORS headers. */
const STORAGE_ORIGIN = 'https://storage.medplum.com';

export interface Category {
  code: string;
  label: string;
  /** Short code shown on list rows. */
  short: string;
  /** Chip colours. */
  chip: string;
  /** Diagonal band colour on grid cards. */
  stripe: string;
}

export const CATEGORIES: Category[] = [
  { code: 'all', label: 'All Records', short: 'ALL', chip: 'bg-teal-500/10 text-teal-300 border-teal-500/20', stripe: 'rgba(20,184,166,0.20)' },
  { code: '11502-2', label: 'Lab Result', short: 'LAB', chip: 'bg-teal-500/10 text-teal-300 border-teal-500/20', stripe: 'rgba(20,184,166,0.20)' },
  { code: '57833-6', label: 'Prescription', short: 'RX', chip: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20', stripe: 'rgba(99,102,241,0.20)' },
  { code: '18748-4', label: 'Imaging Report', short: 'IMG', chip: 'bg-sky-500/10 text-sky-300 border-sky-500/20', stripe: 'rgba(14,165,233,0.20)' },
  { code: '11488-4', label: 'Diagnosis / Note', short: 'DX', chip: 'bg-amber-500/10 text-amber-300 border-amber-500/20', stripe: 'rgba(245,158,11,0.20)' },
  { code: '11369-6', label: 'Vaccination', short: 'VAX', chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', stripe: 'rgba(16,185,129,0.20)' },
  { code: '34117-2', label: 'General', short: 'GEN', chip: 'bg-slate-500/10 text-slate-300 border-slate-600/30', stripe: 'rgba(100,116,139,0.20)' },
];

const GENERAL = CATEGORIES[CATEGORIES.length - 1];

export function categoryOf(doc: DocumentReference): Category {
  const code = doc.category?.[0]?.coding?.[0]?.code;
  return CATEGORIES.find((c) => c.code !== 'all' && c.code === code) ?? GENERAL;
}

export const docTitle = (doc: DocumentReference): string =>
  doc.content?.[0]?.attachment?.title || doc.description || 'Untitled document';

/** Issuing clinic or practitioner, when the record names one. */
export const docPlace = (doc: DocumentReference): string =>
  doc.custodian?.display || doc.author?.[0]?.display || 'No clinic recorded';

export const docDate = (doc: DocumentReference): string => {
  const raw = doc.date || doc.meta?.lastUpdated;
  return raw
    ? new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'No date';
};

/** File format badge — "PDF", "PNG", … */
export const docKind = (doc: DocumentReference): string =>
  doc.content?.[0]?.attachment?.contentType?.split('/')[1]?.toUpperCase() || 'FILE';

export function matchesQuery(doc: DocumentReference, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [docTitle(doc), doc.description, docPlace(doc), doc.category?.[0]?.text]
    .some((field) => field?.toLowerCase().includes(q));
}

export const sortByNewest = (docs: DocumentReference[]): DocumentReference[] =>
  [...docs].sort((a, b) =>
    (b.date || b.meta?.lastUpdated || '').localeCompare(a.date || a.meta?.lastUpdated || '')
  );

/**
 * Fetches a document's bytes and returns them as a blob tagged with the
 * attachment's declared MIME type — without that tag the browser downloads
 * the file instead of rendering it inline.
 *
 * Medplum stores one of two URL shapes on the attachment: a pre-signed
 * storage.medplum.com URL (already authorized, needs no token) or a Binary
 * reference that requires an authenticated FHIR read. Both go through the
 * dev-server proxies, since neither remote origin sends CORS headers.
 */
export async function fetchDocumentBlob(
  medplum: MedplumClient,
  doc: DocumentReference
): Promise<Blob> {
  const attachment = doc.content?.[0]?.attachment;
  if (!attachment?.url) throw new Error('Document has no attached file.');

  const rawUrl = attachment.url;
  const isPresigned = rawUrl.startsWith(STORAGE_ORIGIN);

  let res: Response;
  if (isPresigned) {
    res = await fetch(rawUrl.replace(STORAGE_ORIGIN, '/storage-proxy'));
  } else {
    const path = rawUrl.startsWith('http')
      ? new URL(rawUrl).pathname + new URL(rawUrl).search
      : `/fhir/R4/${rawUrl}`;
    res = await fetch(`/api${path}`, {
      headers: { Authorization: `Bearer ${await medplum.getAccessToken()}` },
    });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return new Blob([await res.arrayBuffer()], {
    type: attachment.contentType || 'application/octet-stream',
  });
}

/**
 * Extracts the Binary id from an attachment URL.
 *
 * Medplum hands this URL back in three different shapes depending on where it
 * came from, and deletion targets the wrong resource if any is misread:
 *   - `Binary/<id>`                                  — as written by an upload
 *   - `https://…/fhir/R4/Binary/<id>`                — from createMedia()
 *   - `https://storage.medplum.com/binary/<id>/<ver>?…` — rewritten on read
 *
 * Duplicated byte-for-byte in the mobile app
 * (hersihealth-mobile/src/lib/document-delete.ts). This copy owns the tests —
 * see documents.check.ts — so change both and re-run that check.
 */
export function binaryIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return (
    url.match(/^Binary\/([^/?#]+)/)?.[1] ??
    url.match(/\/fhir\/R4\/Binary\/([^/?#]+)/)?.[1] ??
    url.match(/\/binary\/([^/?#]+)/i)?.[1]
  );
}

/**
 * Finds the Media that wraps the same Binary as this document.
 *
 * Every upload creates BOTH a Media and a DocumentReference over one Binary,
 * but the DocumentReference does not reference the Media — the shared Binary id
 * is the only link. FHIR has no search parameter for `Media.content.url`, so the
 * match happens client-side.
 *
 * ponytail: scans the patient's most recent 200 Media. Patients with more than
 * that could leave an orphaned Media behind; add a real index if it matters.
 */
async function findMediaId(
  medplum: MedplumClient,
  subjectReference: string,
  binaryId: string
): Promise<string | undefined> {
  const media = await medplum.searchResources('Media', `subject=${subjectReference}&_count=200`);
  return media.find((m) => binaryIdFromUrl(m.content?.url) === binaryId)?.id;
}

/**
 * Deletes a document and the resources behind it in one atomic FHIR
 * transaction — either all of it goes or none of it does.
 *
 * Runs as the patient's own session: no service credential, no $expunge. What
 * Medplum does with the rows afterwards is its soft-delete behaviour, not
 * something this function claims to control.
 *
 * Throws on any non-2xx entry so callers can leave local state untouched.
 */
export async function deleteDocument(
  medplum: MedplumClient,
  doc: DocumentReference
): Promise<void> {
  if (!doc.id) throw new Error('Document has no id.');

  const binaryId = binaryIdFromUrl(doc.content?.[0]?.attachment?.url);
  const subjectReference = doc.subject?.reference;

  // Absent Media is not fatal: the document still leaves the wallet.
  const mediaId =
    binaryId && subjectReference
      ? await findMediaId(medplum, subjectReference, binaryId).catch(() => undefined)
      : undefined;

  const entry = [
    { request: { method: 'DELETE' as const, url: `DocumentReference/${doc.id}` } },
    ...(mediaId ? [{ request: { method: 'DELETE' as const, url: `Media/${mediaId}` } }] : []),
    ...(binaryId ? [{ request: { method: 'DELETE' as const, url: `Binary/${binaryId}` } }] : []),
  ];

  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry,
  });

  // Name the entry that failed — the bundle targets up to three resources and
  // "404" alone does not say which one was missing.
  const failedIndex = result.entry?.findIndex((e) => !e.response?.status?.startsWith('2')) ?? -1;
  if (failedIndex >= 0) {
    const status = result.entry?.[failedIndex]?.response?.status ?? 'unknown status';
    const target = entry[failedIndex]?.request.url ?? 'unknown resource';
    throw new Error(`Delete failed on ${target} (${status}). Nothing was removed.`);
  }
}
