'use client';

import React from 'react';

export default function NetworkPanel({
    latency, setLatency,
    packetLoss, setPacketLoss,
    jitter, setJitter,
    throughput,
    bandwidth, setBandwidth,
    retryEnabled, setRetryEnabled,
    congestionEnabled, setCongestionEnabled,
}) {
    const getLatencyColor = () => {
        if (latency < 200) return '#22c55e';
        if (latency < 800) return '#f59e0b';
        return '#ef4444';
    };

    const getLossColor = () => {
        if (packetLoss < 10) return '#22c55e';
        if (packetLoss < 40) return '#f59e0b';
        return '#ef4444';
    };

    const getBandwidthColor = () => {
        if (!bandwidth || bandwidth === 0) return '#22c55e';   // unlimited = green
        if (bandwidth >= 500) return '#22c55e';
        if (bandwidth >= 100) return '#f59e0b';
        return '#ef4444';
    };

    const getBandwidthLabel = () => {
        if (!bandwidth || bandwidth === 0) return '∞ Unlimited';
        if (bandwidth >= 1024) return `${(bandwidth / 1024).toFixed(1)} MB/s`;
        return `${bandwidth} KB/s`;
    };

    // Preset profiles
    const presets = [
        { label: '2G', bw: 10, lat: 600, loss: 5 },
        { label: '3G', bw: 200, lat: 200, loss: 2 },
        { label: '4G', bw: 1000, lat: 50, loss: 0 },
        { label: 'WiFi', bw: 0, lat: 20, loss: 0 },
        { label: 'Offline', bw: 1, lat: 2000, loss: 99 },
    ];

    const applyPreset = (p) => {
        setBandwidth(p.bw);
        setLatency(p.lat);
        setPacketLoss(p.loss);
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '20px',
            color: '#e2e8f0',
            fontFamily: "'Inter', sans-serif",
            minWidth: '280px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>🌐</span>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.5px' }}>
                    Network Simulator
                </h2>
                <div style={{
                    marginLeft: 'auto',
                    width: '8px', height: '8px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 6px #22c55e',
                    animation: 'pulse 1.5s infinite',
                }} />
            </div>

            {/* Preset Profiles */}
            <div style={{ marginBottom: '18px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    📶 Quick Presets
                </p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {presets.map((p) => (
                        <button
                            key={p.label}
                            onClick={() => applyPreset(p)}
                            style={{
                                background: p.label === 'Offline' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                                border: p.label === 'Offline' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(99,102,241,0.4)',
                                borderRadius: '8px',
                                padding: '4px 10px',
                                color: p.label === 'Offline' ? '#ef4444' : '#a5b4fc',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => e.target.style.opacity = '0.75'}
                            onMouseLeave={e => e.target.style.opacity = '1'}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bandwidth Slider */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>📥 Bandwidth</label>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: getBandwidthColor() }}>
                        {getBandwidthLabel()}
                    </span>
                </div>
                <input
                    type="range" min="0" max="1000" step="10" value={bandwidth}
                    onChange={(e) => setBandwidth(Number(e.target.value))}
                    style={{ width: '100%', accentColor: getBandwidthColor(), cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                    <span>∞ Free</span><span>100 KB/s</span><span>1 MB/s</span>
                </div>
                {bandwidth > 0 && bandwidth < 100 && (
                    <div style={{
                        marginTop: '6px', fontSize: '11px',
                        color: '#ef4444', background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: '6px', padding: '4px 8px',
                    }}>
                        ⚠️ Very slow — messages will be delayed significantly
                    </div>
                )}
            </div>

            {/* Latency Slider */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>⏱ Latency</label>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: getLatencyColor() }}>
                        {latency} ms
                    </span>
                </div>
                <input
                    type="range" min="0" max="2000" value={latency}
                    onChange={(e) => setLatency(Number(e.target.value))}
                    style={{ width: '100%', accentColor: getLatencyColor(), cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                    <span>0ms</span><span>1s</span><span>2s</span>
                </div>
            </div>

            {/* Packet Loss Slider */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>📦 Packet Loss</label>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: getLossColor() }}>
                        {packetLoss}%
                    </span>
                </div>
                <input
                    type="range" min="0" max="100" value={packetLoss}
                    onChange={(e) => setPacketLoss(Number(e.target.value))}
                    style={{ width: '100%', accentColor: getLossColor(), cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                    <span>0%</span><span>50%</span><span>100%</span>
                </div>
            </div>

            {/* Jitter Slider */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>〰️ Jitter</label>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa' }}>
                        ±{jitter} ms
                    </span>
                </div>
                <input
                    type="range" min="0" max="500" value={jitter}
                    onChange={(e) => setJitter(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
                />
            </div>

            {/* Throughput */}
            <div style={{
                background: '#0f172a',
                border: '1px solid #1e40af',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Throughput</p>
                    <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 800, color: '#38bdf8' }}>
                        {throughput}
                    </p>
                </div>
                <span style={{ fontSize: '12px', color: '#475569' }}>msg/sec</span>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#1e293b', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer',
                    border: retryEnabled ? '1px solid #22c55e' : '1px solid #334155',
                    transition: 'border 0.2s',
                }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>🔄 Auto-Retry (TCP)</span>
                    <input
                        type="checkbox" checked={retryEnabled}
                        onChange={(e) => setRetryEnabled(e.target.checked)}
                        style={{ accentColor: '#22c55e', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                </label>
                <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#1e293b', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer',
                    border: congestionEnabled ? '1px solid #f59e0b' : '1px solid #334155',
                    transition: 'border 0.2s',
                }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>🚦 Congestion Sim</span>
                    <input
                        type="checkbox" checked={congestionEnabled}
                        onChange={(e) => setCongestionEnabled(e.target.checked)}
                        style={{ accentColor: '#f59e0b', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                </label>
            </div>

            {/* Network Quality Badge */}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
                {latency < 100 && packetLoss < 5 && (!bandwidth || bandwidth >= 500) ? (
                    <span style={{ fontSize: '12px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(34,197,94,0.3)' }}>
                        ✅ Excellent Network
                    </span>
                ) : latency < 500 && packetLoss < 30 && (!bandwidth || bandwidth >= 100) ? (
                    <span style={{ fontSize: '12px', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.3)' }}>
                        ⚠️ Degraded Network
                    </span>
                ) : (
                    <span style={{ fontSize: '12px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(239,68,68,0.3)' }}>
                        ❌ Poor Network
                    </span>
                )}
            </div>
        </div>
    );
}
