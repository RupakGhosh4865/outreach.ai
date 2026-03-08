'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
    const router = useRouter();

    const plans = [
        {
            name: 'Free',
            price: '0',
            period: '',
            campaigns: '3 campaigns',
            features: '5 emails/campaign, basic templates',
            btnText: 'Current Plan',
            btnClass: 'btn-secondary',
        },
        // Monthly subscription plans — commented out temporarily
        // {
        //     name: 'Starter',
        //     price: '499',
        //     period: '/month',
        //     campaigns: '20 campaigns',
        //     features: '10 emails/campaign, all outreach types',
        //     btnText: 'Upgrade to Starter',
        //     btnClass: 'btn-primary',
        //     popular: true
        // },
        // {
        //     name: 'Pro',
        //     price: '999',
        //     period: '/month',
        //     campaigns: 'Unlimited',
        //     features: '15 emails/campaign, priority AI, analytics',
        //     btnText: 'Upgrade to Pro',
        //     btnClass: 'btn-primary',
        // },
        // {
        //     name: 'Team',
        //     price: '2,999',
        //     period: '/month',
        //     campaigns: 'Unlimited (5 seats)',
        //     features: 'Everything + team dashboard + API access',
        //     btnText: 'Contact Sales',
        //     btnClass: 'btn-primary',
        // }
    ];

    const [toast, setToast] = useState(null);

    const handleSelectPlan = (plan) => {
        if (plan.name === 'Free') {
            showToast('You are already on the Free plan!');
            return;
        }
        if (plan.name === 'Team') {
            showToast('Contacting sales... redirected soon.');
            return;
        }
        showToast(`Redirecting to ${plan.name} check out...`);
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    return (
        <main className="page">
            {toast && (
                <div className="toast-container">
                    <div className="toast toast-info">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        {toast}
                    </div>
                </div>
            )}
            <div className="container">
                <div className="page-header" style={{ textAlign: 'center', marginBottom: '60px' }}>
                    <h1>Freemium SaaS Pricing</h1>
                    <p>Scale your outreach with our tiered subscription plans.</p>
                </div>

                <div className="pricing-table-container">
                    <table className="pricing-table">
                        <thead>
                            <tr>
                                <th className="th-plan">Plan</th>
                                <th className="th-price">Price</th>
                                <th className="th-campaigns">Campaigns/Month</th>
                                <th className="th-features">Features</th>
                                <th className="th-action"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.map((plan, i) => (
                                <tr key={i} className={plan.popular ? 'row-popular' : ''}>
                                    <td className="td-plan">
                                        <div className="plan-name-wrapper">
                                            {plan.name}
                                            {plan.popular && <span className="popular-tag">Popular</span>}
                                        </div>
                                    </td>
                                    <td className="td-price">
                                        <div className="price-display">
                                            <span className="currency">₹</span>
                                            <span className="amount">{plan.price}</span>
                                            <span className="period">{plan.period}</span>
                                        </div>
                                    </td>
                                    <td className="td-campaigns">{plan.campaigns}</td>
                                    <td className="td-features">{plan.features}</td>
                                    <td className="td-action">
                                        <button
                                            className={`btn ${plan.btnClass}`}
                                            onClick={() => handleSelectPlan(plan)}
                                        >
                                            {plan.btnText}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ marginTop: 60, textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '600px', margin: '0 auto' }}>
                        All plans include our core LinkedIn extraction and AI personalization engine.
                        Taxes may apply based on your region.
                    </p>
                </div>
            </div>
        </main>
    );
}
