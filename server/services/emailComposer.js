import 'dotenv/config';
import { chatJson, MODELS } from './llm.js';

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

const EMAIL_SCHEMA = {
    type: 'object',
    properties: {
        subject: {
            type: 'string',
            description: 'Specific, non-generic subject line under 65 characters. No "Job Application" boilerplate.',
        },
        body: {
            type: 'string',
            description: 'The email body as plain text with blank lines between paragraphs. No subject line, no signature block of labelled links.',
        },
    },
    required: ['subject', 'body'],
    additionalProperties: false,
};

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

    const systemPrompt = [
        'You write job outreach emails that get replies.',
        'You write like a competent person emailing a stranger they respect: specific, brief, and easy to say yes to.',
        'You never invent experience, employers, metrics or links that are not in the material you are given.',
        'If the resume is thin or missing, you write a shorter email rather than padding it with generic claims.',
    ].join(' ');

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
Write one personalised outreach email.

STRUCTURE:
1. One opening line that shows you know what this company or role actually is. Never "I hope this email finds you well".
2. One or two sentences on why the sender fits the ${jobTitle || 'role'} — tied to the job description, not generic.
3. Two bullet points of concrete proof, taken from the resume text above. Prefer bullets with a measurable result. If the resume gives you nothing concrete, use one bullet, not two invented ones.
4. Reference the sender's links as evidence only where one is listed above.
5. A specific, low-effort call to action — a 15-minute chat or a referral. Give the recipient an easy out.
${hasAttachment ? '6. Mention in passing that the resume is attached.' : '6. Do NOT claim any file is attached — no resume is being attached to this email.'}

RULES:
- Under 200 words. Shorter is better than padded.
- Plain text. Blank lines between paragraphs, "- " for the bullets.
- Confident and direct. No "I am writing to", no "I would be grateful for the opportunity", no adjective stacking.
- Every claim must trace back to the resume or profile above.
- Do NOT end with labelled links (LinkedIn:/GitHub:/Portfolio:/Resume:) — that block is appended separately.
- The subject must be specific to ${jobTitle || companyName || 'the role'} and under 65 characters.`;

    const { subject: rawSubject, body: rawBody } = await chatJson({
        system: systemPrompt,
        user: userPrompt,
        schema: EMAIL_SCHEMA,
        schemaName: 'outreach_email',
        model: MODELS.quality,
        maxTokens: 1200,
        temperature: 0.7,
        label: 'email',
    });

    const subject = String(rawSubject || '').trim()
        || `${emailType === 'referral' ? 'Referral request' : 'Application'} – ${jobTitle || companyName}`;

    let body = String(rawBody || '').trim();
    if (!hasAttachment) body = stripAttachmentClaim(body);
    body = applyLinksBlock(body, profile);

    return { subject, body, style: 'standard' };
}
