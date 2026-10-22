import { Hero } from '../components/landing/Hero.jsx';
import { Features } from '../components/landing/Features.jsx';
import { Pricing } from '../components/landing/Pricing.jsx';
import { Testimonials } from '../components/landing/Testimonials.jsx';
import { CtaSection } from '../components/landing/CtaSection.jsx';
import { usePageTitle } from '../components/public/PublicLayout.jsx';

/** Beranda publik (landing page) — porting web/src/app/(public)/page.tsx. */
export default function Landing() {
  usePageTitle('NetBill — Billing & Manajemen RT/RW Net');

  return (
    <>
      <Hero />
      <Features />
      <Pricing />
      <Testimonials />
      <CtaSection />
    </>
  );
}
