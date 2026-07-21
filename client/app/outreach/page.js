'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import ResumeOptimizerPanel from '../components/ResumeOptimizerPanel';
import UkJobFinder from '../components/UkJobFinder';
import JobSources from '../components/JobSources';
import JobRadar from '../components/JobRadar';
import ApplicationPipeline from '../components/ApplicationPipeline';

const API = 'http://localhost:5000';

function Toast({ toasts }) {
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ'} {t.message}
                </div>
            ))}
        </div>
    );
}

function Stepper({ step }) {
    const steps = ['Job Details', 'Find Employees', 'Email & Send'];
    return (
        <div className="stepper">
            {steps.map((s, i) => (
                <div key={i} className="step-item" style={{ flex: i < steps.length - 1 ? 1 : 'none' }}>
                    <div className={`step-circle ${step === i ? 'active' : step > i ? 'done' : ''}`}>
                        {step > i ? '✓' : i + 1}
                    </div>
                    <span className={`step-label ${step === i ? 'active' : ''}`}>{s}</span>
                    {i < steps.length - 1 && <div className={`step-line ${step > i ? 'done' : ''}`} />}
                </div>
            ))}
        </div>
    );
}

export default function OutreachPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [userEmail, setUserEmail] = useState('');
    const [toasts, setToasts] = useState([]);
    const [loading, setLoading] = useState(false);
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

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
    };

    useEffect(() => {
        const saved = localStorage.getItem('jobreach_email');
        if (saved) setUserEmail(saved);

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
                
                addToast('⚡ Job details imported from Extension!', 'success');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const direction = autoStep > previousAutoStep ? 1 : -1;

    async function fetchHistoryContacts(name) {
        if (!name) return;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/company-contacts?companyName=${encodeURIComponent(name)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
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
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/extract-from-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ url: linkedinUrl }),
            });
            const data = await res.json();
            if (res.ok) {
                if (data.companyName) setCompanyName(data.companyName);
                if (data.jobTitle) setJobTitle(data.jobTitle);
                if (data.jobDescription) {
                    setJobDescription(data.jobDescription);
                    analyzeJobFit(data.jobDescription); // Trigger analysis automatically
                }
                if (data.postEmails?.length) {
                    setPostEmails(data.postEmails);
                    addToast(`✨ Job details extracted! Found ${data.postEmails.length} email(s) in post.`, 'success');
                } else {
                    addToast('✨ Job details extracted!', 'success');
                }
                if (data.companyName) fetchHistoryContacts(data.companyName);
            } else {
                addToast(data.message || 'Extraction failed.', 'error');
            }
        } catch (e) {
            addToast('Connection error during extraction.', 'error');
        }
        setScraping(false);
    }

    // ── Background resume optimization (dynamic CV per JD) ──────────────────
    async function startResumeOptimization(jd) {
        if (!jd?.trim() || jd.trim() === optimizeJdRef.current) return;
        optimizeJdRef.current = jd.trim();
        if (optimizePollRef.current) clearInterval(optimizePollRef.current);

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/optimize-resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ jobDescription: jd, userEmail }),
            });
            const data = await res.json();
            if (!res.ok) { setOptimizeState({ status: 'failed' }); return; }
            if (data.status === 'done') {
                setOptimizeState({ key: data.key, status: 'done', result: data.result });
                return;
            }
            setOptimizeState({ key: data.key, status: 'pending' });

            let polls = 0;
            optimizePollRef.current = setInterval(async () => {
                polls += 1;
                try {
                    const sr = await fetch(`${API}/api/jobs/optimize-resume/status?key=${data.key}`);
                    const sd = await sr.json();
                    if (sd.status === 'done') {
                        clearInterval(optimizePollRef.current);
                        setOptimizeState({ key: data.key, status: 'done', result: sd.result });
                        addToast('✨ Dynamic CV ready for this job!', 'success');
                    } else if (sd.status === 'failed' || polls > 24) {
                        clearInterval(optimizePollRef.current);
                        setOptimizeState({ key: data.key, status: 'failed' });
                    }
                } catch { /* keep polling until cap */ }
            }, 5000);
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
            const res = await fetch(`${API}/api/jobs/analyze-fit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobDescription: textToAnalyze, userEmail }),
            });
            const data = await res.json();
            if (res.ok && data.scores) {
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
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/scrape-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ url: profileUrl }),
            });
            const data = await res.json();
            if (res.ok) {
                setScrapedContact(data);
                addToast('✨ Profile details extracted!', 'success');
            } else {
                addToast(data.message || 'Scraping failed.', 'error');
            }
        } catch (e) {
            addToast('Connection error during profile scraping.', 'error');
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
        setFindingEmps(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/find-employees`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ companyName, companyDomain }),
            });
            const data = await res.json();
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

    async function goToStep3() {
        if (!step2Valid()) { addToast('Select at least one employee or add a manual email.', 'error'); return; }
        setStep(2);
        setVariants([]);
        setSelectedVariant(null);
        setEmailSubject('');
        setEmailBody('');
        setGenerating(true);
        try {
            const firstEmp = employees.find(e => selectedEmps.includes(e.email));
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/generate-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userEmail, emailType, jobTitle, companyName,
                    jobDescription, extraContext,
                    recipientName: firstEmp ? `${firstEmp.firstName} ${firstEmp.lastName}`.trim() : '',
                }),
            });
            const data = await res.json();
            if (data.variants && data.variants.length > 0) {
                setVariants(data.variants);
                // Automatically select the first (and only) variant
                const first = data.variants[0];
                setSelectedVariant(0);
                setEmailSubject(first.subject);
                setEmailBody(first.body);
                addToast('✨ Email generated by Gemini AI!', 'success');
            }
            else {
                addToast('Generation failed: ' + (data.message || 'Unknown error'), 'error');
            }
        } catch (e) {
            addToast('Email generation failed: ' + e.message, 'error');
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
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API}/api/jobs/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userEmail, recipients, subject: emailSubject, body: emailBody,
                    linkedinUrl, companyName, jobTitle, jobDescription, emailType, extraContext,
                    manualEmail, manualPhone, employees, followUpDays,
                    scheduledAt: applyTiming === 'schedule' ? scheduledAt : null,
                }),
            });
            const data = await res.json();
            setResumeOptimizing(false);
            if (res.ok) {
                if (data.optimizedResumeUsed) {
                    setOptimizedResumeInfo({ selectedResume: data.optimizedResumeUsed, matchScore: data.optimizedMatchScore });
                }
                if (data.resumeError) {
                    addToast(`⚠ Resume optimisation failed: ${data.resumeError}`, 'error');
                }
                if (data.attachmentStatus === 'missing') {
                    addToast('⚠ No resume was attached — upload one on your profile.', 'error');
                }
                if (data.scheduled) {
                    addToast(`📅 ${data.message}`, 'success');
                    setTimeout(() => router.push('/history'), 2500);
                } else {
                    addToast(`🎉 ${data.message}`, 'success');
                    setTimeout(() => router.push('/history'), 3000);
                }
            } else {
                addToast(data.message || 'Failed to send emails.', 'error');
            }
        } catch (err) {
            setResumeOptimizing(false);
            console.error('Send failed:', err);
            addToast(`Send failed: ${err.message}. Check the server & Gmail credentials in .env`, 'error');
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

        try {
            // Simulated progress for better UX
            const delay = (ms) => new Promise(res => setTimeout(res, ms));

            setAutoStep(1); await delay(800); // Analyzing Input
            setAutoStep(2); await delay(1000); // Extracting Job

            const token = localStorage.getItem('authToken');
            const payload = { 
                url: isUrl ? linkedinUrl : undefined, 
                jobText: !isUrl ? effectiveJobText : undefined,
                userEmail, 
                emailType, 
                extraContext 
            };

            const res = await fetch(`${API}/api/jobs/autopilot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });

            if (res.status === 403) {
                setLimitReached(true);
                setAutopilot(false);
                addToast('Monthly limit reached! Please upgrade.', 'warning');
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Autopilot failed');

            setAutoStep(3); await delay(800); // Finding domain
            setAutoStep(4); await delay(1200); // Discovering employees
            setAutoStep(5); await delay(1000); // Optimizing resume
            setAutoStep(6); await delay(1500); // Generating emails
            setAutoStep(7); await delay(600);  // Finalizing
            setAutoStep(8); await delay(400);  // Ready!

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
            addToast(err.message, 'error');
            setAutopilot(false);
        }
    }

    const allRecipients = [
        ...employees.filter(e => selectedEmps.includes(e.email)),
        ...(manualEmail.trim() ? [{ firstName: 'Manual', lastName: '', email: manualEmail, position: '' }] : []),
    ];

    return (
        <AuthGuard>
            <main className="page" style={isExtension ? { paddingTop: 20 } : {}}>
                <div className="container" style={isExtension ? { maxWidth: '100%', padding: '0 12px' } : { maxWidth: 780 }}>
                    {!isExtension && (
                        <div className="page-header">
                            <h1>New Job Outreach</h1>
                            <p>3 steps to send personalized emails automatically</p>
                        </div>
                    )}

                    {
                        !userEmail && (
                            <div className="alert alert-warning" style={{ marginBottom: 24 }}>
                                ⚠ No profile found. <Link href="/profile" style={{ color: 'var(--accent)' }}>Set up your profile first →</Link>
                            </div>
                        )
                    }

                    <Stepper step={step} />

                    {/* ─── STEP 1: Job Details ─────────────────────────────────────────── */}
                    {
                        step === 0 && (
                            <div className="card">
                                <div className="card-title"><span className="icon">💼</span> Job Details</div>

                                {/* Email Type Selector */}
                                <div className="form-group">
                                    <label>What kind of email?</label>
                                    <div className="radio-group">
                                        {[
                                            { value: 'referral', icon: '🤝', label: 'Referral Request', desc: 'Ask someone to refer you' },
                                            { value: 'direct_apply', icon: '📨', label: 'Direct Apply', desc: 'Apply directly to employee' },
                                            { value: 'vacancy_inquiry', icon: '🔍', label: 'Vacancy Inquiry', desc: 'Ask if positions are open' },
                                        ].map(opt => (
                                            <div key={opt.value} className="radio-option">
                                                <input
                                                    type="radio" id={opt.value} name="emailType"
                                                    value={opt.value} checked={emailType === opt.value}
                                                    onChange={() => setEmailType(opt.value)}
                                                />
                                                <label htmlFor={opt.value}>
                                                    <span className="radio-icon">{opt.icon}</span>
                                                    <span className="radio-label">{opt.label}</span>
                                                    <span className="radio-desc">{opt.desc}</span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Unified LinkedIn Auto-Fill Field */}
                                <div className="form-group" style={{ marginBottom: 32, padding: '28px', background: 'rgba(108, 99, 255, 0.04)', borderRadius: '20px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--gradient)' }} />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <label style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                            🚀 One-Click Autopilot
                                        </label>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Recommended for speed</div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, flexDirection: isExtension ? 'column' : 'row', marginBottom: 16 }}>
                                        <input
                                            type="url"
                                            placeholder="Paste LinkedIn job URL..."
                                            value={linkedinUrl}
                                            onChange={e => setLinkedinUrl(e.target.value)}
                                            style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'white', borderRadius: 12, padding: '14px 18px', fontSize: '1rem' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => runAutopilot('url')}
                                            disabled={autopilot || !linkedinUrl.trim()}
                                            className="btn btn-primary"
                                            style={{ borderRadius: 12, padding: '0 28px', minWidth: isExtension ? '100%' : '180px', fontSize: '1rem', height: '54px' }}
                                        >
                                            {autopilot && autoMode === 'url' ? <div className="spinner" /> : '🚀 Start via URL'}
                                        </button>
                                    </div>

                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 16, fontWeight: 700 }}>OR</div>

                                    {/* Paragraph approach */}
                                    <div style={{ display: 'flex', gap: 12, flexDirection: isExtension ? 'column' : 'row' }}>
                                        <textarea
                                            placeholder="Paste full job description paragraph (include company and title if possible)..."
                                            value={pastedJobDescription}
                                            onChange={e => setPastedJobDescription(e.target.value)}
                                            style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'white', borderRadius: 12, padding: '14px 18px', fontSize: '1rem', minHeight: '80px', resize: 'vertical' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => runAutopilot('text')}
                                            disabled={autopilot || !pastedJobDescription.trim()}
                                            className="btn btn-primary"
                                            style={{ borderRadius: 12, padding: '0 28px', minWidth: isExtension ? '100%' : '180px', fontSize: '1rem', height: '80px' }}
                                        >
                                            {autopilot && autoMode === 'text' ? <div className="spinner" /> : '🚀 Start via Text'}
                                        </button>
                                    </div>

                                    {autopilot && (
                                        <div className="autopilot-flow" style={{ marginTop: 40, width: '100%' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.2rem', marginBottom: 8 }}>AI Orchestrator v1.1</div>
                                                    <h2 style={{ fontSize: '32px', color: 'white', fontFamily: 'var(--font-serif)' }}>
                                                        {autoStep === 8 ? 'Successfully Orchestrated' : 'Current Processing State'}
                                                    </h2>
                                                </div>
                                            </div>

                                            <div className="carousel-wrapper" style={{ overflow: 'hidden', position: 'relative', width: '100%' }}>
                                                <div className="carousel-track" style={{
                                                    display: 'flex',
                                                    transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    transform: `translateX(calc(-${(autoStep - 1) * 100}%))`,
                                                    willChange: 'transform'
                                                }}>
                                                    {[
                                                        { icon: '🔍', title: 'Scraping', sub: 'Fetching Job Post...', desc: 'Reading job post metadata and verifying requirements...' },
                                                        { icon: '🧠', title: 'Learning', sub: 'Analyzing Profile...', desc: 'Understanding technical stack and matching qualifications...' },
                                                        { icon: '🌐', title: 'Sourcing', sub: 'Finding the Right People', desc: 'Verifying company domains and corporate structure...' },
                                                        { icon: '👥', title: 'Targeting', sub: 'Targeting Decision Makers', desc: 'Identifying decision makers and hiring managers...' },
                                                        { icon: '📎', title: 'Resume', sub: '✨ Optimizing Resume...', desc: 'AI is scoring & rewriting your resume against this exact JD...' },
                                                        { icon: '✍️', title: 'Writing', sub: 'Crafting Your Emails', desc: 'Generating high-impact personalized outreach copy...' },
                                                        { icon: '📊', title: 'Finalizing', sub: 'Selecting Best Resume', desc: 'Picking the highest ATS-match resume for this role...' },
                                                        { icon: '🚀', title: 'Ready', sub: 'All Set!', desc: 'Preparing everything for your final approval...' },
                                                    ].map((s, i) => {
                                                        const active = autoStep === i + 1;
                                                        const done = autoStep > i + 1;
                                                        const pending = autoStep < i + 1;

                                                        return (
                                                            <div key={i} className={`step-card ${active ? 'active' : done ? 'done' : 'pending'}`} style={{
                                                                minWidth: '100%',
                                                                display: 'flex',
                                                                justifyContent: 'center',
                                                                padding: '0 20px',
                                                                opacity: active ? 1 : 0.4,
                                                                transform: active ? 'scale(1)' : 'scale(0.95)',
                                                                transition: 'all 0.5s ease',
                                                                flexShrink: 0
                                                            }}>
                                                                <div className="glass-card" style={{
                                                                    width: '100%',
                                                                    maxWidth: '480px',
                                                                    padding: '48px 40px',
                                                                    borderTop: active ? '2px solid #6366f1' : done ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                                                                    boxShadow: active ? '0 0 32px rgba(99, 102, 241, 0.2)' : 'none',
                                                                    filter: pending ? 'grayscale(0.3)' : 'none',
                                                                    position: 'relative'
                                                                }}>
                                                                    <div className="step-header">
                                                                        <span style={{ fontSize: '11px', fontWeight: 800, color: active ? '#6366f1' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: 16 }}>Step {i + 1} of 8</span>
                                                                        <h2 style={{ fontSize: '30px', color: 'white', marginBottom: 12, fontFamily: 'var(--font-serif)' }}>{s.sub}</h2>
                                                                        <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>{s.desc}</p>
                                                                    </div>
                                                                    <div style={{ fontSize: '3rem' }}>{s.icon}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 40 }}>
                                                {[...Array(8)].map((_, i) => (
                                                    <div key={i} style={{
                                                        width: autoStep === i + 1 ? 24 : 8,
                                                        height: 8,
                                                        borderRadius: 4,
                                                        background: autoStep === i + 1 ? '#6366f1' : autoStep > i + 1 ? '#10b981' : 'rgba(255,255,255,0.1)',
                                                        transition: 'all 0.3s ease'
                                                    }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {limitReached && (
                                        <div className="alert alert-error" style={{ marginTop: 16, marginBottom: 0 }}>
                                            <span>🚫 Monthly limit reached for Free plan. <Link href="/pricing" style={{ color: 'white', textDecoration: 'underline' }}>Upgrade to continue →</Link></span>
                                        </div>
                                    )}

                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>💡 Autopilot scrapes, finds emails, and writes personalized messages in one go.</span>
                                    </div>
                                </div>

                                {/* LinkedIn Profile Contact Finder Section */}
                                <div className="form-group" style={{
                                    marginBottom: 32,
                                    padding: '24px',
                                    background: 'rgba(34, 197, 94, 0.04)',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(34, 197, 94, 0.15)',
                                    position: 'relative'
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#22c55e' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <label style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                            🔍 Profile Contact Finder
                                        </label>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Get email & mobile from profile</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, flexDirection: isExtension ? 'column' : 'row' }}>
                                        <input
                                            type="url"
                                            placeholder="Paste LinkedIn Profile URL..."
                                            value={profileUrl}
                                            onChange={e => setProfileUrl(e.target.value)}
                                            style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'white', borderRadius: 12, padding: '12px 18px', fontSize: '0.95rem' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleProfileScrape}
                                            disabled={profileScraping || !profileUrl.trim()}
                                            className="btn btn-secondary"
                                            style={{ borderRadius: 12, padding: '0 24px', whiteSpace: 'nowrap', width: isExtension ? '100%' : 'auto' }}
                                        >
                                            {profileScraping ? <div className="spinner" /> : 'Find Contact'}
                                        </button>
                                    </div>

                                    {scrapedContact && (
                                        <div style={{
                                            marginTop: 20,
                                            padding: '16px',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '12px',
                                            border: '1px solid var(--border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>
                                                    {scrapedContact.firstName} {scrapedContact.lastName}
                                                </div>
                                                <div style={{ display: 'flex', gap: 16, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    {scrapedContact.email && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            📧 {scrapedContact.email}
                                                        </span>
                                                    )}
                                                    {scrapedContact.phone && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            📱 {scrapedContact.phone}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={addScrapedToRecipients}
                                                className="btn btn-primary btn-sm"
                                                style={{ height: '36px', borderRadius: '8px' }}
                                            >
                                                + Add Recipient
                                            </button>
                                        </div>
                                    )}
                                </div>



                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="form-group">
                                        <label>Company Name *</label>
                                        <input
                                            type="text"
                                            placeholder="Google, Microsoft, etc."
                                            value={companyName}
                                            onChange={e => setCompanyName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Job Title *</label>
                                        <input
                                            type="text"
                                            placeholder="Software Engineer"
                                            value={jobTitle}
                                            onChange={e => setJobTitle(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                                        <label style={{ marginBottom: 0 }}>Job Description / Requirements</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => analyzeJobFit(jobDescription)}
                                                disabled={analyzingFit || !jobDescription.trim()}
                                            >
                                                {analyzingFit ? <><span className="spinner"/> Analyzing...</> : '📊 Analyze Job Fit'}
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => startResumeOptimization(jobDescription)}
                                                disabled={optimizeState?.status === 'pending' || !jobDescription.trim()}
                                            >
                                                {optimizeState?.status === 'pending' ? <><span className="spinner"/> Optimizing...</> : '✨ Optimize Resume'}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        placeholder="Paste the job description here (optional but improves email quality)..."
                                        value={jobDescription}
                                        onChange={e => setJobDescription(e.target.value)}
                                        style={{ minHeight: 120 }}
                                    />
                                </div>

                                {fitResults && (
                                    <div style={{ marginBottom: 20, padding: 16, background: 'rgba(99,102,241,0.05)', borderRadius: 12, border: '1px solid rgba(99,102,241,0.2)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                🧬 ATS Scan Results
                                            </div>
                                            <div className="badge badge-green">Recommended: {
                                                fitResults.recommendedResume === 'genai' ? '🤖 Gen AI' : 
                                                fitResults.recommendedResume === 'backend' ? '⚙️ Backend' : '📄 Main'
                                            }</div>
                                        </div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                                            {['main', 'genai', 'backend'].map(type => (
                                                <div key={type} style={{ padding: 12, background: 'var(--bg-panel)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                                                        {type === 'genai' ? '🤖 Gen AI' : type === 'backend' ? '⚙️ Backend' : '📄 Main'}
                                                    </div>
                                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: fitResults.scores?.[type] > 75 ? '#10b981' : fitResults.scores?.[type] > 50 ? '#f59e0b' : '#ef4444' }}>
                                                        {fitResults.scores?.[type] || 0}%
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {fitResults.advice?.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>💡 Skills & Improvement Advice:</div>
                                                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {fitResults.advice.map((adv, i) => <li key={i}>{adv}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <ResumeOptimizerPanel apiBase={API} optimizeState={optimizeState} compact={isExtension} />

                                <ApplicationPipeline
                                    apiBase={API}
                                    userEmail={userEmail}
                                    isExtension={isExtension}
                                    refreshKey={pipelineKey}
                                />

                                <JobRadar
                                    apiBase={API}
                                    userEmail={userEmail}
                                    isExtension={isExtension}
                                    onApplicationChange={refreshPipeline}
                                />

                                <JobSources
                                    apiBase={API}
                                    userEmail={userEmail}
                                    isExtension={isExtension}
                                    onApplicationChange={refreshPipeline}
                                />

                                <UkJobFinder
                                    apiBase={API}
                                    isExtension={isExtension}
                                    autopilotBusy={autopilot}
                                    userEmail={userEmail}
                                    onApplicationChange={refreshPipeline}
                                    onRunAutopilot={(job) => {
                                        const jobText = `${job.title} at ${job.company}${job.location ? ` (${job.location})` : ''}\n\n${job.description || ''}`;
                                        setPastedJobDescription(jobText);
                                        if (job.description) startResumeOptimization(job.description);
                                        runAutopilot('text', jobText);
                                    }}
                                />

                                <div className="form-group">
                                    <label>Extra Context (optional)</label>
                                    <textarea
                                        placeholder="Anything specific to mention, e.g. 'I met the CEO at a conference' or 'I have 3 years in Go'"
                                        value={extraContext}
                                        onChange={e => setExtraContext(e.target.value)}
                                        style={{ minHeight: 70 }}
                                    />
                                </div>

                                <button
                                    className="btn btn-primary btn-full btn-lg"
                                    onClick={goToStep2}
                                    disabled={!step1Valid()}
                                >
                                    Find Employees →
                                </button>
                            </div>
                        )
                    }

                    {/* ─── STEP 2: Find Employees ─────────────────────────────────────── */}
                    {
                        step === 1 && (
                            <div className="card">
                                <div className="card-title"><span className="icon">👥</span> Find Employees at {companyName}</div>

                                <div className="alert alert-info" style={{ marginBottom: 20 }}>
                                    <span>ℹ</span>
                                    <span>We'll search Hunter.io for employees with public emails. Up to 10 will be shown.</span>
                                </div>

                                <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                        <label>Company Domain (optional)</label>
                                        <input
                                            type="text"
                                            placeholder="google.com (auto-detected if left blank)"
                                            value={companyDomain}
                                            onChange={e => setCompanyDomain(e.target.value)}
                                        />
                                    </div>
                                    <div style={{ alignSelf: 'flex-end', paddingBottom: 1 }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleFindEmployees}
                                            disabled={findingEmps}
                                        >
                                            {findingEmps ? <><span className="spinner" /> Searching...</> : '🔍 Find Employees'}
                                        </button>
                                    </div>
                                </div>

                                {employees.length > 0 && (
                                    <div className="form-group">
                                        <label>Select Recipients ({selectedEmps.length} selected)</label>
                                        <div className="employee-list">
                                            {employees.map(emp => (
                                                <div
                                                    key={emp.email}
                                                    className={`employee-item ${selectedEmps.includes(emp.email) ? 'selected' : ''}`}
                                                    onClick={() => toggleEmployee(emp.email)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedEmps.includes(emp.email)}
                                                        onChange={() => toggleEmployee(emp.email)}
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                    <div className="employee-avatar">
                                                        {emp.source === 'post' ? '📧' : (emp.firstName?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div className="employee-info">
                                                        <div className="employee-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            {emp.firstName} {emp.lastName}
                                                            {emp.source === 'post' && (
                                                                <span style={{ fontSize: '0.65rem', background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '2px 8px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.05em' }}>FROM POST</span>
                                                            )}
                                                        </div>
                                                        <div className="employee-email" style={{ display: 'flex', gap: 12 }}>
                                                            <span>📧 {emp.email}</span>
                                                            {emp.phone && <span style={{ color: '#22c55e' }}>📱 {emp.phone}</span>}
                                                        </div>
                                                        {emp.position && <div className="employee-role">{emp.position}</div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                                    <div className="form-group">
                                        <label>Or Add Email Manually</label>
                                        <input
                                            type="email"
                                            placeholder="direct.email@company.com"
                                            value={manualEmail}
                                            onChange={e => setManualEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Mobile Number (Optional)</label>
                                        <input
                                            type="tel"
                                            placeholder="+1 234 567 890"
                                            value={manualPhone}
                                            onChange={e => setManualPhone(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* History Contacts Section */}
                                {historyContacts.length > 0 && (
                                    <div style={{ marginBottom: 24, padding: '20px', background: 'rgba(52, 211, 153, 0.05)', borderRadius: '16px', border: '1px solid rgba(52, 211, 153, 0.15)' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            📜 Previously Found at {companyName}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                                            {historyContacts.filter(hc => !employees.some(e => e.email === hc.email)).map((hc, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => {
                                                        if (!employees.some(e => e.email === hc.email)) {
                                                            setEmployees(prev => [...prev, { ...hc, position: hc.position || 'Previous Contact', source: 'history' }]);
                                                            setSelectedEmps(prev => [...prev, hc.email]);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '10px 14px',
                                                        background: 'var(--bg-secondary)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 10,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        fontSize: '0.85rem'
                                                    }}
                                                    className="history-contact-item"
                                                >
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{hc.firstName} {hc.lastName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>📧 {hc.email}</div>
                                                    {hc.phone && <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: 2 }}>📱 {hc.phone}</div>}
                                                </div>
                                            ))}
                                            {historyContacts.every(hc => employees.some(e => e.email === hc.email)) && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>All known contacts are already listed.</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button className="btn btn-secondary" onClick={() => setStep(0)}>← Back</button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1 }}
                                        onClick={goToStep3}
                                        disabled={!step2Valid()}
                                    >
                                        Generate Email →
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    {/* ─── STEP 3: Email Variants & Send ───────────────────────────── */}
                    {
                        step === 2 && (
                            <div className="card">
                                <div className="card-title"><span className="icon">✉</span> AI Email Variants</div>

                                {generating ? (
                                    <div style={{ textAlign: 'center', padding: '48px 0' }}>
                                        <div className="spinner" style={{ margin: '0 auto 16px', width: 40, height: 40, borderWidth: 3 }} />
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Gemini AI is writing 2 personalized email variants...</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 8 }}>This takes ~5 seconds</div>
                                    </div>
                                ) : selectedVariant === null ? (
                                    /* ── Choose variant ── */
                                    <>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.92rem' }}>
                                            Gemini wrote <strong>2 email styles</strong> for you. Pick the one you like best:
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                                            {variants.map((v, i) => (
                                                <div key={i} style={{
                                                    background: 'var(--surface-hover)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 12,
                                                    padding: '18px 20px',
                                                    display: 'flex', flexDirection: 'column', gap: 12,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{
                                                            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
                                                            textTransform: 'uppercase',
                                                            color: v.style === 'formal' ? 'var(--accent)' : '#f59e0b',
                                                            background: v.style === 'formal' ? 'rgba(108,99,255,0.15)' : 'rgba(245,158,11,0.12)',
                                                            padding: '3px 10px', borderRadius: 20,
                                                        }}>
                                                            {v.style === 'formal' ? '🎩 Formal & Professional' : '⚡ Confident & Direct'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>SUBJECT</div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{v.subject}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>PREVIEW</div>
                                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 120, overflow: 'hidden', maskImage: 'linear-gradient(to bottom, black 60%, transparent)' }}>
                                                            {v.body}
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ marginTop: 'auto' }}
                                                        onClick={() => {
                                                            setSelectedVariant(i);
                                                            setEmailSubject(v.subject);
                                                            setEmailBody(v.body);
                                                        }}
                                                    >
                                                        Use This →
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
                                    </>
                                ) : (
                                    /* ── Edit & Send selected variant ── */
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedVariant(null)}>← Choose Different</button>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Edit if needed, then send</span>
                                        </div>

                                        <div className="form-group">
                                            <label>Subject</label>
                                            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                                        </div>

                                        <div className="form-group">
                                            <label>Email Body</label>
                                            <div className="email-preview">
                                                <div className="email-preview-header">
                                                    <div className="email-dot" style={{ background: '#ef4444' }} />
                                                    <div className="email-dot" style={{ background: '#f59e0b' }} />
                                                    <div className="email-dot" style={{ background: '#22c55e' }} />
                                                    <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Edit directly below</span>
                                                </div>
                                                <textarea
                                                    value={emailBody}
                                                    onChange={e => setEmailBody(e.target.value)}
                                                    style={{ width: '100%', padding: '16px 20px', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.7, resize: 'vertical', minHeight: 220 }}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Sending to ({allRecipients.length} recipient{allRecipients.length !== 1 ? 's' : ''})</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {allRecipients.map(r => (
                                                    <span key={r.email} className="badge badge-purple">
                                                        {r.firstName} {r.lastName} &lt;{r.email}&gt;
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ background: 'rgba(108, 99, 255, 0.04)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: 16 }}>

                                            {/* ── Resume Optimization Panel ── */}
                                            <ResumeOptimizerPanel apiBase={API} optimizeState={optimizeState} compact={isExtension} />

                                            {!optimizeState && resumeOptimizing && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(99,102,241,0.08)', borderRadius: 12, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 16 }}>
                                                    <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 600 }}>✨ Optimizing your resume against this job description…</span>
                                                </div>
                                            )}
                                            {!optimizeState && !resumeOptimizing && optimizedResumeInfo && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', marginBottom: 16 }}>
                                                    <span style={{ fontSize: '1.1rem' }}>✅</span>
                                                    <div>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981' }}>RESUME SELECTED: </span>
                                                        <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 700 }}>
                                                            {optimizedResumeInfo.selectedResume === 'genai' ? 'Gen AI Resume' : 'Backend Resume'}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', color: '#6ee7b7', marginLeft: 8 }}>
                                                            {optimizedResumeInfo.matchScore}% ATS Match
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── Follow-up Reminder ── */}
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>
                                                ⏰ SCHEDULE FOLLOW-UP REMINDER
                                            </label>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                                                We'll remind you to check back if they haven't replied.
                                            </p>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                                                {[
                                                    { label: 'No Follow-up', days: 0 },
                                                    { label: '2 Min (Test)', days: -1 },
                                                    { label: '3 Days', days: 3 },
                                                    { label: '5 Days', days: 5 },
                                                    { label: '7 Days', days: 7 },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.days}
                                                        type="button"
                                                        onClick={() => setFollowUpDays(opt.days)}
                                                        style={{
                                                            padding: '10px 4px',
                                                            borderRadius: '10px',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 600,
                                                            border: '1px solid',
                                                            borderColor: followUpDays === opt.days ? 'var(--accent)' : 'var(--border)',
                                                            background: followUpDays === opt.days ? 'rgba(108, 99, 255, 0.1)' : 'var(--bg-secondary)',
                                                            color: followUpDays === opt.days ? 'var(--accent)' : 'var(--text-secondary)',
                                                            transition: 'all 0.2s',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* ── Apply Timing ── */}
                                        <div className="form-group" style={{ background: 'rgba(16, 185, 129, 0.04)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.15)', marginBottom: 24 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>
                                                📅 APPLY TIMING
                                            </label>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                                                Choose when your application email gets sent.
                                            </p>
                                            <div style={{ display: 'flex', gap: 10, marginBottom: applyTiming === 'schedule' ? 16 : 0 }}>
                                                {[
                                                    { id: 'now', label: '⚡ Send Now', desc: 'Dispatch immediately' },
                                                    { id: 'schedule', label: '🗓 Schedule', desc: 'Pick a date & time' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        id={`apply-timing-${opt.id}`}
                                                        onClick={() => setApplyTiming(opt.id)}
                                                        style={{
                                                            flex: 1,
                                                            padding: '12px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.88rem',
                                                            fontWeight: 600,
                                                            border: '1px solid',
                                                            borderColor: applyTiming === opt.id ? '#10b981' : 'var(--border)',
                                                            background: applyTiming === opt.id ? 'rgba(16,185,129,0.1)' : 'var(--bg-secondary)',
                                                            color: applyTiming === opt.id ? '#10b981' : 'var(--text-secondary)',
                                                            transition: 'all 0.2s',
                                                            cursor: 'pointer',
                                                            textAlign: 'center',
                                                        }}
                                                    >
                                                        <div>{opt.label}</div>
                                                        <div style={{ fontSize: '0.72rem', marginTop: 3, opacity: 0.7 }}>{opt.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                            {applyTiming === 'schedule' && (
                                                <div>
                                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Pick date & time</label>
                                                    <input
                                                        id="scheduled-at-picker"
                                                        type="datetime-local"
                                                        value={scheduledAt}
                                                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                                                        onChange={e => setScheduledAt(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            background: 'var(--bg-secondary)',
                                                            border: '1px solid #10b981',
                                                            color: 'white',
                                                            borderRadius: 12,
                                                            padding: '12px 16px',
                                                            fontSize: '0.95rem',
                                                            colorScheme: 'dark',
                                                        }}
                                                    />
                                                    {scheduledAt && (
                                                        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            ✅ Will send at: <strong>{new Date(scheduledAt).toLocaleString()}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                                            <span>⚠</span>
                                            <span>Make sure <strong>GMAIL_USER</strong> and <strong>GMAIL_APP_PASSWORD</strong> are set in <code>server/.env</code> before sending.</span>
                                        </div>

                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
                                            <button
                                                className="btn btn-success btn-lg"
                                                style={{ flex: 1 }}
                                                onClick={handleSend}
                                                disabled={sending || !emailBody || (applyTiming === 'schedule' && !scheduledAt)}
                                            >
                                                {sending
                                                    ? <><span className="spinner" /> {resumeOptimizing ? 'Optimizing Resume...' : 'Sending...'}</>
                                                    : applyTiming === 'schedule'
                                                        ? `🗓 Schedule Application`
                                                        : `🚀 Send to ${allRecipients.length} Recipient${allRecipients.length !== 1 ? 's' : ''}`
                                                }
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )
                    }
                </div>
                <Toast toasts={toasts} />
            </main>
        </AuthGuard>
    );
}
