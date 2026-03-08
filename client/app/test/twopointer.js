const weights = [60, 65, 72, 75, 80, 90];
const targetWeight = 147;
function findTarget(arr, target) {
    let left = 0;
    let right = weights.length - 1;

    while (left < right) {
        const sum = arr[left] + arr[right];
        if (sum === target) {
            return [arr[left], arr[right]]
        } else if (sum < target) {
            left++
        } else {
            right--;
        }
    }
    return []
}

console.log(findTarget(weights, targetWeight))