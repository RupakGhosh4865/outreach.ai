'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Save } from 'lucide-react';
import { Alert, Button, Card, CardTitle, Textarea, cn } from './ui';
import { apiGet, apiPut } from '@/lib/api';

/**
 * Editor for the base CV that tailoring works from.
 *
 * The layout is read off the user's uploaded PDF, and everything tailoring
 * treats as fact — section headings, employers, job titles, dates — is shown
 * read-only here for the same reason: those are the parts the layout guarantee
 * locks, and the server rejects changes to them anyway. What's editable is the
 * prose: the summary, the skill rows and the bullets.
 */
export default function BaseCvEditor({ userEmail }) {
    const [layout, setLayout] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!userEmail) return;
        setLoading(true);
        apiGet('/api/jobs/resume-template')
            .then((d) => setLayout(d.layout))
            .catch(() => setLayout(null))
            .finally(() => setLoading(false));
    }, [userEmail]);

    /** Replace one editable string, keeping every other field identical. */
    function edit(sectionId, blockId, key, value, index = null) {
        setDirty(true);
        setStatus('');
        setLayout((prev) => ({
            ...prev,
            sections: prev.sections.map((s) => (s.id !== sectionId ? s : {
                ...s,
                blocks: s.blocks.map((b) => {
                    if (b.id !== blockId) return b;
                    if (index === null) return { ...b, [key]: value };
                    const list = [...b[key]];
                    list[index] = value;
                    return { ...b, [key]: list };
                }),
            })),
        }));
    }

    async function save() {
        setSaving(true);
        setStatus('');
        try {
            const d = await apiPut('/api/jobs/resume-template', { layout });
            setLayout(d.layout);
            setDirty(false);
            setStatus(`Saved — ${d.changes?.length || 0} line(s) updated.`);
        } catch (err) {
            setStatus(err.message || 'Could not save your edits.');
        }
        setSaving(false);
    }

    if (!userEmail) return null;

    if (loading) {
        return (
            <Card className="mb-5">
                <CardTitle icon={FileText} accent="info" title="Base CV" description="What tailoring rewrites from." />
                <p className="flex items-center gap-2 text-sm text-subtle">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Loading your CV…
                </p>
            </Card>
        );
    }

    if (!layout?.sections?.length) {
        return (
            <Card className="mb-5">
                <CardTitle icon={FileText} accent="info" title="Base CV" description="What tailoring rewrites from." />
                <Alert tone="warning" className="mb-0">
                    No CV structure yet. Upload a text-based PDF or Word resume above — a scanned
                    image can&apos;t be read, so nothing can be tailored from it.
                </Alert>
            </Card>
        );
    }

    return (
        <Card className="mb-5">
            <CardTitle
                icon={FileText}
                accent="info"
                title="Base CV"
                description="The wording every tailored CV starts from. Headings, employers and dates are read from your uploaded file and stay fixed."
                action={
                    <Button type="button" size="sm" loading={saving} disabled={saving || !dirty} onClick={save}>
                        {!saving && <Save className="size-3.5" aria-hidden="true" />}
                        Save CV
                    </Button>
                }
            />

            {status && (
                <Alert tone={status.startsWith('Saved') ? 'success' : 'danger'} className="mb-4">{status}</Alert>
            )}

            <div className="space-y-5">
                {layout.sections.map((section) => (
                    <section key={section.id}>
                        <h3 className="mb-2 border-b border-white/10 pb-1 text-sm font-bold">
                            {section.heading || 'Details'}
                        </h3>

                        <div className="space-y-3">
                            {section.blocks.map((block) => {
                                if (block.type === 'paragraph') {
                                    return (
                                        <Textarea
                                            key={block.id}
                                            aria-label={`${section.heading} paragraph`}
                                            value={block.text}
                                            onChange={(e) => edit(section.id, block.id, 'text', e.target.value)}
                                            className="min-h-20 text-sm"
                                        />
                                    );
                                }

                                if (block.type === 'labeled') {
                                    return (
                                        <div key={block.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                            <span className="w-40 shrink-0 pt-2 text-sm font-semibold text-muted">
                                                {block.label}
                                            </span>
                                            <Textarea
                                                aria-label={block.label}
                                                value={block.text}
                                                onChange={(e) => edit(section.id, block.id, 'text', e.target.value)}
                                                className="min-h-14 text-sm"
                                            />
                                        </div>
                                    );
                                }

                                const items = block.type === 'bullets' ? block.items : block.bullets;
                                const key = block.type === 'bullets' ? 'items' : 'bullets';

                                return (
                                    <div key={block.id} className={cn(block.type === 'entry' && 'rounded-lg bg-white/2 p-3')}>
                                        {block.type === 'entry' && (
                                            <div className="mb-2">
                                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                    <span className="text-sm font-bold">{block.left}</span>
                                                    {block.right && <span className="text-xs text-subtle">{block.right}</span>}
                                                </div>
                                                {block.sub && <p className="text-xs italic text-subtle">{block.sub}</p>}
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            {(items || []).map((item, i) => (
                                                <Textarea
                                                    key={i}
                                                    aria-label={`${block.left || section.heading} bullet ${i + 1}`}
                                                    value={item}
                                                    onChange={(e) => edit(section.id, block.id, key, e.target.value, i)}
                                                    className="min-h-14 text-sm"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </Card>
    );
}
