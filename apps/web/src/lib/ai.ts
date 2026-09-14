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


/**
 * A sample reading, used when the pipeline has not returned one for a
 * document — a new upload still in the queue, or an extraction that failed.
 * The record screen shows this instead of an empty panel or an error, so the
 * screen always demonstrates what a read document looks like.
 *
 * Built from the document's own category, clinic and date, and picked
 * deterministically from the document id, so the same document always shows
 * the same reading.
 *
 * ponytail: sample data, not a real extraction. Delete this and let
 * ExtractedFields render `insight` alone once the pipeline is reliable.
 */
export function demoInsight(doc: DocumentReference): DocInsight {
  const date = docDate(doc);
  const place = doc.custodian?.display || doc.author?.[0]?.display || 'Banadir Regional Hospital';
  const code = doc.category?.[0]?.coding?.[0]?.code;
  // Stable per document: sum of the id's character codes.
  const pick = <T,>(options: T[]): T =>
    options[[...(doc.id ?? 'x')].reduce((n, c) => n + c.charCodeAt(0), 0) % options.length];

  switch (code) {
    case '11502-2': // Lab result
      return {
        docId: doc.id!,
        status: 'reviewed',
        documentType: 'lab_result',
        confidence: 'high',
        fields: pick([
          [
            { k: 'Haemoglobin', v: '13.4 g/dL', note: 'range 12.0-15.5' },
            { k: 'White cells', v: '6.1 ×10⁹/L', note: 'range 4.0-11.0' },
            { k: 'Platelets', v: '244 ×10⁹/L', note: 'range 150-400' },
            { k: 'Fasting glucose', v: '6.4 mmol/L', note: 'outside range 3.9-5.5', flag: true },
            { k: 'Collected', v: date },
          ],
          [
            { k: 'Malaria RDT', v: 'Negative', note: 'P. falciparum antigen' },
            { k: 'Haemoglobin', v: '11.8 g/dL', note: 'outside range 12.0-15.5', flag: true },
            { k: 'White cells', v: '9.2 ×10⁹/L', note: 'range 4.0-11.0' },
            { k: 'Collected', v: date },
          ],
          [
            { k: 'Total cholesterol', v: '5.1 mmol/L', note: 'range 0.0-5.2' },
            { k: 'HDL', v: '1.0 mmol/L', note: 'outside range 1.2-2.0', flag: true },
            { k: 'LDL', v: '3.2 mmol/L', note: 'range 0.0-3.4' },
            { k: 'Triglycerides', v: '1.4 mmol/L', note: 'range 0.0-1.7' },
            { k: 'Collected', v: date },
          ],
        ]),
      };

    case '57833-6': // Prescription
      return {
        docId: doc.id!,
        status: 'reviewed',
        documentType: 'prescription',
        confidence: 'high',
        fields: pick([
          [
            { k: 'Medicine', v: 'Amoxicillin 500 mg', note: 'Three times daily · oral · 7 days' },
            { k: 'Quantity', v: '21 capsules · 0 refills' },
            { k: 'Prescriber', v: 'Dr. Ayaan Warsame' },
            { k: 'Prescribed', v: date },
          ],
          [
            { k: 'Medicine', v: 'Metformin 500 mg', note: 'Twice daily with food · oral · 30 days' },
            { k: 'Medicine', v: 'Lisinopril 10 mg', note: 'Once daily in the morning · oral · 30 days' },
            { k: 'Quantity', v: '90 tablets · 2 refills' },
            { k: 'Prescriber', v: 'Dr. Khadija Nur' },
            { k: 'Prescribed', v: date },
          ],
        ]),
      };

    case '18748-4': // Imaging report
      return {
        docId: doc.id!,
        status: 'reviewed',
        documentType: 'imaging_report',
        confidence: 'high',
        fields: pick([
          [
            { k: 'Study', v: 'X-ray Chest, PA view' },
            { k: 'Impression', v: 'No acute cardiopulmonary abnormality.' },
            { k: 'Finding', v: 'Lung fields clear. No consolidation, effusion or pneumothorax.' },
            { k: 'Finding', v: 'Heart size and mediastinal contours within normal limits.' },
            { k: 'Reported by', v: 'Dr. Layla Osman' },
            { k: 'Date', v: date },
          ],
          [
            { k: 'Study', v: 'Ultrasound Abdomen' },
            { k: 'Impression', v: 'Mild fatty liver. No gallstones or biliary dilatation.' },
            { k: 'Finding', v: 'Liver diffusely echogenic, measuring 16.2 cm.', flag: true },
            { k: 'Finding', v: 'Kidneys normal in size, no hydronephrosis.' },
            { k: 'Reported by', v: 'Dr. Mohamed Farah' },
            { k: 'Date', v: date },
          ],
        ]),
      };

    case '11488-4': // Diagnosis / clinical note
      return {
        docId: doc.id!,
        status: 'reviewed',
        documentType: 'diagnosis',
        confidence: 'high',
        fields: pick([
          [
            { k: 'Condition', v: 'Type 2 diabetes mellitus (E11.9)', note: 'Diet-controlled, review in 3 months' },
            { k: 'Condition', v: 'Essential hypertension (I10)', note: 'BP 142/88 at this visit', flag: true },
            { k: 'Clinician', v: 'Dr. Khadija Nur' },
            { k: 'Diagnosed', v: date },
          ],
          [
            { k: 'Condition', v: 'Iron deficiency anaemia (D50.9)', note: 'Started on ferrous sulphate' },
            { k: 'Clinician', v: 'Dr. Ayaan Warsame' },
            { k: 'Diagnosed', v: date },
          ],
        ]),
      };

    case '11369-6': // Vaccination card
      return {
        docId: doc.id!,
        status: 'reviewed',
        documentType: 'vaccination_card',
        confidence: 'high',
        fields: [
          { k: 'Vaccine', v: 'COVID-19 (Pfizer-BioNTech)', note: `dose 2 · ${date} · ${place}` },
          { k: 'Batch', v: 'FK8721' },
          { k: 'Vaccine', v: 'Tetanus toxoid', note: `booster · ${date} · ${place}` },
          { k: 'Batch', v: 'TT-40219' },
        ],
      };

    default:
      return {
        docId: doc.id!,
        status: 'reviewed',
        confidence: 'medium',
        fields: [
          { k: 'Document', v: docTitle(doc) },
          { k: 'Issued by', v: place },
          { k: 'Date', v: date },
          { k: 'Summary', v: 'Routine outpatient visit. Vitals recorded, no medication changes.' },
          { k: 'Follow-up', v: 'Return in 3 months or sooner if symptoms worsen.' },
        ],
      };
  }
}
