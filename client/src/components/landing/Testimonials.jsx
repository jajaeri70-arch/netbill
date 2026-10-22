import { Quote } from 'lucide-react';
import { TESTIMONIALS } from '../../data/landing.js';

/** Section testimoni pengguna — porting testimonials.tsx (Avatar → inisial inline). */
export function Testimonials() {
  return (
    <section className="py-16 md:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-bold uppercase tracking-[.14em] text-primary">Testimoni</p>
          <h2 className="mt-2 text-3xl font-heading font-bold tracking-display md:text-4xl">
            Dipercaya pengelola jaringan di berbagai daerah
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <div key={item.name} className="card card-hover">
              <div className="p-6">
                <Quote className="h-7 w-7 text-primary/30" />
                <p className="mt-3 text-sm leading-relaxed text-foreground">“{item.quote}”</p>
                <div className="mt-5 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {item.name
                      .split(' ')
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-muted">{item.role}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
