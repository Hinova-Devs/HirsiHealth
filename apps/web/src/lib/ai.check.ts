/**
 * Self-check for the pipeline reader. Run it with:
 *   node --experimental-strip-types src/lib/ai.check.ts
 *
 * Covers the two places a silent bug would be dangerous: deciding a medical
 * value is out of range, and flattening an extraction payload into rows.
 */

import assert from 'node:assert/strict';
import type { DocumentReference, Task } from '@medplum/fhirtypes';
import { insightFromTask, latestNotice, outOfRange, toFields } from './ai.ts';

// --- outOfRange -------------------------------------------------------------

assert.equal(outOfRange('11.2', '12.0-15.5'), true, 'below a plain range');
assert.equal(outOfRange('13.0', '12.0-15.5'), false, 'inside a plain range');
assert.equal(outOfRange('16.0', '12.0-15.5'), true, 'above a plain range');
assert.equal(outOfRange('5.4', '3.9 – 5.5'), false, 'en dash with spaces');
assert.equal(outOfRange('5.4', '3.9 to 5.5'), false, '"to" separator');
assert.equal(outOfRange('6.0', '<5.5'), true, 'above a less-than bound');
assert.equal(outOfRange('5.0', '<5.5'), false, 'under a less-than bound');
assert.equal(outOfRange('30', '>40'), true, 'under a greater-than bound');
// Unparseable input must never flag — a wrong flag is worse than no flag.
assert.equal(outOfRange('negative', '12.0-15.5'), false, 'non-numeric value');
assert.equal(outOfRange('11.2', 'see report'), false, 'non-numeric range');
assert.equal(outOfRange('11.2', undefined), false, 'no range printed');

// --- toFields ---------------------------------------------------------------

const labFields = toFields('lab_result', {
  test_date: '24 Aug 2026',
  results: [
    { test_name: 'Haemoglobin', value: '11.2', unit: 'g/dL', reference_range: '12.0-15.5', confidence: 'high' },
    { test_name: 'Platelets', value: '245', unit: '×10⁹/L', reference_range: '150-400', confidence: 'high' },
    { test_name: 'Smudge', value: '?', confidence: 'low' },
  ],
});
assert.equal(labFields[0].v, '11.2 g/dL');
assert.equal(labFields[0].flag, true, 'below-range value is flagged');
assert.equal(labFields[0].note, 'outside range 12.0-15.5');
assert.equal(labFields[1].flag, false, 'in-range value is not flagged');
assert.equal(labFields[2].flag, true, 'low-confidence read is flagged');
assert.equal(labFields[3].k, 'Collected', 'test date is appended last');

const rxFields = toFields('prescription', {
  prescriber_name: 'Dr Yusuf Aden',
  medications: [
    { medication_name: 'Amoxicillin', dosage: '500 mg', frequency: '3 times a day', duration: '7 days', confidence: 'high' },
  ],
});
assert.equal(rxFields[0].v, 'Amoxicillin 500 mg');
assert.equal(rxFields[0].note, '3 times a day · 7 days');
assert.equal(rxFields.at(-1)?.v, 'Dr Yusuf Aden');

// An unknown document type must yield no rows rather than throwing.
assert.deepEqual(toFields('unclear', {}), []);

// --- insightFromTask --------------------------------------------------------

const reviewTask: Task = {
  resourceType: 'Task',
  status: 'ready',
  intent: 'order',
  code: { text: 'Review AI-extracted document data' },
  focus: { reference: 'DocumentReference/abc' },
  output: [
    { type: { text: 'documentType' }, valueString: 'lab_result' },
    {
      type: { text: 'extractedData' },
      valueString: JSON.stringify({
        results: [{ test_name: 'Haemoglobin', value: '11.2', unit: 'g/dL', reference_range: '12.0-15.5', confidence: 'high' }],
      }),
    },
    { type: { text: 'explanation' }, valueString: 'Some prose we deliberately ignore.' },
    { type: { text: 'confidence' }, valueString: 'high' },
  ],
};
const review = insightFromTask(reviewTask)!;
assert.equal(review.docId, 'abc');
assert.equal(review.status, 'needs-review');
assert.equal(review.confidence, 'high');
assert.equal(review.fields.length, 1);
assert.match(review.reason!, /outside their printed range/);

const retake = insightFromTask({
  resourceType: 'Task',
  status: 'ready',
  intent: 'order',
  code: { text: 'Retake photo' },
  focus: { reference: 'DocumentReference/blurry' },
  output: [{ type: { text: 'reason' }, valueString: 'Too dark to read.' }],
})!;
assert.equal(retake.status, 'unreadable');
assert.equal(retake.reason, 'Too dark to read.');

const failed = insightFromTask({
  resourceType: 'Task',
  status: 'failed',
  intent: 'order',
  code: { text: 'Extraction failed: provider timeout' },
  focus: { reference: 'DocumentReference/boom' },
})!;
assert.equal(failed.status, 'failed');
// Patients get a sentence; the raw provider error stays out of their way.
assert.match(failed.reason!, /problem on our side/);
assert.equal(failed.technicalDetail, 'Extraction failed: provider timeout');

// A reviewed document is no longer an alert.
assert.equal(insightFromTask({ ...reviewTask, status: 'completed' })!.status, 'reviewed');

// A Task with no focus is not about a document at all.
assert.equal(insightFromTask({ resourceType: 'Task', status: 'ready', intent: 'order' }), undefined);

// --- latestNotice: only ever about the newest document ----------------------

const doc: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'abc',
  status: 'current',
  content: [{ attachment: { title: 'Blood test' } }],
};

// No document at all — nothing to report.
assert.equal(latestNotice(undefined, undefined), undefined);

// Uploaded but the pipeline has not answered yet.
assert.equal(latestNotice(doc, undefined)?.tone, 'pending');

// Flagged value on the newest document is the headline.
const flaggedNotice = latestNotice(doc, review)!;
assert.equal(flaggedNotice.tone, 'warn');
assert.equal(flaggedNotice.headline, 'Haemoglobin 11.2 g/dL needs a look');

// Two flagged values collapse into a count rather than a list of headlines.
assert.equal(
  latestNotice(doc, {
    ...review,
    fields: [
      { k: 'Haemoglobin', v: '11.2 g/dL', flag: true },
      { k: 'Platelets', v: '90 ×10⁹/L', flag: true },
    ],
  })!.headline,
  '2 values need a look'
);

// Read cleanly but not yet confirmed by the patient.
assert.equal(
  latestNotice(doc, { ...review, reason: undefined, fields: [{ k: 'Glucose', v: '5.4 mmol/L' }] })!
    .tone,
  'pending'
);

// Already reviewed — the dashboard shows the all-clear instead.
assert.equal(latestNotice(doc, { ...review, status: 'reviewed' }), undefined);

// Unreadable and failed both surface as warnings.
assert.equal(latestNotice(doc, retake)!.tone, 'warn');
assert.equal(latestNotice(doc, retake)!.headline, 'Retake this photo');
assert.equal(latestNotice(doc, failed)!.tone, 'warn');

// --- real payload from production ------------------------------------------
// Captured from Task/71ef26e9 (a CBC + metabolic panel). Locks in the range
// format this lab actually emits: spaces around the hyphen, "4.5 - 11.0".

const realPanel = {
  test_date: '2026-06-04',
  overall_confidence: 'high',
  results: [
    { test_name: 'White Blood Cell (WBC)', value: '6.5', confidence: 'high', reference_range: '4.5 - 11.0', unit: 'x10^3 / uL' },
    { test_name: 'Hemoglobin (HGB)', value: '14.8', confidence: 'high', reference_range: '13.5 - 17.5', unit: 'g/dL' },
    { test_name: 'Creatinine', value: '0.9', confidence: 'high', reference_range: '0.6 - 1.3', unit: 'mg/dL' },
    { test_name: 'Sodium (Na)', value: '140', confidence: 'high', reference_range: '135 - 145', unit: 'mEq/L' },
  ],
};

const realFields = toFields('lab_result', realPanel);
assert.equal(realFields.length, 5, 'four results plus the collection date');
assert.equal(realFields[0].v, '6.5 x10^3 / uL', 'value and unit joined');
assert.equal(realFields[0].note, 'range 4.5 - 11.0');
assert.equal(
  realFields.filter((f) => f.flag).length,
  0,
  'every value is in range — no false flags on healthy results'
);
assert.equal(realFields[4].k, 'Collected');
assert.match(realFields[4].v, /2026/, 'ISO collection date is formatted, not raw');
assert.notEqual(realFields[4].v, '2026-06-04', 'ISO date is not shown raw');

// Same lab, same spaced-range format, one value pushed out of range.
const perturbed = toFields('lab_result', {
  ...realPanel,
  results: [{ ...realPanel.results[1], value: '11.9' }],
});
assert.equal(perturbed[0].flag, true, 'spaced range still detects a low value');
assert.equal(perturbed[0].note, 'outside range 13.5 - 17.5');

console.log('ai.ts self-check passed');
