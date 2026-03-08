const heartRates = [72, 85, 72, 90, 85, 72];

function findDuplicates(arr) {
    const frequency = {}

    for (let rate of arr) {
        frequency[rate] = (frequency[rate] || 0) + 1
    }

    return frequency
}

console.log(findDuplicates(heartRates))