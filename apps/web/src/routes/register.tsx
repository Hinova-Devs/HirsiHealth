import { createRoute, useNavigate, Link } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { useState, useCallback } from 'react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import {
  User,
  Mail,
  Lock,
  ArrowRight,
  ShieldAlert,
  HeartHandshake,
  Eye,
  EyeOff,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { registerPatient } from '../lib/auth';
import { PASSWORD_RULES, breachCount, unmetRules } from '../lib/password';

function RegisterPage() {
  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingBreach, setCheckingBreach] = useState(false);

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
        setError('Please fill in all fields.');
        return;
      }

      const unmet = unmetRules(password);
      if (unmet.length > 0) {
        setError(`Your password still needs: ${unmet.map((r) => r.label.toLowerCase()).join(', ')}.`);
        return;
      }

      // A password that already sits in a breach corpus is public, however
      // complex it looks. Checked before anything is sent to the server.
      setCheckingBreach(true);
      let breaches = 0;
      try {
        breaches = await breachCount(password);
      } finally {
        setCheckingBreach(false);
      }
      if (breaches > 0) {
        setError(
          `This password has appeared in ${breaches.toLocaleString()} known data breaches and is on public cracking lists. Please choose a different one.`
        );
        return;
      }

      if (!executeRecaptcha) {
        setError('reCAPTCHA is not ready yet. Please wait a moment and try again.');
        return;
      }

      setLoading(true);

      try {
        // Get an invisible reCAPTCHA v3 token — no user interaction required
        const recaptchaToken = await executeRecaptcha('register');
        await registerPatient(firstName.trim(), lastName.trim(), email.trim(), password, recaptchaToken);
        navigate({ to: '/dashboard' });
      } catch (err: any) {
        console.error('Registration error:', err);
        setError(
          err.message ||
            'Registration failed. The email may already be in use, or the server is unreachable.'
        );
      } finally {
        setLoading(false);
      }
    },
    [firstName, lastName, email, password, executeRecaptcha, navigate]
  );

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 px-6 overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[100px]"></div>

      {/* Main card */}
      <div className="relative z-10 w-full max-w-md glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col gap-6 my-8">
        {/* Header */}
        <div className="text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-teal-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <HeartHandshake className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-100">
              Create Your Wallet
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              Your secure, patient-controlled FHIR health record
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Missing ReCaptcha Key Warning */}
        {!import.meta.env.VITE_RECAPTCHA_SITE_KEY && (
          <div className="flex gap-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">reCAPTCHA Key Missing</p>
              <p className="opacity-90">Please set `VITE_RECAPTCHA_SITE_KEY` in your `.env` file to enable registration.</p>
            </div>
          </div>
        )}

        {/* Breached-password notice */}
        <div className="flex gap-2.5 p-4 rounded-xl bg-teal-500/5 border border-teal-500/20 text-teal-300/90 text-xs">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-teal-400" />
          <div className="leading-relaxed">
            <p className="font-semibold text-teal-300 mb-0.5">Breached passwords are blocked</p>
            <p className="opacity-90">
              Your password is checked against billions of credentials leaked in known data
              breaches and traded on the dark web. If it appears in one, it cannot be used here —
              attackers try those lists first. The check is anonymous: only a partial hash leaves
              your device, never your password.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400" htmlFor="first-name-input">
                First Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  id="first-name-input"
                  type="text"
                  placeholder="Hodan"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 pl-9 pr-3 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400" htmlFor="last-name-input">
                Last Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  id="last-name-input"
                  type="text"
                  placeholder="Abdi"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 pl-9 pr-3 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400" htmlFor="register-email-input">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                id="register-email-input"
                type="email"
                placeholder="you@hersihealth.so"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400" htmlFor="register-password-input">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                id="register-password-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 12 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 pl-10 pr-10 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600"
              />
              <button
                type="button"
                id="btn_toggle_password_visibility"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Requirements — tick off as they are met */}
            <ul className="flex flex-col gap-1 mt-1.5">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.ok(password);
                return (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-2 text-[11px] transition-colors ${
                      met ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full grid place-items-center shrink-0 border ${
                        met ? 'bg-emerald-500/15 border-emerald-500/40' : 'border-slate-700'
                      }`}
                    >
                      {met && <Check className="w-2.5 h-2.5" />}
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Privacy notice */}
          <p className="text-xs text-slate-500 leading-relaxed">
            By creating an account you agree that your health data is stored securely on Medplum's FHIR-compliant infrastructure. Protected by Google reCAPTCHA.
          </p>

          {/* Submit */}
          <button
            type="submit"
            id="btn_submit_register"
            disabled={loading || checkingBreach || !executeRecaptcha}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-400 hover:to-teal-400 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all active:scale-95 shadow-md shadow-indigo-500/10 cursor-pointer"
          >
            {loading || checkingBreach ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                {checkingBreach && <span>Checking password against breach data…</span>}
              </>
            ) : (
              <>
                <span>Create Health Wallet</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 font-medium">
          Already have an account?{' '}
          <Link
            to="/login"
            id="link_go_to_login"
            className="text-teal-400 hover:text-teal-300 font-semibold transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
});

export { registerRoute };
