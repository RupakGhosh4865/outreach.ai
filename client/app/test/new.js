const patientData = {
    'Blood Pressure': [
        { value: '120/80', dated: '2024-01-01', status: 'Normal' },
        { value: '135/85', dated: '2024-01-02', status: 'High' },
        { value: '118/75', dated: '2024-01-03', status: 'Normal' }
    ],
    'Heart Rate': [
        { value: '72', dated: '2024-01-01', unit: 'bpm' },
        { value: '85', dated: '2024-01-02', unit: 'bpm' }
    ]
};

function generateReport(data) {
    const report = {};

    Object.entries(data).forEach(([vitalName, history]) => {
        // 1. Get the latest reading
        const latest = history[history.length - 1];

        // 2. Calculate the average value (for numerical data like Heart Rate)
        // We use parseFloat to handle strings like "72"
        const sum = history.reduce((acc, curr) => acc + parseFloat(curr.value), 0);
        const average = (sum / history.length).toFixed(1);

        // 3. Check for alerts (e.g., if any status was "High")
        const hasAlerts = history.some(entry => entry.status === 'High');

        report[vitalName] = {
            latestValue: latest.value,
            lastUpdated: new Date(latest.dated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            averageValue: average,
            needsAttention: hasAlerts
        };
    });

    return report;
}

console.log("--- Final Patient Report ---");
console.table(generateReport(patientData));