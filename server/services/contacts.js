import 'dotenv/config';
import axios from 'axios';
import CompanyContact from '../models/CompanyContact.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** Resolve a company name to a domain via Hunter.io. */
export async function getCompanyDomain(companyName) {
    if (!companyName) return null;
    try {
        const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
            params: { company: companyName, api_key: process.env.HUNTER_API_KEY, limit: 1 },
            timeout: 10000,
        });
        return data?.data?.domain || null;
    } catch (err) {
        console.error(`[Hunter] Domain lookup failed for "${companyName}":`, err.response?.data?.errors?.[0]?.details || err.message);
        return null;
    }
}

/** Find up to `limit` employees with emails on a domain. */
export async function findEmployees(domain, limit = 10) {
    if (!domain) return [];
    try {
        const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
            params: { domain, api_key: process.env.HUNTER_API_KEY, limit, type: 'personal' },
            timeout: 10000,
        });
        return (data?.data?.emails || []).slice(0, limit).map((e) => ({
            firstName: e.first_name || '',
            lastName: e.last_name || '',
            email: e.value,
            position: e.position || '',
            linkedinUrl: e.linkedin || '',
            source: 'hunter',
        }));
    } catch (err) {
        console.error('[Hunter] Employee search failed:', err.response?.data?.errors?.[0]?.details || err.message);
        return [];
    }
}

/** Emails written directly into a job post — the most direct contacts available. */
export function extractEmailsFromText(text) {
    return [...new Set(String(text || '').match(EMAIL_REGEX) || [])].map((email) => ({
        firstName: '', lastName: '', email, position: 'Hiring Manager', linkedinUrl: '', source: 'post',
    }));
}

/** Upsert contacts into the company-wide store. */
export async function saveCompanyContacts(companyName, domain, employees, source) {
    if (!companyName || !employees?.length) return;
    try {
        const normalizedName = companyName.trim();
        const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let company = await CompanyContact.findOne({
            companyName: { $regex: new RegExp(`^${escaped}$`, 'i') },
        });

        if (!company) {
            company = new CompanyContact({ companyName: normalizedName, companyDomain: domain, contacts: [] });
            console.log(`[Company Storage] Creating new entry for: ${normalizedName}`);
        } else if (domain && !company.companyDomain) {
            company.companyDomain = domain;
        }

        const existing = new Set(company.contacts.map((c) => c.email.toLowerCase()));
        const newContacts = employees
            .filter((e) => e.email && !existing.has(e.email.toLowerCase()))
            .map((e) => ({
                firstName: e.firstName || '',
                lastName: e.lastName || '',
                email: e.email,
                position: e.position || '',
                linkedinUrl: e.linkedinUrl || '',
                source: source || e.source || 'manual',
            }));

        if (newContacts.length) {
            company.contacts.push(...newContacts);
            company.updatedAt = new Date();
            await company.save();
            console.log(`[Company Storage] ${normalizedName}: added ${newContacts.length} new contact(s).`);
        } else {
            console.log(`[Company Storage] No new contacts to add for ${normalizedName}.`);
        }
    } catch (err) {
        console.error('[Company Storage] Error saving contacts:', err.message);
    }
}

/**
 * Everything the pipeline needs to reach a company: emails in the post text first
 * (most direct), then Hunter.io employees. Results are persisted company-wide.
 */
export async function findContactsForCompany({ companyName, jobText = '', limit = 10 }) {
    const fromPost = extractEmailsFromText(jobText);
    const domain = await getCompanyDomain(companyName);
    const fromHunter = domain ? await findEmployees(domain, limit) : [];

    const seen = new Set();
    const contacts = [...fromPost, ...fromHunter].filter((c) => {
        const key = c.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (companyName && contacts.length) {
        await saveCompanyContacts(companyName, domain, contacts, 'pipeline');
    }

    return { contacts: contacts.slice(0, limit), domain };
}
