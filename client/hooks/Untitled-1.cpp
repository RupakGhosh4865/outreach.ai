#include <bits/stdc++.h>
using namespace std;

string answer(string question) {
    string q = question;
    if (!q.empty() && q.back() == '?') {
        q.pop_back();
        while (!q.empty() && q.back() == ' ')
            q.pop_back();
    }

    if (q == "What's your name")
        return "I'm Stupid AI.";
    istringstream iss(q);
    vector<string> words;
    string word;
    
    while (iss >> word)
        words.push_back(word);
    if (words.size() > 10)
        return "Please make it simple.";
    if (q.find("Should I") == 0)
        return "You should follow your heart.";
    string abbrev = "";
    for (int i = 0; i < (int)words.size(); i++) {
        if (i > 0) abbrev += " ";
        abbrev += tolower(words[i][0]);
    }
    
    return "Sorry, I don't know about the question \"" + abbrev + "\".";
}

int main() {
    // ✅ Test Case 1: Exact match
    cout << answer("What's your name?") << endl;
    // Expected: I'm Stupid AI.

    // ✅ Test Case 2: Space before ?
    cout << answer("What's your name ?") << endl;
    // Expected: I'm Stupid AI.

    // ✅ Test Case 3: More than 10 words
    cout << answer("Can you tell me what is AI products why them are smart and help people?") << endl;
    // Expected: Please make it simple.

    // ✅ Test Case 4: Should I question
    cout << answer("Should I go to the gym?") << endl;
    // Expected: You should follow your heart.

    // ✅ Test Case 5: Default abbreviation
    cout << answer("Can you tell me more about the sky?") << endl;
    // Expected: Sorry, I don't know about the question "c y t m m a t s".

    // ✅ Test Case 6: Should I with space before ?
    cout << answer("Should I study hard ?") << endl;
    // Expected: You should follow your heart.

    return 0;
}