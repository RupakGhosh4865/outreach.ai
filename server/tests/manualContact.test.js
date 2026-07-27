import test from 'node:test';
import assert from 'node:assert/strict';

import { canTransition } from '../services/applicationFsm.js';
import { PIPELINE_STEPS } from '../models/JobApplication.js';

/**
 * Guards the recovery path for an application stranded by contact discovery.
 *
 * When `find_contacts` finds nothing the application stops at "cv_generated"
 * with a failed step. Adding a recipient by hand has to be able to move it
 * forward and resume from the email step — if either of these assumptions
 * breaks, the manual-recipient route silently leaves the user stuck again.
 */

test('a stranded application can be moved forward once a recipient is supplied', () => {
    // The status after generate_cv succeeds and find_contacts fails.
    assert.ok(canTransition('cv_generated', 'contacts_found'));
    // …and from there the email can be drafted and sent.
    assert.ok(canTransition('contacts_found', 'email_drafted'));
    assert.ok(canTransition('email_drafted', 'emailing'));
});

test('resuming from generate_email does not re-run contact discovery', () => {
    // Adding a recipient by hand resumes at generate_email. If find_contacts
    // were still in that slice it would run again and fail the same way,
    // undoing the recipient the user just supplied.
    const remaining = PIPELINE_STEPS.slice(PIPELINE_STEPS.indexOf('generate_email'));
    assert.deepEqual(remaining, ['generate_email', 'send_email']);
    assert.ok(!remaining.includes('find_contacts'));
});

test('a sent application is terminal', () => {
    // The route refuses to edit recipients once sent; this is why.
    assert.ok(!canTransition('emailed', 'contacts_found'));
    assert.ok(!canTransition('emailed', 'emailing'));
});
