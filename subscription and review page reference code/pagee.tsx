"use client";

import { useState } from "react";

/** Plan configuration — single source of truth */
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "/month",
    description: "Perfect for beginners exploring the market",
    cta: "Get Started",
    popular: false,
    features: [
      { text: "10 AI Assintant Message Usage", included: true },
      { text: "Basic market data", included: true },
      { text: "Portfolio tracking (1 portfolio)", included: true },
      { text: "Advanced analytics", included: false },
      { text: "Custom alerts", included: false },
    ],
  },
  {
    id: "lite",
    name: "Lite",
    price: 199,
    period: "/month",
    description: "For active traders who need more insights",
    cta: "Upgrade",
    popular: false,
    features: [
      { text: "20 AI assistant Message Usage per day", included: true },
      { text: "Real-time market data", included: true },
      { text: "Portfolio tracking (5 portfolios)", included: true },
      { text: "Email support", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Priority support", included: false },
      { text: "Custom alerts", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 499,
    period: "/month",
    description: "Maximum power for serious investors",
    cta: "Upgrade",
    popular: true,
    features: [
      { text: "50 AI assistant Message Usages per day", included: true },
      { text: "Real-time market data", included: true },
      { text: "Unlimited portfolio tracking", included: true },
      { text: "Priority 24/7 support", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Custom alerts & webhooks", included: true },
      { text: "API access", included: true },
    ],
  },
];

export default function PricingPage() {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  /** Subscribe to a plan (Static Mock) */
  const handleSubscribe = (planId: string) => {
    console.log(`Plan selected: ${planId}`);
    setToast(null);

    // Simulate success without a network request
    setToast({
      message: `Successfully selected the ${planId.toUpperCase()} plan!`,
      type: "success",
    });
  };

  return (
    <div className="relative py-16 sm:py-24">
      {/* Background accents */}
      <div className="absolute top-20 left-1/3 w-72 h-72 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-1/3 w-64 h-64 bg-accent/6 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            Simple, Transparent Pricing
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Choose Your{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Plan
            </span>
          </h1>
          <p className="text-lg text-muted max-w-xl mx-auto">
            Start free and scale as you grow. All plans include core features.
            Upgrade anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {PLANS.map((plan, index) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-px animate-fade-in-up ${
                plan.popular ? "popular-glow" : ""
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Most Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="px-4 py-1 rounded-full bg-gradient-to-r from-primary to-accent text-white text-xs font-bold uppercase tracking-wider shadow-lg">
                    Most Popular
                  </div>
                </div>
              )}

              <div
                className={`relative h-full rounded-2xl p-8 flex flex-col ${
                  plan.popular
                    ? "bg-card border-0"
                    : "glass-card hover:transform-none"
                }`}
              >
                {/* Plan Name */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-muted">₹</span>
                    <span className="text-5xl font-extrabold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-muted text-sm">{plan.period}</span>
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  id={`subscribe-${plan.id}`}
                  onClick={() => handleSubscribe(plan.id)}
                  className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-300 mb-8 cursor-pointer ${
                    plan.popular
                      ? "bg-gradient-to-r from-primary to-primary-hover text-white shadow-lg shadow-primary-glow hover:shadow-xl hover:shadow-primary-glow hover:-translate-y-0.5"
                      : "bg-card-hover border border-border text-foreground hover:bg-border hover:border-border-hover"
                  }`}
                >
                  {plan.cta}
                </button>

                {/* Features */}
                <div className="space-y-3 flex-1">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
                    What&apos;s included
                  </p>
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3">
                      {feature.included ? (
                        <svg
                          className="w-5 h-5 text-success flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5 text-muted/40 flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      )}
                      <span
                        className={`text-sm ${
                          feature.included ? "text-foreground" : "text-muted/50"
                        }`}
                      >
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ-like note */}
        <div className="text-center mt-16">
          <p className="text-sm text-muted">
            All plans include a 14-day free trial. No credit card required. Cancel
            anytime.
          </p>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 toast">
          <div
            className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-success/10 border border-success/20 text-success"
                : "bg-danger/10 border border-danger/20 text-danger"
            }`}
          >
            {toast.type === "success" ? "✅" : "❌"} {toast.message}
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-current opacity-60 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
