import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { Mail, ArrowRight, RefreshCw, KeyRound, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import usePageMeta from "../hooks/usePageMeta";

export default function ForgotPasswordPage() {
  usePageMeta("Reset Password — AlphaSync", "Reset the password for your AlphaSync account.");

  const navigate = useNavigate();
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [identifier, setIdentifier] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Enter your email or username");
      return;
    }
    setSending(true);
    try {
      await resetPassword(identifier);
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not send reset email. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center mb-6">
            <KeyRound className="w-8 h-8 text-primary-600" />
          </div>

          {sent ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your inbox</h1>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                If an account matches <strong className="text-slate-800">{identifier}</strong>,
                we've sent a password reset link. It's valid for 30 minutes.
              </p>

              <div className="text-left bg-slate-50 rounded-xl p-4 mb-6 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600">Open your email inbox (check spam too)</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600">Click the reset link from AlphaSync</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600">Choose a new password and sign in</p>
                </div>
              </div>

              <button
                onClick={() => setSent(false)}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-all duration-200 mb-4"
              >
                Use a different email or username
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Forgot your password?</h1>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Enter your email or username and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="text-left mb-4">
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Email or Username
                </label>
                <div className="relative mb-4">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com or username"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full py-3 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {sending ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            </>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="flex items-center justify-center gap-4 text-sm">
            <Link to="/login" className="text-primary-600 hover:underline font-medium flex items-center gap-1">
              Back to Sign In <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Signed in with Google? Reset your password from your Google account instead.
        </p>
      </div>
    </div>
  );
}
