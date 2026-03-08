'use client';

import { useState, useRef, useEffect } from 'react';
import useNetworkSimulator from '@/hooks/useNetworkSimulator';
import NetworkPanel from '@/app/components/NetworkPanel';

// Message status badge component
function StatusBadge({ status, byteSize, throttleDelay }) {
    const map = {
        sending: { emoji: '⏳', label: 'Sending...', color: '#f59e0b' },
        sent: { emoji: '✅', label: 'Delivered', color: '#22c55e' },
        dropped: { emoji: '❌', label: 'Dropped', color: '#ef4444' },
        retrying: { emoji: '🔄', label: 'Retrying...', color: '#a78bfa' },
        failed: { emoji: '💀', label: 'Failed', color: '#ef4444' },
    };
    const s = map[status] || map.sending;
    return (
        <div style={{ marginTop: '4px' }}>
            <span style={{
                fontSize: '11px', color: s.color, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '4px',
            }}>
                {s.emoji} {s.label}
            </span>
            {/* Transfer info shown after delivery */}
            {status === 'sent' && byteSize != null && (
                <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                    <span>📦 {byteSize}B</span>
                    {throttleDelay > 0 && <span>🐢 +{throttleDelay}ms throttle</span>}
                </span>
            )}
        </div>
    );
}

export default function ChatPage() {
    const [messages, setMessages] = useState([
        { id: 1, text: 'Hey! Try sending a message 👋', sender: 'bot', status: 'sent' },
    ]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [stats, setStats] = useState({ sent: 0, dropped: 0, retried: 0 });
    const bottomRef = useRef(null);

    const {
        latency, setLatency,
        packetLoss, setPacketLoss,
        jitter, setJitter,
        throughput,
        bandwidth, setBandwidth,
        retryEnabled, setRetryEnabled,
        congestionEnabled, setCongestionEnabled,
        simulateSend,
        simulateSendWithRetry,
    } = useNetworkSimulator();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const updateLastMsgStatus = (id, patch) => {
        setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
        );
    };

    const handleSend = async () => {
        if (!input.trim() || isSending) return;
        setIsSending(true);

        const msgId = Date.now();
        const newMsg = { id: msgId, text: input.trim(), sender: 'user', status: 'sending' };
        setMessages((prev) => [...prev, newMsg]);
        setInput('');

        // Simulated "real" send function
        const realSend = async (msg) => {
            await new Promise((r) => setTimeout(r, 50));
        };

        const onStatus = (status) => {
            updateLastMsgStatus(msgId, { status });
            if (status === 'retrying') {
                setStats((s) => ({ ...s, retried: s.retried + 1 }));
            }
        };

        let result;
        if (retryEnabled) {
            result = await simulateSendWithRetry(realSend, newMsg.text, { onStatus, maxRetries: 3 });
        } else {
            result = await simulateSend(realSend, newMsg.text, { onStatus });
        }

        if (result.status === 'sent') {
            updateLastMsgStatus(msgId, {
                status: 'sent',
                byteSize: result.byteSize,
                throttleDelay: result.throttleDelay,
            });
            setStats((s) => ({ ...s, sent: s.sent + 1 }));
            // Simulate bot reply
            setTimeout(() => {
                setMessages((prev) => [...prev, {
                    id: Date.now() + 1,
                    text: getBotReply(newMsg.text, result),
                    sender: 'bot',
                    status: 'sent',
                }]);
            }, 600 + Math.random() * 400);
        } else {
            updateLastMsgStatus(msgId, { status: result.status === 'failed' ? 'failed' : 'dropped' });
            setStats((s) => ({ ...s, dropped: s.dropped + 1 }));
        }

        setIsSending(false);
    };

    const getBotReply = (text, result) => {
        const bwInfo = bandwidth > 0
            ? `BW: ${bandwidth}KB/s (+${result?.throttleDelay ?? 0}ms throttle)`
            : 'BW: Unlimited';
        const replies = [
            `📡 Got your message: "${text}"`,
            `✅ Delivered in ~${result?.totalDelay ?? latency}ms · ${bwInfo}`,
            `🤖 ACK · ${result?.byteSize ?? '?'}B transferred · ${throughput} msg/sec`,
            `📶 Packet received! Latency: ${latency}ms · ${bwInfo}`,
        ];
        return replies[Math.floor(Math.random() * replies.length)];
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
            color: '#e2e8f0',
        }}>
            {/* Header */}
            <div style={{
                background: 'rgba(15,23,42,0.95)',
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid #1e293b',
                padding: '14px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                position: 'sticky', top: 0, zIndex: 10,
            }}>
                <span style={{ fontSize: '24px' }}>💬</span>
                <div>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>
                        Network Simulator Chat
                    </h1>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                        Visualize TCP: latency · packet loss · jitter · bandwidth throttling
                    </p>
                </div>

                {/* Stats */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px' }}>
                    {[
                        { label: 'Sent', value: stats.sent, color: '#22c55e' },
                        { label: 'Dropped', value: stats.dropped, color: '#ef4444' },
                        { label: 'Retried', value: stats.retried, color: '#a78bfa' },
                    ].map((s) => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Bandwidth badge in header */}
                <div style={{
                    background: bandwidth > 0 && bandwidth < 100
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(34,197,94,0.1)',
                    border: bandwidth > 0 && bandwidth < 100
                        ? '1px solid rgba(239,68,68,0.3)'
                        : '1px solid rgba(34,197,94,0.2)',
                    borderRadius: '20px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    color: bandwidth > 0 && bandwidth < 100 ? '#ef4444' : '#22c55e',
                    fontWeight: 600,
                }}>
                    📥 {bandwidth === 0 ? '∞ Unlimited' : `${bandwidth} KB/s`}
                </div>
            </div>

            {/* Main Layout */}
            <div style={{ flex: 1, display: 'flex', gap: '0', maxHeight: 'calc(100vh - 65px)' }}>

                {/* Chat Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Messages */}
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '20px 24px',
                        display: 'flex', flexDirection: 'column', gap: '14px',
                    }}>
                        {messages.map((msg) => (
                            <div key={msg.id} style={{
                                display: 'flex',
                                justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{ maxWidth: '65%' }}>
                                    {msg.sender === 'bot' && (
                                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', paddingLeft: '4px' }}>
                                            🤖 Bot
                                        </div>
                                    )}
                                    <div style={{
                                        background: msg.sender === 'user'
                                            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                                            : 'rgba(30,41,59,0.8)',
                                        border: msg.sender === 'user' ? 'none' : '1px solid #334155',
                                        borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                        padding: '12px 16px',
                                        boxShadow: msg.sender === 'user'
                                            ? '0 4px 15px rgba(79,70,229,0.3)'
                                            : '0 2px 8px rgba(0,0,0,0.2)',
                                        transition: 'all 0.2s',
                                    }}>
                                        <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: '#f1f5f9' }}>
                                            {msg.text}
                                        </p>
                                        {msg.sender === 'user' && (
                                            <StatusBadge
                                                status={msg.status}
                                                byteSize={msg.byteSize}
                                                throttleDelay={msg.throttleDelay}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input Area */}
                    <div style={{
                        borderTop: '1px solid #1e293b',
                        background: 'rgba(15,23,42,0.95)',
                        backdropFilter: 'blur(10px)',
                        padding: '16px 24px',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-end',
                    }}>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder="Type a message... (Enter to send)"
                            disabled={isSending}
                            style={{
                                flex: 1,
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                color: '#f1f5f9',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'border 0.2s',
                                opacity: isSending ? 0.6 : 1,
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isSending || !input.trim()}
                            style={{
                                background: isSending
                                    ? '#334155'
                                    : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '12px 20px',
                                color: '#fff',
                                fontSize: '14px',
                                fontWeight: 700,
                                cursor: isSending || !input.trim() ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                minWidth: '80px',
                                opacity: !input.trim() ? 0.5 : 1,
                            }}
                        >
                            {isSending ? '⏳' : '🚀 Send'}
                        </button>
                    </div>
                </div>

                {/* Network Panel Sidebar */}
                <div style={{
                    width: '300px',
                    borderLeft: '1px solid #1e293b',
                    background: 'rgba(15,23,42,0.7)',
                    padding: '20px 16px',
                    overflowY: 'auto',
                    backdropFilter: 'blur(10px)',
                }}>
                    <NetworkPanel
                        latency={latency} setLatency={setLatency}
                        packetLoss={packetLoss} setPacketLoss={setPacketLoss}
                        jitter={jitter} setJitter={setJitter}
                        throughput={throughput}
                        bandwidth={bandwidth} setBandwidth={setBandwidth}
                        retryEnabled={retryEnabled} setRetryEnabled={setRetryEnabled}
                        congestionEnabled={congestionEnabled} setCongestionEnabled={setCongestionEnabled}
                    />

                    {/* Legend */}
                    <div style={{
                        marginTop: '20px',
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '12px',
                        padding: '14px',
                    }}>
                        <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                            Legend
                        </p>
                        {[
                            { icon: '⏳', label: 'Sending — latency + BW throttle applied' },
                            { icon: '✅', label: 'Delivered — shows byte size & throttle delay' },
                            { icon: '❌', label: 'Dropped — simulated packet loss' },
                            { icon: '🔄', label: 'Retrying — TCP retry logic' },
                            { icon: '💀', label: 'Failed — all retries exhausted' },
                            { icon: '📥', label: 'BW throttle — delays by size ÷ bandwidth' },
                        ].map((item) => (
                            <div key={item.label} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <span style={{ fontSize: '13px' }}>{item.icon}</span>
                                <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
