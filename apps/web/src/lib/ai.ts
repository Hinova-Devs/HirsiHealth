/**
 * Reads what the AI pipeline (hersihealth-ai-pipeline) produced for a document.
 *
 * The pipeline does not write to the DocumentReference — it creates a review
 * `Task` per upload:
 *   Task.focus  → DocumentReference/<id>
 *   Task.for    → the patient
 *   Task.status → ready (awaiting the patient's review) | completed | failed
 *   Task.code.text → "Review AI-extracted document data" | "Retake photo" |
 *                    "Extraction failed: …" | "File too large to process"
 *   Task.output → documentType, extractedData (JSON), explanation, confidence
 *
 * This module turns those Tasks into the display rows the record screen shows.
 * It deliberately ignores `explanation` — the record screen shows the extracted
 * data as it was read, not prose about it.
 */

import type { MedplumClient } from '@medplum/core';
import type { DocumentReference, Task } from '@medplum/fhirtypes';
import { docDate, docTitle } from './documents.ts';

export type ReviewStatus = 'reviewed' | 'needs-review' | 'unreadable' | 'failed';

export type Confidence = 'high' | 'medium' | 'low';

/** One extracted row, in the order the document presented it. */
export interface Field {
  k: string;
  v: string;
  note?: string;
  /** Value is outside its printed reference range, or was read with low confidence. */
  flag?: boolean;
}

export interface DocInsight {
  docId: string;
  status: ReviewStatus;
  documentType?: string;
  fields: Field[];
  confidence?: Confidence;
  /** Why this document needs attention, when it does. Patient-readable. */
  reason?: string;
  /** Raw provider/server error behind a failure — for developers, not patients. */
  technicalDetail?: string;
  /** When the pipeline wrote this. */
  when?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  lab_result: 'Lab result',
  prescription: 'Prescription',
  diagnosis: 'Diagnosis',
  imaging_report: 'Imaging report',
  vaccination_card: 'Vaccination',
  unclear: 'Unclear',
};

export const documentTypeLabel = (type: string | undefined): string =>
  (type && DOC_TYPE_LABELS[type]) || 'Document';

/**
 * True when `value` sits outside the printed `range`. Handles the shapes
 * clinics actually print: "12.0-15.5", "3.9 – 5.5", "<5.5", ">40". Anything
 * else returns false — a wrong flag on a medical value is worse than no flag.
 *
 * ponytail: string parsing only; if labs start sending structured ranges,
 * compare those instead.
 */
export function outOfRange(value: string, range: string | undefined): boolean {
  if (!range) return false;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return false;

  const bounded = range.match(/^\s*([<>≤≥])\s*(\d+(?:\.\d+)?)/);
  if (bounded) {
    const limit = parseFloat(bounded[2]);
    return bounded[1] === '<' || bounded[1] === '≤' ? n > limit : n < limit;
  }

  // Split on the separator first, so "12.0-15.5" doesn't read as "-15.5".
  const parts = range
    .split(/\s*(?:[-–—]|to)\s*/i)
    .map((p) => parseFloat(p))
    .filter((p) => !Number.isNaN(p));
  if (parts.length < 2) return false;
  return n < parts[0] || n > parts[1];
}

/**
 * Formats a date the pipeline returned as ISO (its schemas ask for ISO 8601
 * "if determinable"). Anything else is passed through untouched — the document
 * said what it said.
 */
function displayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(Date.parse(value))) return value;
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const isLow = (confidence: unknown): boolean => confidence === 'low';

/** Joins the parts of a value that the schema splits apart, skipping blanks. */
const join = (...parts: (unknown | undefined)[]): string =>
  parts.filter((p) => typeof p === 'string' && p.trim()).join(' ');

/**
 * Flattens one extraction payload into display rows. Each document type has
 * its own schema in the pipeline, so each gets its own mapping.
 */
export function toFields(
  documentType: string | undefined,
  data: Record<string, any>
): Field[] {
  const fields: Field[] = [];

  switch (documentType) {
    case 'lab_result':
      for (const r of data.results ?? []) {
        const flagged = outOfRange(r.value, r.reference_range);
        fields.push({
          k: r.test_name,
          v: join(r.value, r.unit),
          note: flagged
            ? `outside range ${r.reference_range}`
            : r.reference_range
              ? `range ${r.reference_range}`
              : isLow(r.confidence)
                ? 'read with low confidence'
                : undefined,
          flag: flagged || isLow(r.confidence),
        });
      }
      if (data.test_date) fields.push({ k: 'Collected', v: displayDate(data.test_date) });
      break;

    case 'prescription':
      for (const m of data.medications ?? []) {
        fields.push({
          k: 'Medicine',
          v: join(m.medication_name, m.dosage),
          note: join(m.frequency, m.route && `· ${m.route}`, m.duration && `· ${m.duration}`),
          flag: isLow(m.confidence),
        });
        if (m.quantity || m.refills) {
          fields.push({ k: 'Quantity', v: join(m.quantity, m.refills && `· ${m.refills} refills`) });
        }
      }
      if (data.prescriber_name) fields.push({ k: 'Prescriber', v: data.prescriber_name });
      if (data.prescription_date) fields.push({ k: 'Prescribed', v: displayDate(data.prescription_date) });
      break;

    case 'diagnosis':
      for (const d of data.diagnoses ?? []) {
        fields.push({
          k: 'Condition',
          v: join(d.condition_name, d.icd10_code && `(${d.icd10_code})`),
          note: d.notes,
          flag: isLow(d.confidence),
        });
      }
      if (data.clinician_name) fields.push({ k: 'Clinician', v: data.clinician_name });
      if (data.diagnosis_date) fields.push({ k: 'Diagnosed', v: displayDate(data.diagnosis_date) });
      break;

    case 'imaging_report':
      if (data.modality || data.body_region) {
        fields.push({ k: 'Study', v: join(data.modality, data.body_region) });
      }
      if (data.impression) fields.push({ k: 'Impression', v: data.impression });
      for (const f of data.findings ?? []) {
        fields.push({ k: 'Finding', v: f.description, flag: isLow(f.confidence) });
      }
      if (data.radiologist_name) fields.push({ k: 'Reported by', v: data.radiologist_name });
      if (data.study_date) fields.push({ k: 'Date', v: displayDate(data.study_date) });
      break;

    case 'vaccination_card':
      for (const v of data.vaccinations ?? []) {
        fields.push({
          k: 'Vaccine',
          v: v.vaccine_name,
          note: join(
            v.dose_number && `dose ${v.dose_number}`,
            v.date_administered && `· ${displayDate(v.date_administered)}`,
            v.administering_facility && `· ${v.administering_facility}`
          ),
          flag: isLow(v.confidence),
        });
        if (v.lot_number) fields.push({ k: 'Batch', v: v.lot_number });
      }
      break;
  }

  return fields;
}

const outputOf = (task: Task, name: string): string | undefined =>
  task.output?.find((o) => o.type?.text === name)?.valueString;

/** Turns one pipeline Task into the insight the UI renders. */
export function insightFromTask(task: Task): DocInsight | undefined {
  const docId = task.focus?.reference?.split('/')[1];
  if (!docId) return undefined;

  const when = task.authoredOn || task.meta?.lastUpdated;
  const documentType = outputOf(task, 'documentType');

  if (task.status === 'failed') {
    return {
      docId,
      status: 'failed',
      when,
      fields: [],
      // The Task carries the raw provider error, which is developer-facing and
      // often a JSON blob. Patients get a sentence; the raw text stays put for
      // whoever is debugging.
      reason: 'This was a problem on our side, not with your upload. Try uploading it again.',
      technicalDetail: task.code?.text,
    };
  }

  if (task.code?.text === 'Retake photo') {
    return {
      docId,
      status: 'unreadable',
      documentType,
      when,
      fields: [],
      reason: outputOf(task, 'reason') || 'The photo was too unclear to read.',
    };
  }

  let extracted: Record<string, any> = {};
  const raw = outputOf(task, 'extractedData');
  if (raw) {
    try {
      extracted = JSON.parse(raw);
    } catch {
      // Unparseable payload — show it as needing review rather than pretending
      // there was nothing to read.
    }
  }

  const confidence = outputOf(task, 'confidence') as Confidence | undefined;
  const fields = toFields(documentType, extracted);

  return {
    docId,
    status: task.status === 'completed' ? 'reviewed' : 'needs-review',
    documentType,
    confidence,
    when,
    fields,
    reason:
      fields.length === 0
        ? 'The AI returned nothing readable from this document.'
        : fields.some((f) => f.flag)
          ? 'Some values are outside their printed range or were read with low confidence.'
          : undefined,
  };
}

/**
 * Every document's latest insight, keyed by DocumentReference id. Sorted
 * newest first, so the first Task seen per document wins.
 *
 * Searched by `subject`, which is how FHIR indexes `Task.for` — there is no
 * `for` search parameter. `_count` is raised past Medplum's default page of 20
 * so a patient with many documents doesn't silently lose the older readings.
 */
export async function fetchInsights(
  medplum: MedplumClient,
  subjectReference: string
): Promise<Map<string, DocInsight>> {
  const bundle = await medplum.search(
    'Task',
    `subject=${subjectReference}&_sort=-_lastUpdated&_count=100`
  );
  const byDoc = new Map<string, DocInsight>();
  for (const entry of bundle?.entry ?? []) {
    const insight = entry.resource && insightFromTask(entry.resource as Task);
    if (insight && !byDoc.has(insight.docId)) {
      byDoc.set(insight.docId, insight);
    }
  }
  return byDoc;
}

interface Notice {
  headline: string;
  detail: string;
  tone: 'warn' | 'pending' | 'clear';
}

/**
 * What the AI noticed about the *latest* document — not a sweep of the whole
 * library. Every upload is read once, so the newest reading is the only one
 * that can still need the patient's attention.
 */
export function latestNotice(
  doc: DocumentReference | undefined,
  insight: DocInsight | undefined
): Notice | undefined {
  if (!doc) return undefined;

  if (!insight) {
    return {
      headline: `${docTitle(doc)} is still being read`,
      detail: `Uploaded ${docDate(doc)} · the AI has not returned its reading yet`,
      tone: 'pending',
    };
  }

  switch (insight.status) {
    case 'unreadable':
      return {
        headline: 'Retake this photo',
        detail: insight.reason ?? 'The scan was too unclear to read.',
        tone: 'warn',
      };
    case 'failed':
      return {
        headline: `Could not read ${docTitle(doc)}`,
        detail: insight.reason ?? 'The extraction failed.',
        tone: 'warn',
      };
    case 'needs-review': {
      const flagged = insight.fields.filter((f) => f.flag);
      if (flagged.length > 0) {
        return {
          headline:
            flagged.length === 1
              ? `${flagged[0].k} ${flagged[0].v} needs a look`
              : `${flagged.length} values need a look`,
          detail: `Read from ${docTitle(doc)} · ${flagged.map((f) => f.k).join(', ')}`,
          tone: 'warn',
        };
      }
      return {
        headline: `Check the reading of ${docTitle(doc)}`,
        detail: insight.reason ?? 'Confirm the AI read your document correctly.',
        tone: 'pending',
      };
    }
    case 'reviewed':
      return undefined;
  }
}

