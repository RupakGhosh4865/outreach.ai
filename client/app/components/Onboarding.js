'use client';

import { useState } from 'react';
import {
    ArrowLeft, ArrowRight, Briefcase, Check, FileText, Sparkles, Upload, Users,
} from 'lucide-react';
import { Button, Field, Input, cn } from './ui';

const STEPS = [
    { id: 1, title: 'Basics', icon: Users },
    { id: 2, title: 'Role', icon: Briefcase },
    { id: 3, title: 'Resume', icon: FileText },
    { id: 4, title: 'Ready', icon: Sparkles },
];

export default function Onboarding({ onFinish }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        roleType: 'tech',
        targetRole: '',
        experience: '',
        resume: null,
    });

    const nextStep = () => setStep((s) => s + 1);
    const prevStep = () => setStep((s) => s - 1);
    const update = (patch) => setFormData((d) => ({ ...d, ...patch }));

    return (
        <div className="relative flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <div className="aurora" aria-hidden="true" />

            <div className="ui-card relative w-full max-w-lg p-6 sm:p-8">
                {/* Progress */}
                <nav aria-label="Progress" className="mb-8">
                    <ol className="flex items-center gap-2">
                        {STEPS.map((s, i) => {
                            const done = step > s.id;
                            const active = step === s.id;
                            return (
                                <li key={s.id} className={cn('flex items-center gap-2', i < STEPS.length - 1 && 'flex-1')}>
                                    <span
                                        aria-current={active ? 'step' : undefined}
                                        className={cn(
                                            'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                                            done && 'bg-brand text-brand-ink',
                                            active && 'bg-brand/15 text-brand ring-2 ring-brand',
                                            !done && !active && 'bg-white/5 text-subtle ring-1 ring-white/10',
                                        )}
                                    >
                                        {done ? <Check className="size-3.5" aria-hidden="true" /> : s.id}
                                    </span>
                                    {i < STEPS.length - 1 && (
                                        <span
                                            aria-hidden="true"
                                            className={cn('h-px flex-1 transition-colors', done ? 'bg-brand' : 'bg-white/10')}
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                    <p className="sr-only">Step {step} of {STEPS.length}: {STEPS[step - 1].title}</p>
                </nav>

                {step === 1 && (
                    <div className="animate-fade-up">
                        <h1 className="text-xl font-extrabold tracking-tight">Let&apos;s get started</h1>
                        <p className="mt-2 mb-6 text-sm text-muted">First, what should we call you?</p>

                        <Field label="Full name" htmlFor="ob-name">
                            <Input
                                id="ob-name"
                                autoComplete="name"
                                placeholder="Ada Lovelace"
                                value={formData.name}
                                onChange={(e) => update({ name: e.target.value })}
                            />
                        </Field>

                        <Button type="button" block size="lg" onClick={nextStep} disabled={!formData.name}>
                            Continue
                            <ArrowRight className="size-4" aria-hidden="true" />
                        </Button>
                    </div>
                )}

                {step === 2 && (
                    <div className="animate-fade-up">
                        <h1 className="text-xl font-extrabold tracking-tight">What&apos;s your focus?</h1>
                        <p className="mt-2 mb-6 text-sm text-muted">We&apos;ll tailor your outreach to it.</p>

                        <fieldset className="mb-5">
                            <legend className="ui-label">Field</legend>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'tech', label: 'Tech' },
                                    { id: 'nontech', label: 'Non-tech' },
                                ].map((opt) => {
                                    const active = formData.roleType === opt.id;
                                    return (
                                        <label
                                            key={opt.id}
                                            className={cn(
                                                'tap flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-colors',
                                                active ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 bg-white/2 text-muted hover:border-white/25',
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="roleType"
                                                className="sr-only"
                                                checked={active}
                                                onChange={() => update({ roleType: opt.id })}
                                            />
                                            {active && <Check className="size-4" aria-hidden="true" />}
                                            {opt.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>

                        <Field label="Target role" htmlFor="ob-role">
                            <Input
                                id="ob-role"
                                placeholder="Senior Frontend Developer"
                                value={formData.targetRole}
                                onChange={(e) => update({ targetRole: e.target.value })}
                            />
                        </Field>

                        <div className="flex gap-3">
                            <Button type="button" variant="secondary" onClick={prevStep} className="flex-1">
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                Back
                            </Button>
                            <Button type="button" onClick={nextStep} disabled={!formData.targetRole} className="flex-1">
                                Continue
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </Button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="animate-fade-up">
                        <h1 className="text-xl font-extrabold tracking-tight">Upload your resume</h1>
                        <p className="mt-2 mb-6 text-sm text-muted">
                            We parse it to write better emails. You can skip and add it later.
                        </p>

                        <input
                            id="ob-resume"
                            type="file"
                            accept=".pdf,.doc,.docx"
                            className="sr-only"
                            onChange={(e) => update({ resume: e.target.files[0] })}
                        />
                        <label
                            htmlFor="ob-resume"
                            className={cn(
                                'tap mb-6 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors',
                                formData.resume ? 'border-brand/40 bg-brand/6' : 'border-white/15 bg-white/2 hover:border-brand/40',
                            )}
                        >
                            <span className={cn('grid size-11 place-items-center rounded-xl', formData.resume ? 'bg-brand/12 text-brand' : 'bg-white/5 text-subtle')}>
                                {formData.resume ? <Check className="size-5" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
                            </span>
                            <span className="text-sm font-semibold">
                                {formData.resume ? formData.resume.name : 'Click to upload'}
                            </span>
                            <span className="text-xs text-subtle">PDF or Word, max 5 MB</span>
                        </label>

                        <div className="flex gap-3">
                            <Button type="button" variant="secondary" onClick={prevStep} className="flex-1">
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                Back
                            </Button>
                            <Button type="button" onClick={nextStep} className="flex-1">
                                {formData.resume ? 'Continue' : 'Skip for now'}
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </Button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="animate-fade-up text-center">
                        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-brand/12 text-brand ring-1 ring-brand/25">
                            <Sparkles className="size-7" aria-hidden="true" />
                        </span>
                        <h1 className="text-xl font-extrabold tracking-tight">You&apos;re all set</h1>
                        <p className="mx-auto mt-2 mb-8 max-w-sm text-sm text-muted">
                            Sign in and we&apos;ll carry {formData.name ? formData.name.split(' ')[0] : 'your'} details over
                            to your profile.
                        </p>
                        <Button type="button" size="lg" block onClick={() => onFinish(formData)}>
                            Create my account
                            <ArrowRight className="size-4" aria-hidden="true" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
