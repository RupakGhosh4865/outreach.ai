import 'dotenv/config';
import axios from 'axios';

/** Adzuna GB search (official API). */
export async function searchAdzuna({ role, keywords = [] }) {
    if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) throw new Error('no Adzuna keys configured');
    const { data } = await axios.get('https://api.adzuna.com/v1/api/jobs/gb/search/1', {
        params: {
            app_id: process.env.ADZUNA_APP_ID,
            app_key: process.env.ADZUNA_APP_KEY,
            what: role,
            what_or: keywords.join(' '),
            results_per_page: 20,
            'content-type': 'application/json',
        },
        timeout: 10000,
    });
    return (data?.results || []).map((j) => ({
        title: j.title?.replace(/<\/?[^>]+>/g, '') || '',
        company: j.company?.display_name || '',
        location: j.location?.display_name || 'UK',
        salaryMin: j.salary_min || null,
        salaryMax: j.salary_max || null,
        postedAt: j.created ? new Date(j.created) : null,
        source: 'adzuna',
        applyUrl: j.redirect_url || '',
        description: j.description || '',
    }));
}

/**
 * JSearch (RapidAPI) — licensed Google for Jobs data, which carries LinkedIn,
 * Indeed and Glassdoor postings. The publisher is surfaced in sourceDetail so
 * those brands show up in results even when direct scraping is blocked.
 */
export async function searchJSearch({ role }) {
    if (!process.env.RAPIDAPI_KEY) throw new Error('no RapidAPI key configured');
    const { data } = await axios.get('https://jsearch.p.rapidapi.com/search', {
        params: { query: `${role} in UK`, country: 'gb', num_pages: 1, date_posted: 'month' },
        headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        timeout: 15000,
    });
    return (data?.data || []).map((j) => ({
        title: j.job_title || '',
        company: j.employer_name || '',
        location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'UK',
        salaryMin: j.job_min_salary || null,
        salaryMax: j.job_max_salary || null,
        postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
        source: 'jsearch',
        sourceDetail: j.job_publisher || '',
        applyUrl: j.job_apply_link || '',
        description: j.job_description || '',
    }));
}
