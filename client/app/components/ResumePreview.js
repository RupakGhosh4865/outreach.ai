'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './ui';

/**
 * A scaled-down live view of the user's actual CV.
 *
 * The point is that optimisation is visible: the same document the user
 * uploaded is on screen, and its wording changes in place. Blocks the optimiser
 * rewrote cross-fade from the old text to the new one and settle with a brief
 * highlight, so it's obvious what was touched and — just as importantly — that
 * the structure around it did not move.
 */

/** Block ids the optimiser changed, mapped to the rewritten strings. */
function indexChanges(changes) {
    const map = new Map();
    for (const change of changes || []) {
        if (!map.has(change.block_id)) map.set(change.block_id, { text: null, items: new Map() });
        const entry = map.get(change.block_id);
        if (typeof change.index === 'number') entry.items.set(change.index, change.after);
        else entry.text = change.after;
    }
    return map;
}

function Line({ children, changed, active, className }) {
    return (
        <span
            className={cn(
                'relative transition-colors duration-500',
                changed && (active ? 'rounded bg-brand/25 text-text' : 'rounded bg-brand/10 text-text'),
                className,
            )}
        >
            {children}
        </span>
    );
}

/** One block, showing either its original or rewritten text. */
function Block({ block, change, revealed }) {
    const swap = (original, next) => {
        const changed = Boolean(next) && revealed;
        return (
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={changed ? 'after' : 'before'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                >
                    <Line changed={changed} active={changed}>{changed ? next : original}</Line>
                </motion.span>
            </AnimatePresence>
        );
    };

    if (block.type === 'paragraph') {
        return <p className="mb-1.5 leading-snug">{swap(block.text, change?.text)}</p>;
    }

    if (block.type === 'labeled') {
        return (
            <div className="mb-1 flex gap-2 leading-snug">
                <span className="w-20 shrink-0 font-bold">{block.label}</span>
                <span className="min-w-0 flex-1">{swap(block.text, change?.text)}</span>
            </div>
        );
    }

    if (block.type === 'bullets') {
        return (
            <ul className="mb-1.5 list-disc pl-4">
                {(block.items || []).map((item, i) => (
                    <li key={i} className="mb-0.5 leading-snug">{swap(item, change?.items.get(i))}</li>
                ))}
            </ul>
        );
    }

    if (block.type === 'entry') {
        return (
            <div className="mb-2">
                <div className="flex items-baseline justify-between gap-3 leading-snug">
                    {/* Never animated: titles, employers and dates are facts the
                        optimiser is not allowed to touch. */}
                    <span className="font-bold">{block.left}</span>
                    {block.right && <span className="shrink-0 text-subtle">{block.right}</span>}
                </div>
                {block.sub && <div className="italic text-subtle">{block.sub}</div>}
                {(block.bullets || []).length > 0 && (
                    <ul className="mt-0.5 list-disc pl-4">
                        {block.bullets.map((b, i) => (
                            <li key={i} className="mb-0.5 leading-snug">{swap(b, change?.items.get(i))}</li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    return null;
}

export default function ResumePreview({ layout, changes = [], running = false, className }) {
    const changeMap = useMemo(() => indexChanges(changes), [changes]);
    // Ids are revealed one at a time so the rewrite reads as it happens rather
    // than the whole document flipping at once.
    const [revealed, setRevealed] = useState(() => new Set());

    const changedIds = useMemo(() => [...changeMap.keys()], [changeMap]);

    useEffect(() => {
        if (!changedIds.length) { setRevealed(new Set()); return undefined; }

        setRevealed(new Set());
        let i = 0;
        const id = setInterval(() => {
            i += 1;
            setRevealed(new Set(changedIds.slice(0, i)));
            if (i >= changedIds.length) clearInterval(id);
        }, 220);
        return () => clearInterval(id);
    }, [changedIds]);

    if (!layout?.sections?.length) return null;

    const header = layout.header || {};

    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-lg border border-white/10 bg-[#f7f7f5] text-[#1a1c20]',
                className,
            )}
            aria-hidden="true"
        >
            {/* Sweeping shimmer while work is in flight. Decorative only — the
                stage label and percentage carry the actual status. */}
            {running && (
                <motion.div
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/55 to-transparent"
                    animate={{ left: ['-33%', '110%'] }}
                    transition={{ duration: 2.1, repeat: Infinity, ease: 'linear' }}
                />
            )}

            <div className="max-h-96 overflow-y-auto p-4 text-[7.5px] leading-snug sm:text-[9px]">
                <div className={cn('mb-2', header.align === 'center' && 'text-center')}>
                    {header.name && <div className="text-[15px] font-extrabold tracking-wide">{header.name}</div>}
                    {header.title && <div className="text-[9px] text-[#3c4149]">{header.title}</div>}
                    {(header.contact_lines || []).map((line, i) => (
                        <div key={i} className="text-[7.5px] text-[#4a5058]">{line}</div>
                    ))}
                </div>

                {layout.sections.map((section) => (
                    <section key={section.id} className="mb-2">
                        {section.heading && (
                            <h3 className="mb-1 border-b border-[#b9bec6] pb-0.5 text-[10px] font-bold">
                                {section.heading}
                            </h3>
                        )}
                        {(section.blocks || []).map((block) => (
                            <Block
                                key={block.id}
                                block={block}
                                change={changeMap.get(block.id)}
                                revealed={revealed.has(block.id)}
                            />
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}
