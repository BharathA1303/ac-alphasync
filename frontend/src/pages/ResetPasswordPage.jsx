import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { Lock, ArrowRight, RefreshCw, CheckCircle2, ShieldAlert, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import usePageMeta from "../hooks/usePageMeta";

const ACCENT = "#00B67A";
const ACCENT_DK = "#009B68";

function PwdField({ id, label, value, onChange, placeholder, autoFocus, show, onToggleShow }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-slate-300 mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="new-password"
          className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-[var(--rp-accent)] focus:bg-white/[0.06]"
          style={{ "--rp-accent": ACCENT }}
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center p-4 bg-[#060D1A] relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-32 left-1/3 h-80 w-80 rounded-full blur-3xl opacity-30"
        style={{ background: `radial-gradient(circle, ${ACCENT}33, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute bottom-[-100px] right-[-80px] h-96 w-96 rounded-full blur-3xl opacity-20"
        style={{ background: `radial-gradient(circle, ${ACCENT}33, transparent 70%)` }}
      />
      <div className="max-w-md w-full relative z-10">{children}</div>
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="bg-[#0B1524] border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
      {children}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="mb-6">
      <div className="text-xl font-extrabold text-slate-50 tracking-tight">AlphaSync</div>
      <div
        className="w-11 h-[3px] mx-auto rounded-full mt-2"
        style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DK})` }}
      />
    </div>
  );
}

export default function ResetPasswordPage() {
  usePageMeta("Set New Password — AlphaSync", "Choose a new password for your AlphaSync account.");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const confirmPasswordReset = useAuthStore((s) => s.confirmPasswordReset);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error("Reset link is missing its token.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Reset link is invalid or expired.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <Shell>
        <Card>
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <BrandMark />
          <h1 className="text-2xl font-bold text-slate-50 mb-2">Invalid reset link</h1>
          <p className="text-sm text-slate-400 mb-7 leading-relaxed">
            This link is missing its reset token. Please request a new password reset email from the sign-in page.
          </p>
          <Link
            to="/login"
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-[#04140D] transition-all duration-200 hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})` }}
          >
            Back to Sign In <ArrowRight className="w-4 h-4" />
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <div
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{ background: `${ACCENT}1A` }}
        >
          {done ? (
            <CheckCircle2 className="w-8 h-8" style={{ color: ACCENT }} />
          ) : (
            <Lock className="w-8 h-8" style={{ color: ACCENT }} />
          )}
        </div>

        <BrandMark />

        {done ? (
          <>
            <h1 className="text-2xl font-bold text-slate-50 mb-2">Password updated</h1>
            <p className="text-sm text-slate-400 mb-7 leading-relaxed">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-[#04140D] transition-all duration-200 flex items-center justify-center gap-2 hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})` }}
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-50 mb-2">Set a new password</h1>
            <p className="text-sm text-slate-400 mb-7 leading-relaxed">
              Choose a strong password you haven't used before.
            </p>

            <form onSubmit={handleSubmit} className="text-left mb-2 space-y-4">
              <PwdField
                id="new-password"
                label="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoFocus
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
              />

              <PwdField
                id="confirm-password"
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                show={showConfirm}
                onToggleShow={() => setShowConfirm((v) => !v)}
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-[#04140D] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})` }}
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {submitting ? "Updating..." : "Update Password"}
              </button>
            </form>
          </>
        )}

        <div className="flex items-center justify-center gap-4 text-sm mt-5">
          <Link
            to="/login"
            className="font-medium transition-colors hover:brightness-125"
            style={{ color: ACCENT }}
          >
            Back to Sign In
          </Link>
        </div>
      </Card>
    </Shell>
  );
}
