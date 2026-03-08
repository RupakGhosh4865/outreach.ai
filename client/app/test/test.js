// // function createSecretGenerator(secret) {
//     return {
//         getSecret: function () {
//             return secret;
//         },
//         setSecret: function (newSecret) {
//             secret = newSecret;
//         }
//     };
// }

// // const myAccount = createSecretGenerator("Initial_Password");
// const myAccount = createSecretGenerator("Initial_Password");
// console.log(myAccount.getSecret()); // 1. What does this print?

// myAccount.setSecret("New_Password");
// console.log(myAccount.getSecret()); // 2. What does this print?

// console.log(secret); // 3. What happens here?

const nested = [1, [2, [3, 4]]];

function flatten(arr) {
    return arr.reduce((acc, val) =>
        Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), []);
}

console.log(flatten(nested))