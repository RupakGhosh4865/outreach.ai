import test from 'node:test';
import assert from 'node:assert/strict';

import { profileLinks, applyLinksBlock, stripAttachmentClaim } from '../services/emailComposer.js';

test('profileLinks returns only the links the profile actually has', () => {
    const links = profileLinks({ linkedinUrl: 'https://linkedin.com/in/x', githubUrl: '  ', portfolioUrl: null });
    assert.deepEqual(links, [{ label: 'LinkedIn', url: 'https://linkedin.com/in/x' }]);
});

test('profileLinks tolerates a missing profile', () => {
    assert.deepEqual(profileLinks(null), []);
});

test('applyLinksBlock appends only real links', () => {
    const body = applyLinksBlock('Hi there.', { githubUrl: 'https://github.com/x' });
    assert.equal(body, 'Hi there.\n\nGitHub: https://github.com/x');
});

test('applyLinksBlock strips model-emitted link lines, including empty ones', () => {
    // The model likes to invent a signature block; a blank profile field would
    // otherwise leave a bare "GitHub:" line in the sent email.
    const raw = 'Hi there.\n\nLinkedIn: \nGitHub: https://github.com/hallucinated\nPortfolio: [link]';
    const body = applyLinksBlock(raw, { linkedinUrl: 'https://linkedin.com/in/real' });
    assert.equal(body, 'Hi there.\n\nLinkedIn: https://linkedin.com/in/real');
    assert.ok(!body.includes('hallucinated'));
});

test('applyLinksBlock with no profile links leaves the body clean', () => {
    assert.equal(applyLinksBlock('Hi there.\n\nGitHub: \n', {}), 'Hi there.');
});

test('stripAttachmentClaim removes only the sentence that claims an attachment', () => {
    const body = stripAttachmentClaim('I built X.\nMy resume is attached for review. Happy to chat.\nThanks');
    assert.ok(!/attach/i.test(body), `attachment claim survived: ${body}`);
    assert.ok(body.includes('Happy to chat.'));
    assert.ok(body.includes('I built X.'));
});

test('stripAttachmentClaim leaves unrelated text alone', () => {
    const original = 'I led the payments migration.\nLet me know if a chat works.';
    assert.equal(stripAttachmentClaim(original), original);
});

test('stripAttachmentClaim handles CV phrasing', () => {
    assert.ok(!/attach/i.test(stripAttachmentClaim('Please find my CV attached. Regards')));
});
