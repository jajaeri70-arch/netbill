/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ===== Token desain NetBill (PRD 4.2) — diambil dari CSS custom properties =====
        // Nilai light/dark dikelola di src/index.css (:root dan html.dark).
        background: 'hsl(var(--nb-background) / <alpha-value>)',
        card: 'hsl(var(--nb-card) / <alpha-value>)',
        sidebar: 'hsl(var(--nb-sidebar) / <alpha-value>)',
        border: 'hsl(var(--nb-border) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--nb-primary) / <alpha-value>)',
          foreground: 'hsl(var(--nb-primary-foreground) / <alpha-value>)',
        },
        secondary: 'hsl(var(--nb-secondary) / <alpha-value>)',
        success: 'hsl(var(--nb-success) / <alpha-value>)',
        warning: 'hsl(var(--nb-warning) / <alpha-value>)',
        danger: 'hsl(var(--nb-danger) / <alpha-value>)',
        info: 'hsl(var(--nb-info) / <alpha-value>)',
        foreground: 'hsl(var(--nb-foreground) / <alpha-value>)',
        muted: 'hsl(var(--nb-muted) / <alpha-value>)',

        // ===== Palet legacy → dipetakan ke token baru =====
        // Menjaga kompatibilitas seluruh halaman lama tanpa mengubah markup,
        // sekaligus memaksa semua warna mengikuti skema desain tunggal.
        navy: {
          950: 'hsl(var(--nb-navy-950) / <alpha-value>)',
          900: 'hsl(var(--nb-navy-900) / <alpha-value>)',
          850: 'hsl(var(--nb-navy-850) / <alpha-value>)',
          800: 'hsl(var(--nb-navy-800) / <alpha-value>)',
          700: 'hsl(var(--nb-navy-700) / <alpha-value>)',
          600: 'hsl(var(--nb-navy-600) / <alpha-value>)',
        },
        accent: {
          orange: 'hsl(var(--nb-warning) / <alpha-value>)',
          green: 'hsl(var(--nb-success) / <alpha-value>)',
          blue: 'hsl(var(--nb-primary) / <alpha-value>)',
          purple: 'hsl(var(--nb-violet) / <alpha-value>)',
          red: 'hsl(var(--nb-danger) / <alpha-value>)',
          yellow: 'hsl(var(--nb-warning) / <alpha-value>)',
        },
        // Skala netral hue-240 (kalem, tanpa tint biru kuat) sesuai spesifikasi
        slate: {
          50: 'rgb(var(--nb-slate-50) / <alpha-value>)',
          100: 'rgb(var(--nb-slate-100) / <alpha-value>)',
          200: 'rgb(var(--nb-slate-200) / <alpha-value>)',
          300: 'rgb(var(--nb-slate-300) / <alpha-value>)',
          400: 'rgb(var(--nb-slate-400) / <alpha-value>)',
          500: 'rgb(var(--nb-slate-500) / <alpha-value>)',
          600: 'rgb(var(--nb-slate-600) / <alpha-value>)',
          700: 'rgb(var(--nb-slate-700) / <alpha-value>)',
          800: 'rgb(var(--nb-slate-800) / <alpha-value>)',
          900: 'rgb(var(--nb-slate-900) / <alpha-value>)',
          950: 'rgb(var(--nb-slate-950) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Inter Variable', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        display: '-0.03em',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(15, 23, 42, .06), 0 1px 2px rgba(15, 23, 42, .04)',
        card: '0 1px 2px rgba(15, 23, 42, .04), 0 1px 3px rgba(15, 23, 42, .05)',
        lift: '0 10px 24px -6px rgba(15, 23, 42, .14), 0 4px 10px -4px rgba(15, 23, 42, .06)',
      },
      keyframes: {
        // Animasi masuk hero/section halaman publik (selaras web/tailwind.config.ts)
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(.21,1.02,.73,1) both',
      },
    },
  },
  plugins: [],
};

