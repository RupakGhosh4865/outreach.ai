import test from 'node:test';
import assert from 'node:assert/strict';

import { claimDueJobs } from '../services/jobClaim.js';

/**
 * In-memory stand-in for a Mongoose model with an atomic findOneAndUpdate.
 * Enough to prove the claim logic; the real atomicity is Mongo's.
 */
function fakeModel(docs) {
    return {
        docs,
        calls: 0,
        async findOneAndUpdate(filter, update, options) {
            this.calls += 1;
            const claimField = Object.keys(update.$set)[0];
            const staleClause = filter.$or.find((c) => c[claimField]?.$lte);
            const staleBefore = staleClause?.[claimField].$lte;

            const match = this.docs.find((d) => {
                const claimed = d[claimField];
                const unclaimed = claimed === null || claimed === undefined;
                const reclaimable = claimed instanceof Date && staleBefore && claimed <= staleBefore;
                return d.due && (unclaimed || reclaimable);
            });
            if (!match) return null;

            match[claimField] = update.$set[claimField];
            return options?.new === false ? { ...match } : match;
        },
    };
}

test('claimDueJobs claims each due document exactly once', async () => {
    const model = fakeModel([
        { _id: 1, due: true, claimedAt: null },
        { _id: 2, due: true, claimedAt: null },
        { _id: 3, due: false, claimedAt: null },
    ]);

    const claimed = await claimDueJobs({ model, filter: {}, claimField: 'claimedAt' });
    assert.deepEqual(claimed.map((d) => d._id), [1, 2]);

    // A second worker finds nothing left — this is what stops two replicas
    // sending the same scheduled email twice.
    const second = await claimDueJobs({ model, filter: {}, claimField: 'claimedAt' });
    assert.deepEqual(second, []);
});

test('claimDueJobs respects the limit', async () => {
    const model = fakeModel([1, 2, 3, 4, 5].map((_id) => ({ _id, due: true, claimedAt: null })));
    const claimed = await claimDueJobs({ model, filter: {}, claimField: 'claimedAt', limit: 2 });
    assert.equal(claimed.length, 2);
});

test('claimDueJobs reclaims a stale claim from a dead worker', async () => {
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    const model = fakeModel([{ _id: 1, due: true, claimedAt: longAgo }]);

    const claimed = await claimDueJobs({
        model, filter: {}, claimField: 'claimedAt', staleAfterMs: 10 * 60 * 1000,
    });
    assert.equal(claimed.length, 1, 'a job abandoned mid-send must be picked up again');
});

test('claimDueJobs leaves a fresh claim alone', async () => {
    const model = fakeModel([{ _id: 1, due: true, claimedAt: new Date() }]);
    const claimed = await claimDueJobs({
        model, filter: {}, claimField: 'claimedAt', staleAfterMs: 10 * 60 * 1000,
    });
    assert.deepEqual(claimed, []);
});
