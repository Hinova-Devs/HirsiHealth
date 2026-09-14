import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { useMedplumContext, useMedplumProfile } from '@medplum/react';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileHeart,
  FileLock,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The install prompt Chrome/Edge fire on installable pages. Captured and held
 * so the page can offer the install on its own button instead of the
 * browser's mini-infobar. iOS has no such event — Safari installs only through
 * Share → Add to Home Screen, so that path gets instructions instead.
 */
function useInstall() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true)
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the browser's own banner out of the way
      setPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null); // a captured prompt can only be used once
    return outcome === 'accepted';
  }, [prompt]);

  const isIOS =
    typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return { canInstall: !!prompt, installed, install, isIOS };
}

/**
 * Tilts a 3D scene toward the pointer by writing CSS custom properties —
 * no React state per move, so no re-render while the pointer travels.
 * Pointer-driven only: touch devices leave the scene at its resting angle.
 */
function useTilt(max = 9) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    ref.current.style.setProperty('--ry', `${x * max * 2}deg`);
    ref.current.style.setProperty('--rx', `${-y * max * 2}deg`);
  };

  const onPointerLeave = () => {
    ref.current?.style.setProperty('--ry', '0deg');
    ref.current?.style.setProperty('--rx', '0deg');
  };

  return { ref, onPointerMove, onPointerLeave };
}

function IndexPage() {
  const { loading } = useMedplumContext();
  const currentProfile = useMedplumProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && currentProfile) navigate({ to: '/dashboard' });
  }, [loading, currentProfile, navigate]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 font-sans">
      {/* Ambient light. Hidden on phones — a full-screen blur costs more than
          it adds on a small display. */}
      <div className="hidden sm:block absolute top-[-25%] left-[-15%] w-[680px] h-[680px] bg-teal-500/10 rounded-full blur-[130px] animate-pulse-slow pointer-events-none"></div>
      <div className="hidden sm:block absolute top-[30%] right-[-20%] w-[620px] h-[620px] bg-indigo-500/10 rounded-full blur-[130px] pointer-events-none"></div>

      {/* Grid floor */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:3rem_3rem] sm:bg-[size:4.5rem_4.5rem] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_60%,transparent_100%)] pointer-events-none"></div>

      <Header />
      <Hero />
      <Features />
      <GetTheApp />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-20 max-w-7xl mx-auto px-5 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-3">
      <Link to="/" className="flex items-center gap-2.5 shrink-0">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-400 to-indigo-500 grid place-items-center shadow-lg shadow-teal-500/20">
          <Activity className="w-5 h-5 text-white" />
        </span>
        <span className="font-display font-bold text-lg tracking-tight">HersiHealth</span>
      </Link>

      <nav className="flex items-center gap-1.5 sm:gap-4">
        <a
          href="#get-the-app"
          id="link_header_app"
          className="hidden sm:inline text-sm font-semibold text-slate-400 hover:text-teal-400 transition-colors"
        >
          Get the app
        </a>
        <Link
          to="/login"
          id="link_header_login"
          className="px-3 sm:px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-teal-400 transition-colors"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          id="link_header_register"
          className="px-4 py-2.5 rounded-xl text-sm font-bold bg-teal-500 text-slate-950 hover:bg-teal-400 active:scale-95 transition-all shadow-md shadow-teal-500/20"
        >
          Get started
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  const { canInstall, installed, install, isIOS } = useInstall();

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 pt-10 sm:pt-16 pb-16 sm:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
      {/* Copy */}
      <div className="text-center lg:text-left">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[11px] sm:text-xs font-semibold tracking-wide">
          <Sparkles className="w-3.5 h-3.5" />
          AI reads every document you upload
        </span>

        <h1 className="mt-5 font-display text-[2.1rem] leading-[1.08] sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-balance">
          Your health records,
          <br />
          <span className="bg-gradient-to-r from-teal-300 via-emerald-300 to-indigo-400 bg-clip-text text-transparent">
            in your pocket.
          </span>
        </h1>

        <p className="mt-5 text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
          Photograph a prescription, a lab report or a vaccination card. HersiHealth reads it,
          files it, and keeps the original encrypted — ready to share with any clinic, in
          seconds.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
          <Link
            to="/register"
            id="btn_hero_get_started"
            className="flex items-center justify-center gap-2 px-7 py-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 hover:from-teal-400 hover:to-emerald-400 rounded-2xl text-base font-extrabold shadow-lg shadow-teal-500/20 transition-all active:scale-95"
          >
            Create your wallet
            <ChevronRight className="w-5 h-5" />
          </Link>

          <a
            href="#get-the-app"
            onClick={canInstall ? (e) => { e.preventDefault(); install(); } : undefined}
            id="btn_hero_install"
            className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl border border-slate-700 bg-slate-900/60 hover:border-teal-500/50 hover:bg-slate-900 text-base font-bold text-slate-200 transition-all active:scale-95"
          >
            <Download className="w-5 h-5 text-teal-400" />
            {installed ? 'App installed' : isIOS ? 'Add to Home Screen' : 'Install the app'}
          </a>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-xs text-slate-500">
          {['Works offline-first on your phone', 'FHIR R4 standard', 'You control every share'].map(
            (item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-400" />
                {item}
              </li>
            )
          )}
        </ul>
      </div>

      <PhoneScene />
    </section>
  );
}

/**
 * The 3D hero: a phone in perspective with record cards floating off its
 * surface. Pure CSS transforms — no 3D library, nothing to download.
 */
function PhoneScene() {
  const tilt = useTilt();

  return (
    <div
      className="relative mx-auto w-full max-w-[340px] sm:max-w-[380px] [perspective:1400px]"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
    >
      {/* Glow pad under the device */}
      <div className="absolute inset-x-6 bottom-2 h-24 bg-teal-500/20 blur-[60px] rounded-full pointer-events-none"></div>

      <div ref={tilt.ref} className="relative preserve-3d tilt-3d">
        {/* Phone body */}
        <div className="relative preserve-3d rounded-[2.5rem] border border-slate-700/80 bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)]">
          <div className="rounded-[2rem] bg-slate-950 border border-slate-800 overflow-hidden">
            {/* Status bar */}
            <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[10px] font-semibold text-slate-500">
              <span>9:41</span>
              <span className="w-16 h-4 bg-slate-900 rounded-full"></span>
              <span>100%</span>
            </div>

            {/* App screen */}
            <div className="px-4 pb-5 pt-2 flex flex-col gap-3">
              <div>
                <p className="text-[10px] text-slate-500 font-semibold">Good morning</p>
                <p className="font-display font-bold text-slate-100">Hodan Abdi</p>
              </div>

              <div className="rounded-2xl border border-teal-500/25 bg-teal-500/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-teal-500/15 grid place-items-center text-[9px] font-mono font-bold text-teal-400">
                    AI
                  </span>
                  <p className="text-[11px] font-bold text-slate-200">Blood panel read</p>
                </div>
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {[
                    ['Haemoglobin', '13.4 g/dL', false],
                    ['Fasting glucose', '6.4 mmol/L', true],
                    ['Platelets', '244 ×10⁹/L', false],
                  ].map(([k, v, flag]) => (
                    <div key={k as string} className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] text-slate-500 truncate">{k}</span>
                      <span
                        className={`text-[10px] font-semibold ${
                          flag ? 'text-amber-400' : 'text-slate-300'
                        }`}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Documents', '12', 'from-indigo-500/15 border-indigo-500/25 text-indigo-300'],
                  ['Shared', '3', 'from-emerald-500/15 border-emerald-500/25 text-emerald-300'],
                ].map(([label, n, style]) => (
                  <div
                    key={label as string}
                    className={`rounded-xl border bg-gradient-to-b to-transparent p-2.5 ${style}`}
                  >
                    <p className="font-display text-lg font-extrabold leading-none">{n}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 flex items-center gap-2">
                <FileHeart className="w-4 h-4 text-teal-400 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold text-slate-300 truncate">
                    Amoxicillin 500 mg
                  </span>
                  <span className="block text-[9px] text-slate-500">3× daily · 7 days</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cards floating off the screen. Hidden on the narrowest phones,
            where they would crowd the device. */}
        <div
          className="hidden sm:flex absolute -left-6 sm:-left-12 top-16 items-center gap-2 px-3 py-2.5 rounded-2xl glass-panel border border-teal-500/25 shadow-xl float-slow"
          style={{ transform: 'translateZ(70px)' }}
        >
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <span className="text-[11px] font-bold text-slate-200 whitespace-nowrap">
            Encrypted original
          </span>
        </div>

        <div
          className="absolute -right-4 sm:-right-10 top-44 flex items-center gap-2 px-3 py-2.5 rounded-2xl glass-panel border border-indigo-500/25 shadow-xl float-slower"
          style={{ transform: 'translateZ(90px)' }}
        >
          <Share2 className="w-4 h-4 text-indigo-300" />
          <span className="text-[11px] font-bold text-slate-200 whitespace-nowrap">
            Link expires in 7 days
          </span>
        </div>

        <div
          className="absolute left-2 sm:-left-8 -bottom-5 flex items-center gap-2 px-3 py-2.5 rounded-2xl glass-panel border border-emerald-500/25 shadow-xl float-slow"
          style={{ transform: 'translateZ(50px)' }}
        >
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-bold text-slate-200 whitespace-nowrap">
            Vaccination card filed
          </span>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: FileHeart,
    title: 'Snap it, and it files itself',
    body: 'Photograph any document. The AI reads the values, names the clinic, dates it, and drops it in the right folder — no typing.',
    tone: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  },
  {
    icon: FileLock,
    title: 'The original stays encrypted',
    body: 'Every scan is stored in an encrypted FHIR binary store. Only you hold the keys to your wallet, and only you decide who sees it.',
    tone: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Share2,
    title: 'Share for exactly as long as you want',
    body: 'Give a doctor a link to one document, not your whole history. Set when it expires, or revoke it the moment you walk out.',
    tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
];

function Features() {
  return (
    <section className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 py-14 sm:py-20 border-t border-slate-900">
      <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-center tracking-tight">
        Everything a paper folder can't do
      </h2>
      <p className="mt-3 text-center text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
        Built on HL7 FHIR R4, so your records stay readable by any modern hospital system.
      </p>

      <div className="mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {FEATURES.map(({ icon: Icon, title, body, tone }) => (
          <FeatureCard key={title} icon={Icon} title={title} body={body} tone={tone} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: typeof FileHeart;
  title: string;
  body: string;
  tone: string;
}) {
  const tilt = useTilt(5);

  return (
    <div
      className="[perspective:900px]"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
    >
      <div
        ref={tilt.ref}
        className="h-full preserve-3d tilt-3d glass-panel p-6 sm:p-7 rounded-3xl hover:border-slate-700"
      >
        <span
          className={`w-12 h-12 rounded-2xl border grid place-items-center mb-5 ${tone}`}
          style={{ transform: 'translateZ(28px)' }}
        >
          <Icon className="w-6 h-6" />
        </span>
        <h3 className="font-display text-lg sm:text-xl font-bold mb-2.5 text-slate-100 text-balance">
          {title}
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

/** Install section — the real prompt where the browser supports it. */
function GetTheApp() {
  const { canInstall, installed, install, isIOS } = useInstall();

  return (
    <section
      id="get-the-app"
      className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 py-14 sm:py-20 border-t border-slate-900 scroll-mt-6"
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-teal-500/20 bg-gradient-to-br from-teal-500/10 via-slate-900/60 to-indigo-500/10 p-7 sm:p-12">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-teal-500/20 blur-[90px] rounded-full pointer-events-none"></div>

        <div className="relative grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/60 border border-slate-700 text-teal-300 text-[11px] font-bold">
              <Smartphone className="w-3.5 h-3.5" />
              Install HersiHealth
            </span>

            <h2 className="mt-5 font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-balance">
              Put your health wallet on your home screen
            </h2>

            <p className="mt-4 text-slate-300/90 text-sm sm:text-base leading-relaxed max-w-lg mx-auto lg:mx-0">
              Install the app and HersiHealth opens full screen, straight from your home screen —
              no app store, no waiting for a download. Your camera becomes the scanner, and every
              record you already saved is there.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
              <button
                onClick={() => install()}
                disabled={!canInstall || installed}
                id="btn_install_app"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white text-slate-950 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-base font-extrabold transition-all active:scale-95 shadow-lg shadow-black/30"
              >
                <Download className="w-5 h-5" />
                {installed ? 'Already installed' : 'Install now'}
              </button>

              <Link
                to="/register"
                id="btn_app_register"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl border border-slate-600 text-slate-200 hover:border-teal-500/50 hover:bg-slate-900/60 text-base font-bold transition-all active:scale-95"
              >
                Create an account first
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* What to do when the browser gives no prompt — iOS always, and
                any browser that has already installed or doesn't support it. */}
            {!canInstall && !installed && (
              <p className="mt-4 text-xs text-slate-400 leading-relaxed max-w-md mx-auto lg:mx-0">
                {isIOS ? (
                  <>
                    On iPhone: tap <span className="font-bold text-slate-200">Share</span> in
                    Safari, then <span className="font-bold text-slate-200">Add to Home Screen</span>.
                  </>
                ) : (
                  <>
                    Your browser hasn't offered the install yet. On Android open this page in
                    Chrome and pick <span className="font-bold text-slate-200">Install app</span>{' '}
                    from the menu; on iPhone use{' '}
                    <span className="font-bold text-slate-200">Share → Add to Home Screen</span>.
                  </>
                )}
              </p>
            )}
          </div>

          {/* Steps */}
          <ol className="flex flex-col gap-3">
            {[
              ['Install', 'One tap. It lands on your home screen like any other app.'],
              ['Photograph', 'Point your camera at a prescription or lab sheet.'],
              ['Done', 'The reading appears in your wallet, ready to share.'],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="flex gap-3.5 items-start p-4 rounded-2xl bg-slate-950/50 border border-slate-800"
              >
                <span className="w-7 h-7 shrink-0 rounded-lg bg-teal-500/15 border border-teal-500/25 grid place-items-center text-xs font-mono font-bold text-teal-300">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-100">{title}</span>
                  <span className="block text-xs text-slate-400 mt-0.5 leading-relaxed">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-slate-900 px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center text-slate-500 text-xs font-medium">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-teal-400 to-indigo-500 grid place-items-center">
          <Activity className="w-3.5 h-3.5 text-white" />
        </span>
        <span className="font-display font-bold text-slate-300">HersiHealth</span>
      </div>
      <p className="mb-1">Final Year Graduation Project</p>
      <p className="text-slate-600">Faculty of Computing &amp; ICT, Borama University, Somaliland</p>
    </footer>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

export { indexRoute };
