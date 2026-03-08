import { useState, useRef } from 'react';

export default function useNetworkSimulator() {
    const [latency, setLatency] = useState(100);      // ms
    const [packetLoss, setPacketLoss] = useState(0);  // %
    const [jitter, setJitter] = useState(0);          // ms extra random delay
    const [throughput, setThroughput] = useState(0);  // msg/sec
    const [bandwidth, setBandwidth] = useState(0);    // KB/s  (0 = unlimited)
    const [retryEnabled, setRetryEnabled] = useState(false);
    const [congestionEnabled, setCongestionEnabled] = useState(false);

    // Track message count for congestion simulation
    const msgCountRef = useRef(0);
    const msgWindowRef = useRef(Date.now());

    const _getEffectivePacketLoss = () => {
        if (!congestionEnabled) return packetLoss;
        const now = Date.now();
        if (now - msgWindowRef.current > 3000) {
            msgCountRef.current = 0;
            msgWindowRef.current = now;
        }
        const extra = Math.min(msgCountRef.current * 4, 60);
        return Math.min(packetLoss + extra, 100);
    };

    /**
     * Compute the throttle delay in ms for a given message string.
     * bandwidth is in KB/s — 0 means unlimited (no extra delay).
     * Returns: { throttleDelay, byteSize }
     */
    const _getBandwidthDelay = (message) => {
        const byteSize = new TextEncoder().encode(String(message)).length;
        if (!bandwidth || bandwidth <= 0) return { throttleDelay: 0, byteSize };
        // time (ms) = bytes / (bandwidth * 1024) * 1000
        const throttleDelay = (byteSize / (bandwidth * 1024)) * 1000;
        return { throttleDelay, byteSize };
    };

    const simulateSend = async (sendFn, message, { onStatus } = {}) => {
        msgCountRef.current += 1;

        const effectiveLoss = _getEffectivePacketLoss();

        // Packet loss simulation
        const dropChance = Math.random() * 100;
        if (dropChance < effectiveLoss) {
            console.log('❌ Packet Dropped');
            onStatus?.('dropped');
            return { status: 'dropped' };
        }

        onStatus?.('sending');

        // Latency + Jitter simulation
        const jitterAmount = jitter > 0 ? Math.random() * jitter : 0;
        const totalLatencyDelay = latency + jitterAmount;

        // Bandwidth throttle delay
        const { throttleDelay, byteSize } = _getBandwidthDelay(message);

        const totalDelay = totalLatencyDelay + throttleDelay;
        await new Promise((res) => setTimeout(res, totalDelay));

        const start = Date.now();
        await sendFn(message);
        const end = Date.now();

        const timeTaken = Math.max((end - start) / 1000, 0.001);
        const currentThroughput = (1 / timeTaken).toFixed(2);
        setThroughput(currentThroughput);

        onStatus?.('sent');
        return {
            status: 'sent',
            timeTaken: end - start,
            byteSize,
            throttleDelay: Math.round(throttleDelay),
            totalDelay: Math.round(totalDelay),
        };
    };

    const simulateSendWithRetry = async (sendFn, message, { onStatus, maxRetries = 3 } = {}) => {
        let attempt = 0;
        while (attempt <= maxRetries) {
            const result = await simulateSend(sendFn, message, { onStatus });
            if (result.status === 'sent') return result;
            attempt++;
            if (attempt <= maxRetries) {
                console.log(`🔄 Retry attempt ${attempt}`);
                onStatus?.('retrying');
                await new Promise((res) => setTimeout(res, 300));
            }
        }
        return { status: 'failed' };
    };

    return {
        latency, setLatency,
        packetLoss, setPacketLoss,
        jitter, setJitter,
        throughput,
        bandwidth, setBandwidth,
        retryEnabled, setRetryEnabled,
        congestionEnabled, setCongestionEnabled,
        simulateSend,
        simulateSendWithRetry,
    };
}
