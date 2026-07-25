import test from 'node:test';
import assert from 'node:assert/strict';

import { canTransition, transition, IllegalTransitionError, resetStepsFrom } from '../services/applicationFsm.js';
import { PIPELINE_STEPS } from '../models/JobApplication.js';

/** Minimal stand-in for a Mongoose document — the FSM only needs status/steps/save. */
function fakeApp(status = 'ready') {
    return {
        status,
        steps: PIPELINE_STEPS.map((name) => ({ name, status: 'pending' })),
        saved: 0,
        async save() { this.saved += 1; return this; },
    };
}

test('canTransition allows the happy path', () => {
    assert.ok(canTransition('ready', 'applying'));
    assert.ok(canTransition('applying', 'approved'));
    assert.ok(canTransition('approved', 'cv_generating'));
    assert.ok(canTransition('cv_generating', 'cv_generated'));
    assert.ok(canTransition('email_drafted', 'emailing'));
    assert.ok(canTransition('emailing', 'emailed'));
});

test('canTransition refuses to skip the approval gate', () => {
    // Going straight from "ready" to sending would bypass the user confirming
    // they actually applied.
    assert.equal(canTransition('ready', 'emailing'), false);
    assert.equal(canTransition('ready', 'approved'), false);
});

test('terminal states are terminal', () => {
    assert.equal(canTransition('emailed', 'emailing'), false);
    assert.equal(canTransition('denied', 'approved'), false);
});

test('a status can always transition to itself', () => {
    assert.ok(canTransition('email_drafted', 'email_drafted'));
});

test('transition applies the patch and saves', async () => {
    const app = fakeApp('ready');
    const at = new Date();
    await transition(app, 'applying', { appliedAt: at });
    assert.equal(app.status, 'applying');
    assert.equal(app.appliedAt, at);
    assert.equal(app.saved, 1);
});

test('transition throws IllegalTransitionError with a 409', async () => {
    const app = fakeApp('ready');
    await assert.rejects(
        () => transition(app, 'emailed'),
        (err) => err instanceof IllegalTransitionError && err.status === 409,
    );
    assert.equal(app.status, 'ready', 'status must not change on a rejected transition');
});

test('resetStepsFrom clears the named step and everything after it', async () => {
    const app = fakeApp('cv_generated');
    app.steps.forEach((s) => { s.status = 'done'; s.finishedAt = new Date(); });
    app.steps[1].status = 'error';
    app.steps[1].error = 'Hunter returned nothing';

    await resetStepsFrom(app, 'find_contacts');

    assert.equal(app.steps[0].status, 'done', 'earlier steps are preserved');
    for (const step of app.steps.slice(1)) {
        assert.equal(step.status, 'pending');
        assert.equal(step.error, undefined);
        assert.equal(step.finishedAt, undefined);
    }
});

test('resetStepsFrom ignores an unknown step name', async () => {
    const app = fakeApp();
    app.steps[0].status = 'done';
    await resetStepsFrom(app, 'not_a_step');
    assert.equal(app.steps[0].status, 'done');
});
