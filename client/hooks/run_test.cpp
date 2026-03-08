#include <bits/stdc++.h>
using namespace std;

string answer(string question) {
    // Remove trailing '?' if present
    string q = question;
    if (!q.empty() && q.back() == '?')
        q.pop_back();
    
    // Trim trailing space
    while (!q.empty() && q.back() == ' ')
        q.pop_back();
    
    // Rule 1: Name question
    if (question == "What's your name?")
        return "I'm Stupid AI.";
    
    // Count words
    istringstream iss(q);
    vector<string> words;
    string word;
    while (iss >> word)
        words.push_back(word);
    
    // Rule 2: More than 10 words
    if (words.size() > 10)
        return "Please make it simple.";
    
    // Rule 3: Starts with "Should I"
    if (question.find("Should I") == 0)
        return "You should follow your heart.";
    
    // Rule 4: Default - abbreviate each word
    string abbrev = "";
    for (int i = 0; i < words.size(); i++) {
        if (i > 0) abbrev += " ";
        abbrev += tolower(words[i][0]);
    }
    
    return "Sorry, I don't know about the question \"" + abbrev + "\".";
}

int main() {
    // Test cases
    cout << "Test 1: " << answer("What's your name?") << endl;
    cout << "Test 2: " << answer("Should I go to the gym?") << endl;
    cout << "Test 3: " << answer("How are you?") << endl;
    cout << "Test 4: " << answer("What is the best way to learn programming and coding effectively every single day?") << endl;
    return 0;
}
