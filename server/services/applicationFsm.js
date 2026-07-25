import JobApplication, { PIPELINE_STEPS } from '../models/JobApplication.js';

/**
 * Allowed status transitions. Every status change goes through transition() so the
 * workflow stays auditable and a stale client can't push an application backwards.
 */
const ALLOWED = {
    found: ['validating', 'ready'],
    validating: ['ready', 'found'],
    ready: ['applying', 'denied', 'validating'],
    applying: ['approved', 'denied', 'ready'],
    denied: [],
    approved: ['cv_generating'],
    cv_generating: ['cv_generated', 'cv_failed'],
    cv_failed: ['cv_generating'],
    cv_generated: ['contacts_found', 'email_drafted'],
    contacts_found: ['email_drafted', 'emailing'],
    email_drafted: ['emailing', 'email_drafted'],
    emailing: ['emailed', 'email_failed'],
    email_failed: ['emailing', 'email_drafted'],
    emailed: [],
};

export class IllegalTransitionError extends Error {
    constructor(from, to) {
        super(`Cannot move application from "${from}" to "${to}".`);
        this.name = 'IllegalTransitionError';
        this.status = 409;
    }
}

export function canTransition(from, to) {
    return from === to || (ALLOWED[from] || []).includes(to);
}

/** Move an application to a new status, applying optional field patches. */
export async function transition(app, to, patch = {}) {
    if (!canTransition(app.status, to)) throw new IllegalTransitionError(app.status, to);
    Object.assign(app, patch);
    app.status = to;
    await app.save();
    return app;
}

const findStep = (app, name) => app.steps.find((s) => s.name === name);

export async function startStep(app, name) {
    const step = findStep(app, name);
    if (step) {
        step.status = 'running';
        step.error = undefined;
        step.startedAt = new Date();
        step.finishedAt = undefined;
        await app.save();
    }
    return app;
}

export async function finishStep(app, name, { error = null, patch = {} } = {}) {
    const step = findStep(app, name);
    if (step) {
        step.status = error ? 'error' : 'done';
        step.error = error || undefined;
        step.finishedAt = new Date();
    }
    Object.assign(app, patch);
    await app.save();
    return app;
}

/** Reset the steps at and after `name` so a retry re-runs them. */
export async function resetStepsFrom(app, name) {
    const index = PIPELINE_STEPS.indexOf(name);
    if (index === -1) return app;
    for (const stepName of PIPELINE_STEPS.slice(index)) {
        const step = findStep(app, stepName);
        if (step) {
            step.status = 'pending';
            step.error = undefined;
            step.startedAt = undefined;
            step.finishedAt = undefined;
        }
    }
    await app.save();
    return app;
}

/**
 * After a restart, steps left "running" belong to a process that no longer exists.
 * Mark them as interrupted so the UI offers a retry instead of spinning forever.
 */
export async function sweepInterruptedSteps() {
    const stuck = await JobApplication.find({ 'steps.status': 'running' });
    for (const app of stuck) {
        for (const step of app.steps) {
            if (step.status === 'running') {
                step.status = 'error';
                step.error = 'Interrupted by a server restart — retry this step.';
                step.finishedAt = new Date();
            }
        }
        if (app.status === 'cv_generating') app.status = 'cv_failed';
        else if (app.status === 'emailing') app.status = 'email_failed';
        await app.save();
    }
    if (stuck.length) console.log(`[FSM] Reset ${stuck.length} interrupted application(s).`);
    return stuck.length;
}
