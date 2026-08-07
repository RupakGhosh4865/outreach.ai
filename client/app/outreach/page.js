'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, ArrowRight, Bot, Briefcase, CalendarClock, Check, ChevronRight,
    Contact, FileText, Gauge, Handshake, Link2, Mail, MailPlus, Search, Send,
    Sparkles, UserSearch, Users, Zap,
} from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import ResumeOptimizerPanel from '../components/ResumeOptimizerPanel';
import UkJobFinder from '../components/UkJobFinder';
import JobSources from '../components/JobSources';
import JobRadar from '../components/JobRadar';
import ApplicationPipeline from '../components/ApplicationPipeline';
import ApplyTimer from '../components/ApplyTimer';
import {
    Alert, Badge, Button, Card, CardTitle, Field, Input, Textarea, cn,
} from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, ApiError } from '@/lib/api';

const STEPS = ['Job details', 'Recipients', 'Email & send'];

const EMAIL_TYPES = [
    { value: 'referral', icon: Handshake, label: 'Referral request', desc: 'Ask someone to refer you' },
    { value: 'direct_apply', icon: MailPlus, label: 'Direct apply', desc: 'Apply straight to an employee' },
    { value: 'vacancy_inquiry', icon: Search, label: 'Vacancy inquiry', desc: 'Ask if roles are open' },
];

/** The stages the autopilot reports while it works. */
const AUTOPILOT_STAGES = [
    { icon: Search, title: 'Reading the job post', desc: 'Fetching the posting and its requirements.' },
    { icon: Bot, title: 'Analysing your profile', desc: 'Matching your stack against the role.' },
    { icon: Link2, title: 'Finding the company', desc: 'Resolving the domain and structure.' },
    { icon: Users, title: 'Targeting people', desc: 'Identifying hiring managers and decision makers.' },
    { icon: FileText, title: 'Optimising your CV', desc: 'Rewriting and scoring it against this job description.' },
    { icon: Sparkles, title: 'Writing the emails', desc: 'Drafting personalised outreach copy.' },
    { icon: Check, title: 'Ready', desc: 'Everything is prepared for your review.' },
];

/* The old list included a "2 Min (Test)" option mapping to days: -1, a test hook
   the server no longer honours. Offering it would schedule a follow-up that
   never fires. */
const FOLLOW_UP_OPTIONS = [
    { label: 'None', days: 0 },
    { label: '3 days', days: 3 },
    { label: '5 days', days: 5 },
    { label: '7 days', days: 7 },
];

/**
 * Progress through the wizard. Communicates position with shape and text as
 * well as colour, and announces the current step to screen readers.
 */
function Stepper({ step }) {
    return (
        <nav aria-label="Progress" className="mb-8">
            <ol className="flex items-center gap-2 sm:gap-3">
                {STEPS.map((label, i) => {
                    const done = step > i;
                    const active = step === i;
                    return (
                        <li key={label} className={cn('flex items-center gap-2 sm:gap-3', i < STEPS.length - 1 && 'flex-1')}>
                            <span className="flex items-center gap-2.5" aria-current={active ? 'step' : undefined}>
                                <span
                                    className={cn(
                                        'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-200',
                                        done && 'bg-brand text-brand-ink',
                                        active && 'bg-brand/15 text-brand ring-2 ring-brand',
                                        !done && !active && 'bg-white/5 text-subtle ring-1 ring-white/10',
                                    )}
                                >
                                    {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                                </span>
                                <span className={cn('hidden text-sm font-semibold sm:inline', active ? 'text-text' : 'text-subtle')}>
                                    {label}
                                </span>
                            </span>
                            {i < STEPS.length - 1 && (
                                <span
                                    aria-hidden="true"
                                    className={cn('h-px flex-1 transition-colors duration-300', done ? 'bg-brand' : 'bg-white/10')}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
            <p className="sr-only">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
        </nav>
    );
}

/** Recipient row with a large, obviously-tappable hit area. */
function RecipientRow({ emp, selected, onToggle }) {
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email;
    return (
        <li>
            <label
                className={cn(
                    'tap flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors duration-150',
                    selected ? 'border-brand/40 bg-brand/8' : 'border-white/8 bg-white/2 hover:border-white/20',
                )}
            >
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(emp.email)}
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/12 text-xs font-bold uppercase text-brand">
                    {emp.firstName?.[0] || emp.email[0] || '?'}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{name}</span>
                    <span className="block truncate text-xs text-subtle">{emp.email}</span>
                </span>
                {emp.position && <span className="hidden shrink-0 text-xs text-subtle sm:block">{emp.position}</span>}
            </label>
        </li>
    );
}

export default function OutreachPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [userEmail, setUserEmail] = useState('');
    // Toasts come from the app-level provider so they render in one aria-live
    // region and are dismissible, rather than a per-page copy of the mechanism.
    const { toast: addToast } = useToast();
    const [isExtension, setIsExtension] = useState(false);
    // Bumped whenever an application is created or changes state, so the
    // pipeline panel reloads without waiting for its poll tick.
    const [pipelineKey, setPipelineKey] = useState(0);
    const refreshPipeline = () => setPipelineKey((k) => k + 1);

    // Step 1 state
    const [emailType, setEmailType] = useState('referral');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [extraContext, setExtraContext] = useState('');
    const [scraping, setScraping] = useState(false);
    const [postEmails, setPostEmails] = useState([]); // emails scraped directly from post text

    // Step 2 state
    const [employees, setEmployees] = useState([]);
    const [selectedEmps, setSelectedEmps] = useState([]);
    const [manualEmail, setManualEmail] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [companyDomain, setCompanyDomain] = useState('');
    const [findingEmps, setFindingEmps] = useState(false);
    const [historyContacts, setHistoryContacts] = useState([]); // contacts from previous searches for this company

    // Profile Scraper state
    const [profileUrl, setProfileUrl] = useState('');
    const [profileScraping, setProfileScraping] = useState(false);
    const [scrapedContact, setScrapedContact] = useState(null);

    // Step 3 state
    const [variants, setVariants] = useState([]);
    const [selectedVariant, setSelectedVariant] = useState(null); // null = showing cards, number = editing selected
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [followUpDays, setFollowUpDays] = useState(0); // 0, 3, 5, 7
    const [generating, setGenerating] = useState(false);
    const [generateError, setGenerateError] = useState('');
    const [sending, setSending] = useState(false);

    // Autopilot state
    const [autopilot, setAutopilot] = useState(false);
    const [autoStep, setAutoStep] = useState(0); // 0-8
    const [previousAutoStep, setPreviousAutoStep] = useState(0);
    const [autoResults, setAutoResults] = useState([]);
    const [limitReached, setLimitReached] = useState(false);
    const [autoMode, setAutoMode] = useState('');
    const [pastedJobDescription, setPastedJobDescription] = useState('');

    // Resume Optimizer state
    const [optimizedResumeInfo, setOptimizedResumeInfo] = useState(null); // { selectedResume, matchScore }
    const [resumeOptimizing, setResumeOptimizing] = useState(false);
    const [optimizeState, setOptimizeState] = useState(null); // { key, status: 'pending'|'done'|'failed', result }
    const optimizePollRef = useRef(null);
    const optimizeJdRef = useRef(''); // last JD we kicked off, to avoid duplicate triggers

    // Job Analysis state
    const [analyzingFit, setAnalyzingFit] = useState(false);
    const [fitResults, setFitResults] = useState(null);

    // Apply Timing state
    const [applyTiming, setApplyTiming] = useState('now'); // 'now' | 'schedule'
    const [scheduledAt, setScheduledAt] = useState('');

    // Attribution + timing. `applyStartedAt` is set the moment real work begins
    // and reported on send, so History can show how long the application took.
    const [teamMembers, setTeamMembers] = useState([]);
    const [ownerName, setOwnerName] = useState('');
    const [appliedBy, setAppliedBy] = useState(''); // '' = the account owner
    const [applyStartedAt, setApplyStartedAt] = useState(null);
    const [alreadyApplied, setAlreadyApplied] = useState(null);
    // Opt-in — a cover letter is welcome in some outreach and noise in a short
    // referral ask, so the user decides per send.
    const [attachCoverLetter, setAttachCoverLetter] = useState(false);

    /** Start the apply clock on first real action; later calls are no-ops. */
    const beginApply = () => setApplyStartedAt((prev) => prev || new Date().toISOString());

    useEffect(() => {
        const saved = localStorage.getItem('jobreach_email');
        if (saved) setUserEmail(saved);

        apiGet('/api/profile')
            .then((d) => {
                if (!d?.profile) return;
                setTeamMembers((d.profile.teamMembers || []).map((m) => m.name));
                setOwnerName(d.profile.name || '');
            })
            .catch(() => { /* no profile yet — attribution just stays as the owner */ });

        // Detect if loaded from Chrome Extension
        const params = new URLSearchParams(window.location.search);
        if (params.get('source') === 'chrome-extension') {
            setIsExtension(true);
        }
    }, []);

    useEffect(() => {
        setPreviousAutoStep(autoStep);
    }, [autoStep]);

    // Listen for messages from Chrome Extension
    useEffect(() => {
        const handleMessage = (event) => {
            // Check origin for security
            if (event.origin !== window.location.origin && !event.origin.includes('chrome-extension://')) {
                // In development, the extension origin might be different or null
            }

            if (event.data?.type === 'EXTENSION_JOB_URL') {
                const { url, title, company } = event.data;
                console.log('[Extension] Received job data:', { url, title, company });
                
                if (url) setLinkedinUrl(url);
                if (title) setJobTitle(title);
                if (company) setCompanyName(company);
                
                addToast('Job details imported from Extension!', 'success');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const direction = autoStep > previousAutoStep ? 1 : -1;

    async function fetchHistoryContacts(name) {
        if (!name) return;
        try {
            const data = await apiGet(`/api/jobs/company-contacts?companyName=${encodeURIComponent(name)}`);
            setHistoryContacts(data.contacts || []);
        } catch (err) {
            console.error('History fetch error:', err);
        }
    }

    // Update history when company name changes
    useEffect(() => {
        if (companyName.trim().length > 2) {
            const timer = setTimeout(() => fetchHistoryContacts(companyName), 1000);
            return () => clearTimeout(timer);
        }
    }, [companyName]);

    // ── Step 1: AI Extractions ──────────────────────────────────────────────
    async function handleExtract() {
        if (!linkedinUrl.trim()) {
            addToast('Please paste a LinkedIn job URL first.', 'error'); return;
        }
        setScraping(true);
        setAlreadyApplied(null);
        beginApply();
        try {
            const data = await apiPost('/api/jobs/extract-from-url', { url: linkedinUrl });

            if (data.companyName) setCompanyName(data.companyName);
            if (data.jobTitle) setJobTitle(data.jobTitle);
            if (data.jobDescription) {
                setJobDescription(data.jobDescription);
                analyzeJobFit(data.jobDescription); // Trigger analysis automatically
            }
            if (data.postEmails?.length) {
                setPostEmails(data.postEmails);
                addToast(`Job details extracted! Found ${data.postEmails.length} email(s) in post.`, 'success');
            } else {
                addToast('Job details extracted!', 'success');
            }
            if (data.companyName) fetchHistoryContacts(data.companyName);
        } catch (e) {
            // 409 means this exact posting is already in the applied ledger.
            // Surface it as a banner, not a toast — it's a stop, not a hiccup.
            if (e instanceof ApiError && e.status === 409 && e.data?.alreadyApplied) {
                setAlreadyApplied(e.data);
            } else {
                addToast(e.message || 'Connection error during extraction.', 'error');
            }
        }
        setScraping(false);
    }

    // ── Background resume optimization (dynamic CV per JD) ──────────────────
    async function startResumeOptimization(jd) {
        if (!jd?.trim() || jd.trim() === optimizeJdRef.current) return;
        optimizeJdRef.current = jd.trim();
        if (optimizePollRef.current) clearInterval(optimizePollRef.current);

        // Load the user's own CV layout so the panel can show the real document
        // being rewritten rather than an abstract progress bar. Absent for
        // accounts whose resume predates template derivation.
        const templatePromise = apiGet('/api/jobs/resume-template')
            .then((d) => d.layout)
            .catch(() => null);

        try {
            // Company and role only name the generated files; they don't change
            // the CV, so they're safe to send even when still being edited.
            const data = await apiPost('/api/jobs/optimize-resume', {
                jobDescription: jd, companyName, jobTitle,
            });
            const template = await templatePromise;

            if (data.status === 'done') {
                setOptimizeState({ key: data.key, status: 'done', result: data.result, template });
                return;
            }
            setOptimizeState({
                key: data.key, status: 'pending', template,
                percent: data.percent ?? 5, stageLabel: data.stageLabel || 'Reading your CV',
            });

            let polls = 0;
            optimizePollRef.current = setInterval(async () => {
                polls += 1;
                try {
                    const sd = await apiGet(`/api/jobs/optimize-resume/status?key=${data.key}`);
                    if (sd.status === 'done') {
                        clearInterval(optimizePollRef.current);
                        setOptimizeState({ key: data.key, status: 'done', result: sd.result, template });
                        addToast('Tailored CV ready for this job!', 'success');
                    } else if (sd.status === 'failed' || polls > 80) {
                        clearInterval(optimizePollRef.current);
                        setOptimizeState({ key: data.key, status: 'failed', template });
                    } else {
                        setOptimizeState((prev) => ({
                            ...prev, key: data.key, status: 'pending', template,
                            percent: sd.percent ?? prev?.percent ?? 5,
                            stageLabel: sd.stageLabel || prev?.stageLabel,
                        }));
                    }
                } catch { /* keep polling until cap */ }
            }, 3000);
        } catch {
            setOptimizeState({ status: 'failed' });
        }
    }

    // Cleanup polling on unmount
    useEffect(() => () => {
        if (optimizePollRef.current) clearInterval(optimizePollRef.current);
    }, []);

    // Auto-optimize when a substantial JD is pasted manually
    useEffect(() => {
        if (jobDescription.trim().length > 200) {
            const timer = setTimeout(() => startResumeOptimization(jobDescription), 1500);
            return () => clearTimeout(timer);
        }
    }, [jobDescription]);

    async function analyzeJobFit(textToAnalyze) {
        if (!textToAnalyze) return;
        setAnalyzingFit(true);
        try {
            const data = await apiPost('/api/jobs/analyze-fit', { jobDescription: textToAnalyze });
            if (data.scores) {
                setFitResults(data);
                addToast('ATS Scan complete!', 'success');
            }
        } catch (e) {
            console.error('Analysis error:', e);
        }
        setAnalyzingFit(false);
    }

    async function handleProfileScrape() {
        if (!profileUrl.trim()) { addToast('Please paste a LinkedIn profile URL.', 'error'); return; }
        setProfileScraping(true);
        setScrapedContact(null);
        try {
            const data = await apiPost('/api/jobs/scrape-profile', { url: profileUrl });
            setScrapedContact(data);
            addToast('Profile details extracted!', 'success');
        } catch (e) {
            addToast(e.message || 'Connection error during profile scraping.', 'error');
        }
        setProfileScraping(false);
    }

    function addScrapedToRecipients() {
        if (!scrapedContact || !scrapedContact.email) return;
        const newEmp = {
            firstName: scrapedContact.firstName || 'LinkedIn',
            lastName: scrapedContact.lastName || 'Member',
            email: scrapedContact.email,
            phone: scrapedContact.phone || '',
            position: scrapedContact.position || 'LinkedIn Contact',
            source: 'scrape'
        };
        // Add to employees if not already there
        if (!employees.some(e => e.email === newEmp.email)) {
            setEmployees(prev => [...prev, newEmp]);
        }
        // Select it
        setSelectedEmps(prev => [...new Set([...prev, newEmp.email])]);
        addToast('Contact added to recipients!', 'success');
        setStep(1); // Go to Step 2
    }

    function step1Valid() { return companyName.trim() && jobTitle.trim(); }

    function goToStep2() {
        if (!step1Valid()) { addToast('Please fill in at least Company Name and Job Title.', 'error'); return; }
        if (!userEmail) { addToast('Please set up your profile first.', 'error'); return; }
        setStep(1);
        // Pre-populate any emails found directly in the post
        const postEmpList = postEmails.map(email => ({
            firstName: 'Hiring', lastName: 'Manager', email,
            position: 'From Post', source: 'post',
        }));
        setEmployees(postEmpList);
        setSelectedEmps(postEmpList.map(e => e.email));
    }

    // ── Step 2: Find Employees ───────────────────────────────────────────────
    async function handleFindEmployees() {
        // Also starts the clock for a fully manual application, where neither
        // URL extraction nor autopilot ran.
        beginApply();
        setFindingEmps(true);
        try {
            const data = await apiPost('/api/jobs/find-employees', { companyName, companyDomain });
            // Merge: post emails first, then Hunter.io (deduplicated)
            const postEmpList = postEmails.map(email => ({
                firstName: 'Hiring', lastName: 'Manager', email,
                position: 'From Post', source: 'post',
            }));
            const hunterEmps = (data.employees || []).filter(h => !postEmpList.some(p => p.email === h.email));
            const merged = [...postEmpList, ...hunterEmps];
            setEmployees(merged);
            if (data.domain) setCompanyDomain(data.domain);
            if (merged.length === 0) {
                addToast('No employees found. You can add an email manually below.', 'info');
            } else {
                addToast(`Found ${merged.length} recipient(s)!`, 'success');
                setSelectedEmps(merged.map(e => e.email));
            }
        } catch {
            addToast('Employee search failed. Try adding email manually.', 'error');
        }
        setFindingEmps(false);
    }

    function toggleEmployee(email) {
        setSelectedEmps(s => s.includes(email) ? s.filter(e => e !== email) : [...s, email]);
    }

    function step2Valid() {
        return selectedEmps.length > 0 || manualEmail.trim();
    }

    function goToStep3() {
        if (!step2Valid()) { addToast('Select at least one employee or add a manual email.', 'error'); return; }
        beginApply();
        setStep(2);
        generateEmail();
    }

    /** Write the outreach email. Separated from navigation so a failed run can
     *  be retried in place rather than by walking back through the wizard. */
    async function generateEmail() {
        setVariants([]);
        setSelectedVariant(null);
        setEmailSubject('');
        setEmailBody('');
        setGenerateError('');
        setGenerating(true);
        try {
            const firstEmp = employees.find(e => selectedEmps.includes(e.email));
            const data = await apiPost('/api/jobs/generate-email', {
                emailType, jobTitle, companyName,
                jobDescription, extraContext,
                recipientName: firstEmp ? `${firstEmp.firstName} ${firstEmp.lastName}`.trim() : '',
            });
            if (data.variants && data.variants.length > 0) {
                setVariants(data.variants);
                // Automatically select the first (and only) variant
                const first = data.variants[0];
                setSelectedVariant(0);
                setEmailSubject(first.subject);
                setEmailBody(first.body);
                addToast('Your email is ready to review.', 'success');
            }
            else {
                setGenerateError(data.message || 'The writer returned nothing.');
            }
        } catch (e) {
            setGenerateError(e.message || 'Could not reach the email writer.');
        }
        setGenerating(false);
    }

    // ── Step 3: Send ─────────────────────────────────────────────────────────
    async function handleSend() {
        if (!emailSubject || !emailBody) { addToast('Email subject and body required.', 'error'); return; }
        if (applyTiming === 'schedule' && !scheduledAt) { addToast('Please pick a date/time to schedule the send.', 'error'); return; }

        const recipients = [
            ...employees.filter(e => selectedEmps.includes(e.email)).map(e => ({
                name: `${e.firstName} ${e.lastName}`.trim(),
                email: e.email,
                phone: e.phone || '',
            })),
            ...(manualEmail.trim() ? [{ name: 'Recipient', email: manualEmail.trim(), phone: manualPhone.trim() }] : []),
        ];

        if (!recipients.length) { addToast('No recipients selected.', 'error'); return; }

        setSending(true);
        setResumeOptimizing(true);
        try {
            const data = await apiPost('/api/jobs/send', {
                recipients, subject: emailSubject, body: emailBody,
                linkedinUrl, companyName, jobTitle, jobDescription, emailType, extraContext,
                manualEmail, manualPhone, employees, followUpDays,
                scheduledAt: applyTiming === 'schedule' ? scheduledAt : null,
                appliedBy: appliedBy || undefined,
                applyStartedAt: applyStartedAt || undefined,
                attachCoverLetter,
            });
            setResumeOptimizing(false);

            if (data.optimizedResumeUsed) {
                setOptimizedResumeInfo({ selectedResume: data.optimizedResumeUsed, matchScore: data.optimizedMatchScore });
            }
            if (data.resumeError) {
                addToast(`Resume optimisation failed: ${data.resumeError}`, 'error');
            }
            if (data.attachmentStatus === 'missing') {
                addToast('No resume was attached — upload one on your profile.', 'error');
            }
            addToast(data.message, 'success');
            setTimeout(() => router.push('/history'), data.scheduled ? 2500 : 3000);
        } catch (err) {
            setResumeOptimizing(false);
            console.error('Send failed:', err);
            addToast(err.message || 'Failed to send emails.', 'error');
        }
        setSending(false);
    }

    // ── Autopilot Orchestrator ──────────────────────────────────────────────
    async function runAutopilot(mode = 'url', jobTextOverride = null) {
        const isUrl = mode === 'url';
        const effectiveJobText = jobTextOverride || pastedJobDescription;
        if (isUrl && !linkedinUrl.trim()) { addToast('Please paste a LinkedIn job URL first.', 'error'); return; }
        if (!isUrl && !effectiveJobText.trim()) { addToast('Please paste the job description text first.', 'error'); return; }
        if (!userEmail) { addToast('Please set up your profile first.', 'error'); return; }

        setAutopilot(true);
        setAutoMode(mode);
        setAutoStep(1);
        setLimitReached(false);
        setAlreadyApplied(null);
        beginApply();

        // The request genuinely takes a while (scrape → LLM → Hunter → CV → one
        // email per contact), so the stepper advances on a timer to show progress.
        // It used to *await* those timers, adding ~6.3s of pure delay to every run.
        const stepTimers = [
            setTimeout(() => setAutoStep(2), 800),
            setTimeout(() => setAutoStep(3), 2000),
            setTimeout(() => setAutoStep(4), 4000),
            setTimeout(() => setAutoStep(5), 7000),
            setTimeout(() => setAutoStep(6), 11000),
        ];
        const clearStepTimers = () => stepTimers.forEach(clearTimeout);

        try {
            const data = await apiPost('/api/jobs/autopilot', {
                url: isUrl ? linkedinUrl : undefined,
                jobText: !isUrl ? effectiveJobText : undefined,
                emailType,
                extraContext,
            });

            clearStepTimers();
            setAutoStep(AUTOPILOT_STAGES.length); // Ready

            // Capture optimized resume info if returned
            if (data.optimizedResumeUsed) {
                setOptimizedResumeInfo({ selectedResume: data.optimizedResumeUsed, matchScore: data.optimizedMatchScore });
            }

            // Sync states from autopilot results to the manual wizard state so user can edit
            setCompanyName(data.job.companyName);
            setJobTitle(data.job.jobTitle);
            setJobDescription(data.job.jobDescription);

            const foundEmps = data.results.map(r => r.recipient);
            setEmployees(foundEmps);
            setSelectedEmps(foundEmps.map(e => e.email));
            setAutoResults(data.results);

            // Go directly to Step 3 review
            if (data.results.length > 0) {
                const first = data.results[0].email;
                setEmailSubject(first.subject);
                setEmailBody(first.body);
                setStep(2);
                setSelectedVariant(0);
            } else {
                setStep(1); // Go to employee step if none found
                addToast('No employees found automatically. Please add one.', 'info');
            }

        } catch (err) {
            clearStepTimers();
            // 403 is the plan limit, which has its own upgrade prompt.
            if (err instanceof ApiError && err.status === 403) {
                setLimitReached(true);
                addToast('Monthly limit reached — upgrade to keep going.', 'error');
            } else if (err instanceof ApiError && err.status === 409 && err.data?.alreadyApplied) {
                // Already in the applied ledger — stop rather than sending twice.
                setAlreadyApplied(err.data);
            } else {
                addToast(err.message || 'Autopilot failed.', 'error');
            }
            setAutopilot(false);
        }
    }

    const allRecipients = [
        ...employees.filter(e => selectedEmps.includes(e.email)),
        ...(manualEmail.trim() ? [{ firstName: 'Manual', lastName: '', email: manualEmail, position: '' }] : []),
    ];

    return (
        <AuthGuard>
            <div className={cn('pb-24', isExtension ? 'px-3 pt-5' : 'shell-narrow page-top')}>
                {!isExtension && (
                    <header className="animate-fade-up mb-8">
                        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">New outreach</h1>
                        <p className="mt-2 text-muted">
                            Three steps from a job link to a personalised email in someone&apos;s inbox.
                        </p>
                    </header>
                )}

                {!userEmail && (
                    <Alert tone="warning" className="mb-6">
                        No profile found.{' '}
                        <Link href="/profile" className="font-semibold underline underline-offset-2">
                            Set up your profile first
                        </Link>{' '}
                        so we can personalise your emails.
                    </Alert>
                )}

                {/* One job, one application: this posting is already in the ledger. */}
                {alreadyApplied && (
                    <Alert tone="warning" className="mb-6">
                        <span className="font-semibold">You&apos;ve already applied to this job.</span>{' '}
                        {alreadyApplied.jobTitle || 'This role'}
                        {alreadyApplied.companyName ? ` at ${alreadyApplied.companyName}` : ''} was applied for on{' '}
                        {new Date(alreadyApplied.appliedAt).toLocaleDateString()}
                        {alreadyApplied.appliedBy ? ` by ${alreadyApplied.appliedBy}` : ''}.{' '}
                        <Link href="/history" className="font-semibold underline underline-offset-2">
                            See it in History
                        </Link>
                    </Alert>
                )}

                {applyStartedAt && (
                    <div className="mb-4 flex justify-end">
                        <ApplyTimer startedAt={applyStartedAt} />
                    </div>
                )}

                <Stepper step={step} />

                {/* ══ STEP 1 — Job details ══════════════════════════════════════ */}
                {step === 0 && (
                    <div className="space-y-5">
                        {/* Autopilot */}
                        <Card>
                            <CardTitle
                                icon={Zap}
                                title="One-click autopilot"
                                description="Scrapes the post, finds contacts, and writes the emails in one go."
                                action={<Badge tone="brand">Fastest</Badge>}
                            />

                            <Field label="Job post URL" htmlFor="job-url">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <Input
                                        id="job-url"
                                        type="url"
                                        inputMode="url"
                                        placeholder="https://linkedin.com/jobs/view/..."
                                        value={linkedinUrl}
                                        onChange={(e) => setLinkedinUrl(e.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => runAutopilot('url')}
                                        disabled={autopilot || !linkedinUrl.trim()}
                                        loading={autopilot && autoMode === 'url'}
                                        className="sm:w-44"
                                    >
                                        {!(autopilot && autoMode === 'url') && <Zap className="size-4" aria-hidden="true" />}
                                        Start
                                    </Button>
                                </div>
                            </Field>

                            <div className="my-5 flex items-center gap-3" aria-hidden="true">
                                <span className="h-px flex-1 bg-white/8" />
                                <span className="text-xs font-bold uppercase tracking-widest text-subtle">or</span>
                                <span className="h-px flex-1 bg-white/8" />
                            </div>

                            <Field
                                label="Paste the job description"
                                htmlFor="job-text"
                                hint="Include the company and title if you can — it improves the match."
                            >
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <Textarea
                                        id="job-text"
                                        placeholder="Paste the full job description here..."
                                        value={pastedJobDescription}
                                        onChange={(e) => setPastedJobDescription(e.target.value)}
                                        className="min-h-24"
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => runAutopilot('text')}
                                        disabled={autopilot || !pastedJobDescription.trim()}
                                        loading={autopilot && autoMode === 'text'}
                                        className="shrink-0 sm:w-44 sm:self-start"
                                    >
                                        {!(autopilot && autoMode === 'text') && <Zap className="size-4" aria-hidden="true" />}
                                        Start
                                    </Button>
                                </div>
                            </Field>

                            {/* Live progress. A list of stages reads better than a
                                carousel and stays legible on a 375px screen. */}
                            {autopilot && (
                                <div className="mt-6 rounded-2xl border border-white/8 bg-white/2 p-4 sm:p-5" aria-live="polite">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <p className="text-sm font-bold">
                                            {autoStep >= AUTOPILOT_STAGES.length ? 'Ready for review' : 'Working on it…'}
                                        </p>
                                        <span className="text-xs font-semibold text-subtle" data-numeric>
                                            Step {Math.min(autoStep, AUTOPILOT_STAGES.length)} of {AUTOPILOT_STAGES.length}
                                        </span>
                                    </div>

                                    <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/8">
                                        <div
                                            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
                                            style={{ width: `${(Math.min(autoStep, AUTOPILOT_STAGES.length) / AUTOPILOT_STAGES.length) * 100}%` }}
                                        />
                                    </div>

                                    <ul className="space-y-2">
                                        {AUTOPILOT_STAGES.map((s, i) => {
                                            const done = autoStep > i + 1;
                                            const active = autoStep === i + 1;
                                            const Icon = s.icon;
                                            return (
                                                <li
                                                    key={s.title}
                                                    className={cn(
                                                        'flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors duration-300',
                                                        active && 'bg-brand/8',
                                                        !done && !active && 'opacity-45',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                                                            done && 'bg-brand text-brand-ink',
                                                            active && 'text-brand',
                                                            !done && !active && 'text-subtle',
                                                        )}
                                                    >
                                                        {done
                                                            ? <Check className="size-3" aria-hidden="true" />
                                                            : <Icon className={cn('size-4', active && 'animate-pulse')} aria-hidden="true" />}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className={cn('block text-sm font-semibold', active ? 'text-text' : 'text-muted')}>
                                                            {s.title}
                                                        </span>
                                                        {active && <span className="block text-xs text-subtle">{s.desc}</span>}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            {limitReached && (
                                <Alert tone="danger" className="mt-5">
                                    Monthly limit reached on the free plan.{' '}
                                    <Link href="/pricing" className="font-semibold underline underline-offset-2">
                                        Upgrade to continue
                                    </Link>
                                </Alert>
                            )}
                        </Card>

                        {/* Profile contact finder */}
                        <Card>
                            <CardTitle
                                icon={UserSearch}
                                accent="success"
                                title="Find a contact"
                                description="Pull an email from a public LinkedIn profile."
                            />
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Input
                                    type="url"
                                    inputMode="url"
                                    aria-label="LinkedIn profile URL"
                                    placeholder="https://linkedin.com/in/..."
                                    value={profileUrl}
                                    onChange={(e) => setProfileUrl(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleProfileScrape}
                                    disabled={profileScraping || !profileUrl.trim()}
                                    loading={profileScraping}
                                    className="shrink-0"
                                >
                                    Find contact
                                </Button>
                            </div>

                            {scrapedContact && (
                                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/2 p-4">
                                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/12 text-success">
                                        <Contact className="size-5" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold">
                                            {`${scrapedContact.firstName || ''} ${scrapedContact.lastName || ''}`.trim() || 'LinkedIn member'}
                                        </p>
                                        <p className="truncate text-sm text-subtle">
                                            {scrapedContact.email || 'No public email found'}
                                        </p>
                                    </div>
                                    {scrapedContact.email && (
                                        <Button type="button" size="sm" onClick={addScrapedToRecipients}>
                                            Add as recipient
                                        </Button>
                                    )}
                                </div>
                            )}
                        </Card>

                        {/* Feature panels */}
                        <ResumeOptimizerPanel
                            optimizeState={optimizeState}
                            compact={isExtension}
                            attachCover={attachCoverLetter}
                            onAttachCoverChange={setAttachCoverLetter}
                        />
                        <ApplicationPipeline userEmail={userEmail} isExtension={isExtension} refreshKey={pipelineKey} />
                        <JobRadar userEmail={userEmail} isExtension={isExtension} onApplicationChange={refreshPipeline} />
                        <JobSources userEmail={userEmail} isExtension={isExtension} onApplicationChange={refreshPipeline} />
                        <UkJobFinder
                            userEmail={userEmail}
                            isExtension={isExtension}
                            autopilotBusy={autopilot}
                            onRunAutopilot={runAutopilot}
                            onApplicationChange={refreshPipeline}
                        />

                        {/* Manual details */}
                        <Card>
                            <CardTitle icon={Briefcase} title="Job details" description="Or fill these in yourself." />

                            <fieldset className="mb-6">
                                <legend className="ui-label">What kind of email?</legend>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {EMAIL_TYPES.map((opt) => {
                                        const Icon = opt.icon;
                                        const active = emailType === opt.value;
                                        return (
                                            <label
                                                key={opt.value}
                                                className={cn(
                                                    'tap flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors duration-150',
                                                    active ? 'border-brand/50 bg-brand/8' : 'border-white/8 bg-white/2 hover:border-white/20',
                                                )}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name="emailType"
                                                        value={opt.value}
                                                        checked={active}
                                                        onChange={() => setEmailType(opt.value)}
                                                        className="size-4 accent-[var(--color-brand)]"
                                                    />
                                                    <Icon className={cn('size-4', active ? 'text-brand' : 'text-subtle')} aria-hidden="true" />
                                                    <span className="text-sm font-semibold">{opt.label}</span>
                                                </span>
                                                <span className="pl-6 text-xs text-subtle">{opt.desc}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <div className="grid gap-x-4 sm:grid-cols-2">
                                <Field label="Company name" htmlFor="company" required>
                                    <Input
                                        id="company"
                                        placeholder="Acme Corp"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                    />
                                </Field>
                                <Field label="Job title" htmlFor="title" required>
                                    <Input
                                        id="title"
                                        placeholder="Backend Engineer"
                                        value={jobTitle}
                                        onChange={(e) => setJobTitle(e.target.value)}
                                    />
                                </Field>
                            </div>

                            <Field
                                label="Job description"
                                htmlFor="jd"
                                hint="Optional, but it noticeably improves the email and the generated CV."
                            >
                                <Textarea
                                    id="jd"
                                    placeholder="Paste the job description..."
                                    value={jobDescription}
                                    onChange={(e) => setJobDescription(e.target.value)}
                                />
                            </Field>

                            <div className="-mt-2 mb-5 flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => analyzeJobFit(jobDescription)}
                                    disabled={analyzingFit || !jobDescription.trim()}
                                    loading={analyzingFit}
                                >
                                    {!analyzingFit && <Gauge className="size-3.5" aria-hidden="true" />}
                                    Analyse job fit
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startResumeOptimization(jobDescription)}
                                    disabled={!jobDescription.trim()}
                                >
                                    <FileText className="size-3.5" aria-hidden="true" />
                                    Build matched CV
                                </Button>
                            </div>

                            {fitResults && (
                                <div className="mb-5 rounded-xl border border-white/8 bg-white/2 p-4">
                                    {/* One CV per account, so one score — the
                                        three-way comparison had nothing left to compare. */}
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-sm font-bold">ATS match</p>
                                        <span
                                            className={cn(
                                                'text-xl font-extrabold',
                                                fitResults.score > 75 ? 'text-success'
                                                    : fitResults.score > 50 ? 'text-warning' : 'text-danger',
                                            )}
                                            data-numeric
                                        >
                                            {fitResults.score ?? 0}%
                                        </span>
                                    </div>
                                    {fitResults.advice?.length > 0 && (
                                        <ul className="mt-4 space-y-1.5 border-t border-white/8 pt-3">
                                            {fitResults.advice.map((adv, i) => (
                                                <li key={i} className="flex gap-2 text-sm text-muted">
                                                    <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden="true" />
                                                    {adv}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <Field label="Extra context" htmlFor="extra" hint="Anything worth mentioning, e.g. a mutual contact.">
                                <Textarea
                                    id="extra"
                                    placeholder="I met your CTO at KubeCon..."
                                    value={extraContext}
                                    onChange={(e) => setExtraContext(e.target.value)}
                                    className="min-h-20"
                                />
                            </Field>

                            <Button type="button" onClick={goToStep2} block size="lg" disabled={!step1Valid()}>
                                Continue to recipients
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </Button>
                        </Card>
                    </div>
                )}

                {/* ══ STEP 2 — Recipients ═══════════════════════════════════════ */}
                {step === 1 && (
                    <Card>
                        <CardTitle
                            icon={Users}
                            accent="info"
                            title="Who should this reach?"
                            description={companyName ? `Looking at ${companyName}` : 'Pick or add recipients.'}
                        />

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleFindEmployees}
                            disabled={findingEmps || !companyName.trim()}
                            loading={findingEmps}
                            block
                            className="mb-5"
                        >
                            {!findingEmps && <Search className="size-4" aria-hidden="true" />}
                            Find contacts at {companyName || 'this company'}
                        </Button>

                        {employees.length > 0 && (
                            <fieldset className="mb-6">
                                <legend className="ui-label">
                                    Recipients
                                    <span className="ml-1 font-normal text-subtle">({selectedEmps.length} selected)</span>
                                </legend>
                                <ul className="space-y-2">
                                    {employees.map((emp) => (
                                        <RecipientRow
                                            key={emp.email}
                                            emp={emp}
                                            selected={selectedEmps.includes(emp.email)}
                                            onToggle={toggleEmployee}
                                        />
                                    ))}
                                </ul>
                            </fieldset>
                        )}

                        {historyContacts.length > 0 && (
                            <div className="mb-6">
                                <p className="ui-label">Previously found at this company</p>
                                <ul className="flex flex-wrap gap-2">
                                    {historyContacts
                                        .filter((c) => !employees.some((e) => e.email === c.email))
                                        .map((c) => (
                                            <li key={c.email}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEmployees((prev) => [...prev, c]);
                                                        setSelectedEmps((prev) => [...new Set([...prev, c.email])]);
                                                    }}
                                                    className="tap inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/4 px-3 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-text"
                                                >
                                                    <span aria-hidden="true">+</span>
                                                    {c.email}
                                                </button>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        )}

                        <div className="grid gap-x-4 sm:grid-cols-2">
                            <Field label="Or add an email manually" htmlFor="manual-email">
                                <Input
                                    id="manual-email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="email"
                                    placeholder="hiring@company.com"
                                    value={manualEmail}
                                    onChange={(e) => setManualEmail(e.target.value)}
                                />
                            </Field>
                            <Field label="Phone (optional)" htmlFor="manual-phone">
                                <Input
                                    id="manual-phone"
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    placeholder="+44 7700 900000"
                                    value={manualPhone}
                                    onChange={(e) => setManualPhone(e.target.value)}
                                />
                            </Field>
                        </div>

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                            <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                Back
                            </Button>
                            <Button type="button" onClick={goToStep3} disabled={!step2Valid()}>
                                Write the email
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </Button>
                        </div>
                    </Card>
                )}

                {/* ══ STEP 3 — Email & send ═════════════════════════════════════ */}
                {step === 2 && (
                    <div className="space-y-5">
                        <ResumeOptimizerPanel
                            optimizeState={optimizeState}
                            compact={isExtension}
                            attachCover={attachCoverLetter}
                            onAttachCoverChange={setAttachCoverLetter}
                        />

                        <Card>
                            <CardTitle icon={Mail} title="Your email" description="Review and edit before it goes out." />

                            {generating ? (
                                <div className="py-12 text-center" aria-live="polite">
                                    <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                                    <p className="font-semibold">Writing your email…</p>
                                    <p className="mt-1 text-sm text-subtle">Usually about five seconds.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Generation can fail on a slow connection. Without this the
                                        step just shows two empty boxes and no way forward. */}
                                    {generateError && (
                                        <Alert tone="danger" className="mb-5">
                                            <span className="block font-semibold">Couldn&apos;t write your email.</span>
                                            <span className="mt-0.5 block text-sm">{generateError}</span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                className="mt-3"
                                                onClick={generateEmail}
                                            >
                                                <Sparkles className="size-3.5" aria-hidden="true" />
                                                Try again
                                            </Button>
                                        </Alert>
                                    )}

                                    <Field label="Subject" htmlFor="subject">
                                        <Input
                                            id="subject"
                                            value={emailSubject}
                                            onChange={(e) => setEmailSubject(e.target.value)}
                                        />
                                    </Field>

                                    <Field label="Body" htmlFor="body" hint="Edit anything that doesn't sound like you.">
                                        <Textarea
                                            id="body"
                                            value={emailBody}
                                            onChange={(e) => setEmailBody(e.target.value)}
                                            className="min-h-72 font-mono text-[0.9rem] leading-relaxed"
                                        />
                                    </Field>

                                    <div className="mb-6">
                                        <p className="ui-label">
                                            Sending to
                                            <span className="ml-1 font-normal text-subtle">
                                                ({allRecipients.length} recipient{allRecipients.length !== 1 ? 's' : ''})
                                            </span>
                                        </p>
                                        {allRecipients.length === 0 ? (
                                            <Alert tone="warning">No recipients selected — go back and pick at least one.</Alert>
                                        ) : (
                                            <ul className="flex flex-wrap gap-2">
                                                {allRecipients.map((r) => (
                                                    <li key={r.email}>
                                                        <Badge tone="neutral" className="normal-case tracking-normal">
                                                            {r.email}
                                                        </Badge>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    {/* Only shown once the owner has registered someone —
                                        otherwise every application is simply theirs. */}
                                    {teamMembers.length > 0 && (
                                        <fieldset className="mb-6">
                                            <legend className="ui-label">Applying on behalf of</legend>
                                            <div className="flex flex-wrap gap-2">
                                                {[{ value: '', label: ownerName ? `${ownerName} (you)` : 'You' },
                                                  ...teamMembers.map((m) => ({ value: m, label: m }))].map((opt) => (
                                                    <button
                                                        key={opt.value || 'owner'}
                                                        type="button"
                                                        onClick={() => setAppliedBy(opt.value)}
                                                        aria-pressed={appliedBy === opt.value}
                                                        className={cn(
                                                            'tap min-h-10 rounded-lg border px-3.5 text-sm font-semibold transition-colors duration-150',
                                                            appliedBy === opt.value
                                                                ? 'border-brand/50 bg-brand/12 text-brand'
                                                                : 'border-white/10 bg-white/2 text-muted hover:border-white/25',
                                                        )}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="ui-hint">
                                                The email, resume and sender stay yours — this only records who pressed send.
                                            </p>
                                        </fieldset>
                                    )}

                                    <fieldset className="mb-6">
                                        <legend className="ui-label">Automatic follow-up</legend>
                                        <div className="flex flex-wrap gap-2">
                                            {FOLLOW_UP_OPTIONS.map((opt) => (
                                                <button
                                                    key={opt.days}
                                                    type="button"
                                                    onClick={() => setFollowUpDays(opt.days)}
                                                    aria-pressed={followUpDays === opt.days}
                                                    className={cn(
                                                        'tap min-h-10 rounded-lg border px-3.5 text-sm font-semibold transition-colors duration-150',
                                                        followUpDays === opt.days
                                                            ? 'border-brand/50 bg-brand/12 text-brand'
                                                            : 'border-white/10 bg-white/2 text-muted hover:border-white/25',
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="ui-hint">We&apos;ll send one polite nudge if nobody replies.</p>
                                    </fieldset>

                                    <fieldset className="mb-6">
                                        <legend className="ui-label">When to send</legend>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {[
                                                { id: 'now', label: 'Send now', desc: 'Goes out immediately', icon: Send },
                                                { id: 'schedule', label: 'Schedule', desc: 'Pick a date and time', icon: CalendarClock },
                                            ].map((opt) => {
                                                const Icon = opt.icon;
                                                const active = applyTiming === opt.id;
                                                return (
                                                    <label
                                                        key={opt.id}
                                                        className={cn(
                                                            'tap flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-150',
                                                            active ? 'border-brand/50 bg-brand/8' : 'border-white/8 bg-white/2 hover:border-white/20',
                                                        )}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="applyTiming"
                                                            checked={active}
                                                            onChange={() => setApplyTiming(opt.id)}
                                                            className="mt-0.5 size-4 accent-[var(--color-brand)]"
                                                        />
                                                        <Icon className={cn('mt-0.5 size-4 shrink-0', active ? 'text-brand' : 'text-subtle')} aria-hidden="true" />
                                                        <span className="min-w-0">
                                                            <span className="block text-sm font-semibold">{opt.label}</span>
                                                            <span className="block text-xs text-subtle">{opt.desc}</span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        {applyTiming === 'schedule' && (
                                            <div className="mt-3">
                                                <label className="ui-label" htmlFor="scheduled-at">Date and time</label>
                                                <Input
                                                    id="scheduled-at"
                                                    type="datetime-local"
                                                    value={scheduledAt}
                                                    onChange={(e) => setScheduledAt(e.target.value)}
                                                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                                                />
                                            </div>
                                        )}
                                    </fieldset>

                                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                                        <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                                            <ArrowLeft className="size-4" aria-hidden="true" />
                                            Back
                                        </Button>
                                        <Button
                                            type="button"
                                            size="lg"
                                            onClick={handleSend}
                                            disabled={sending || allRecipients.length === 0 || !emailSubject || !emailBody}
                                            loading={sending}
                                        >
                                            {!sending && <Send className="size-4" aria-hidden="true" />}
                                            {applyTiming === 'schedule' ? 'Schedule email' : `Send to ${allRecipients.length}`}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
