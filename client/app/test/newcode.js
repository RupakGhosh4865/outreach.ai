const arr = [[1, 1, 1, 0, 1, 0, 0, 1, 0, 0], [1, 0, 1, 0, 0, 0, 1, 1, 0, 1]]

const colsum = [2, 2, 1, 1];

const sum = colsum.reduce((acc, value) =>
    acc + value, 0);

console.log(sum);

