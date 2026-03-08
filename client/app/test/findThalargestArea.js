let bottomLeft = [[1, 1], [2, 2], [1, 2]]
let topRight = [[3, 3], [4, 4], [3, 4]]


// 1, 2   3, 4
// 2, 2   4, 4
// 1, 1   3, 3

function findLargest(bottomLeft, topRight) {
    const xValues = bottomLeft.map(point => point[0]);
    const yValues = bottomLeft.map(point => point[1]);
    const topXValues = topRight.map(point => point[0])
    const topYValues = topRight.map(point => point[1])

    console.log(xValues); // [x1, x2, x3...]
    console.log(yValues)
    console.log(topXValues)
    console.log(topYValues)

}

console.log(findLargest(bottomLeft, topRight))