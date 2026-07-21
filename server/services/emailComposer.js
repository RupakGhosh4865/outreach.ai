import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TYPE_MAP = {
    referral: 'a referral request for a job opening',
    direct_apply: 'a direct job application email',
    vacancy_inquiry: 'an inquiry about potential job vacancies',
};

const LINK_FIELDS = [
    ['LinkedIn', 'linkedinUrl'],
    ['GitHub', 'githubUrl'],
    ['Portfolio', 'portfolioUrl'],
    ['Resume', 'resumeLink'],
];

/** The links the profile actually has, as [{label, url}]. */
export function profileLinks(profile) {
    return LINK_FIELDS
        .map(([label, field]) => ({ label, url: (profile?.[field] || '').trim() }))
        .filter((l) => l.url);
}

/**
 * Strip any link lines the model emitted (empty or not) and append a block built
 * from the profile, so a blank profile field can never produce a bare "GitHub:" line.
 */
export function applyLinksBlock(body, profile) {
    const labels = LINK_FIELDS.map(([label]) => label).join('|');
    let cleaned = String(body || '')
        .split('\n')
        .filter((line) => !new RegExp(`^\\s*(?:\\*\\*)?(?:${labels})(?:\\*\\*)?\\s*:\\s*\\[?[^\\]]*\\]?\\s*$`, 'i').test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const links = profileLinks(profile);
    if (!links.length) return cleaned;

    return `${cleaned}\n\n${links.map((l) => `${l.label}: ${l.url}`).join('\n')}`;
}

/** Remove an "attached resume" claim when nothing is actually attached. */
export function stripAttachmentClaim(body) {
    return String(body || '')
        .split('\n')
        .map((line) =>
            /resum[eé]|\bCV\b/i.test(line) && /attach/i.test(line)
                ? line.replace(/[^.!?]*\battach\w*\b[^.!?]*[.!?]\s*/gi, '').trim()
                : line
        )
        .filter((line, i, all) => line !== '' || all[i - 1] !== '')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Generate one personalised outreach email. The links block is appended in code
 * (see applyLinksBlock) rather than trusted to the model.
 */
export async function buildEmailVariant({
    profile, resumeText, emailType, jobTitle, companyName,
    jobDescription, recipientName, extraContext, hasAttachment = true,
}) {
    const links = profileLinks(profile);
    const linkContext = links.length
        ? links.map((l) => `- ${l.label}: ${l.url}`).join('\n')
        : '- (the sender has not provided any links)';

    const systemPrompt = 'You are a professional career coach and expert at writing high-conversion job outreach emails.';

    const userPrompt = `Context:
- Role: ${jobTitle || 'Not specified'}
- Company: ${companyName || 'Not specified'}
- Recipient: ${recipientName || 'the employee'}
- Email Type: ${TYPE_MAP[emailType] || 'outreach'}
- Extra notes: ${extraContext || 'None'}

Sender's available links (only these exist — never mention any other link):
${linkContext}

Sender Background (Context):
- Tech Stack: ${profile?.techStack || 'Not specified'}
- Experience: ${profile?.experienceYears || 0} years and ${profile?.experienceMonths || 0} months
- Target Roles: ${profile?.targetRoles || 'Not specified'}

Job Description (excerpt):
${jobDescription ? jobDescription.slice(0, 1500) : 'Not provided'}

Sender Resume (extracted text):
${resumeText ? resumeText.slice(0, 2000) : 'Not provided'}

TASK:
Write a high-quality, professional, personalized outreach email.

STRUCTURE:
1. Short, engaging opening (NO "I hope this email finds you well").
2. Core value proposition: 1-2 sentences on why the sender fits the ${jobTitle || 'role'}.
3. Proof of work: 2 bullet points with specific achievements from the resume.
4. Weave in the available links above as evidence, only where one exists.
5. Clear, respectful call to action (a chat or a referral).
${hasAttachment ? '6. Mention that the resume is attached for review.' : '6. Do NOT claim any file is attached — no resume is being attached to this email.'}

FORMATTING RULES:
- Plain text with blank lines between paragraphs; a bulleted list for achievements.
- Tone: professional, respectful, confident. Max 220 words.
- Do NOT end with a list of labelled links (LinkedIn:/GitHub:/Portfolio:/Resume:) — that block is added separately.

Subject Line Rules:
- Start the response with exactly "Subject: " followed by a catchy subject relevant to ${jobTitle || companyName || 'the role'}.`;

    const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
    });

    const raw = res.choices[0].message.content;
    const subjectMatch = raw.match(/^Subject:\s*(.+)/im);
    const subject = subjectMatch
        ? subjectMatch[1].trim()
        : `${emailType === 'referral' ? 'Referral Request' : 'Application'} – ${jobTitle || companyName}`;

    let body = raw.replace(/^Subject:.+\n?/im, '').trim();
    if (!hasAttachment) body = stripAttachmentClaim(body);
    body = applyLinksBlock(body, profile);

    return { subject, body, style: 'standard' };
}
