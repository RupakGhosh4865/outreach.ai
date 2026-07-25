/**
 * Atomic claim for cron-driven work.
 *
 * The naive pattern — `find(due)` then loop and send — is safe with exactly one
 * server process and duplicates every email the moment there are two. Each
 * document here is claimed with a single findOneAndUpdate, so only the replica
 * that wins the write processes it.
 *
 * A claim older than `staleAfterMs` is reclaimable: it belongs to a process that
 * died mid-send, and we would rather risk a rare duplicate than drop the job.
 */
export async function claimDueJobs({
    model,
    filter,
    claimField,
    limit = 25,
    staleAfterMs = 10 * 60 * 1000,
}) {
    const claimed = [];
    const staleBefore = new Date(Date.now() - staleAfterMs);

    for (let i = 0; i < limit; i++) {
        const doc = await model.findOneAndUpdate(
            {
                ...filter,
                $or: [
                    { [claimField]: null },
                    { [claimField]: { $exists: false } },
                    { [claimField]: { $lte: staleBefore } },
                ],
            },
            { $set: { [claimField]: new Date() } },
            { new: true, sort: { _id: 1 } },
        );
        if (!doc) break;
        claimed.push(doc);
    }

    return claimed;
}
