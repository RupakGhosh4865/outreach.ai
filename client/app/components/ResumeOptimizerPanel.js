'use client';

const chip = (bg, color) => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: '0.75rem',
    fontWeight: 600,
    background: bg,
    color,
    margin: '2px 4px 2px 0',
});

export default function ResumeOptimizerPanel({ apiBase, optimizeState, compact = false }) {
    if (!optimizeState) return null;
    const { status, key, result } = optimizeState;

    if (status === 'pending') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(99,102,241,0.08)', borderRadius: 12, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 16 }}>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 600 }}>
                    ✨ Building your dynamic CV for this job… (~60-90s)
                </span>
            </div>
        );
    }

    if (status === 'failed') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.25)', marginBottom: 16 }}>
                <span>⚠️</span>
                <span style={{ fontSize: '0.85rem', color: '#fbbf24' }}>
                    Resume optimization unavailable — your profile resume will be attached instead.
                </span>
            </div>
        );
    }

    if (status !== 'done' || !result) return null;

    const pdfUrl = `${apiBase}${result.pdfUrl || `/api/jobs/optimize-resume/pdf?key=${key}`}`;
    const winner = result.selectedResume;

    return (
        <div style={{ padding: 16, background: 'rgba(16,185,129,0.05)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ✅ Dynamic CV Ready
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                        👁 Preview PDF
                    </a>
                    <a href={pdfUrl} download="Optimized_Resume.pdf" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                        ⬇ Download
                    </a>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[['genai', '🤖 Gen AI', result.genaiScore], ['backend', '⚙️ Backend', result.backendScore]].map(([type, label, score]) => (
                    <div key={type} style={{
                        padding: 12, background: 'var(--bg-panel, rgba(255,255,255,0.03))', borderRadius: 8,
                        border: winner === type ? '1px solid #10b981' : '1px solid var(--border, rgba(255,255,255,0.1))',
                    }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{label}</span>
                            {winner === type && <span style={{ color: '#10b981', fontWeight: 800 }}>SELECTED</span>}
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: score > 75 ? '#10b981' : score > 50 ? '#f59e0b' : '#ef4444' }}>
                            {score ?? 0}%
                        </div>
                    </div>
                ))}
            </div>

            {result.addedKeywords?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>➕ Keywords added</div>
                    {result.addedKeywords.map((k, i) => <span key={i} style={chip('rgba(16,185,129,0.12)', '#34d399')}>{k}</span>)}
                </div>
            )}
            {result.removedKeywords?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>➖ Removed</div>
                    {result.removedKeywords.map((k, i) => <span key={i} style={chip('rgba(239,68,68,0.12)', '#f87171')}>{k}</span>)}
                </div>
            )}
            {result.atsTips?.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>💡 ATS Tips</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {result.atsTips.slice(0, 5).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}
