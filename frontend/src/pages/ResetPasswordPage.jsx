import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { Lock, ArrowRight, RefreshCw, CheckCircle2, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import usePageMeta from "../hooks/usePageMeta";

export default function ResetPasswordPage() {
  usePageMeta("Set New Password — AlphaSync", "Choose a new password for your AlphaSync account.");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const confirmPasswordReset = useAuthStore((s) => s.confirmPasswordReset);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid reset link</h1>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              This link is missing its reset token. Please request a new password reset email.
            </p>
            <Link
              to="/forgot-password"
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm transition-all duration-200"
            >
              Request New Link <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-primary-600" />
          </div>

          {done ? (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Password updated</h1>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-3 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2"
              >
                Sign In <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Set a new password</h1>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Choose a strong password you haven't used before.
              </p>

              <form onSubmit={handleSubmit} className="text-left mb-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {submitting ? "Updating..." : "Update Password"}
                </button>
              </form>
            </>
          )}

          <div className="flex items-center justify-center gap-4 text-sm mt-2">
            <Link to="/login" className="text-primary-600 hover:underline font-medium flex items-center gap-1">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
