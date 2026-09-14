/**
 * Self-check for binaryIdFromUrl. Run it with:
 *   node --experimental-strip-types src/lib/documents.check.ts
 *
 * This parser decides which Binary a delete transaction destroys, so every URL
 * shape Medplum actually produces is pinned here.
 */

import assert from 'node:assert/strict';
import { binaryIdFromUrl } from './documents.ts';

const ID = 'aeb5d913-e60b-48ad-918a-88b409266d40';
const VERSION = '4897b10f-1962-4efa-bddb-ed683f35ce41';

// Relative form, as the mobile native upload path writes it.
assert.equal(binaryIdFromUrl(`Binary/${ID}`), ID);

// FHIR endpoint form, as createMedia() returns it.
assert.equal(binaryIdFromUrl(`https://api.medplum.com/fhir/R4/Binary/${ID}`), ID);
assert.equal(binaryIdFromUrl(`https://medplum.example.org/fhir/R4/Binary/${ID}`), ID);

// Pre-signed storage form — what Medplum rewrites attachment URLs to on read.
// Captured from a real session: the id is the FIRST segment, the second is the
// version. Taking the wrong one would delete a Binary that isn't this document.
assert.equal(
  binaryIdFromUrl(
    `https://storage.medplum.com/binary/${ID}/${VERSION}?Expires=1789127301&Key-Pair-Id=K1PPSRCGJGLWV7&Signature=abc~def__`
  ),
  ID
);

// The proxied variant the web app builds in dev.
assert.equal(binaryIdFromUrl(`/storage-proxy/binary/${ID}/${VERSION}?Expires=1`), ID);

// Query strings and fragments must never bleed into the id.
assert.equal(binaryIdFromUrl(`Binary/${ID}?_format=json`), ID);
assert.equal(binaryIdFromUrl(`https://api.medplum.com/fhir/R4/Binary/${ID}#frag`), ID);

// No id means no Binary entry in the transaction — never a guess.
assert.equal(binaryIdFromUrl(undefined), undefined);
assert.equal(binaryIdFromUrl(''), undefined);
assert.equal(binaryIdFromUrl('https://example.com/some/other/file.pdf'), undefined);
assert.equal(binaryIdFromUrl('Media/123'), undefined);

// A Binary path must not be confused with a Media one that merely contains it.
assert.equal(binaryIdFromUrl(`https://api.medplum.com/fhir/R4/Media/${ID}`), undefined);

console.log('documents.ts self-check passed');
