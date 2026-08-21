// LoginPage.jsx — Combined Login + Register (3-Step Registration Flow)
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore, peekInviteToken } from "../stores/useAuthStore";
import academicApi from "../services/academicApi";
import api from "../services/api";
import toast from "react-hot-toast";
import usePageMeta from "../hooks/usePageMeta";
import { hasUserSessionCookie } from "../utils/authSessionCookie";

/* ─── Password Requirements (CSS circles — no emoji) ────────────────────────── */
function PwdRequirements({ password }) {
  const rules = [
    { label: "At least 8 characters",            pass: password.length >= 8 },
    { label: "One uppercase letter (A–Z)",        pass: /[A-Z]/.test(password) },
    { label: "One number (0–9)",                  pass: /[0-9]/.test(password) },
    { label: "One special character (!@#$%^&*)", pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const allPass = rules.every(r => r.pass);
  return (
    <div className={`pwd-rules-box${allPass ? " all-pass" : ""}`}>
      <span className="pwd-rules-title">Password must contain:</span>
      <ul>
        {rules.map((r) => (
          <li key={r.label} className={r.pass ? "pass" : ""}>
            <span className={`pwd-dot${r.pass ? " pass" : ""}`}>
              {r.pass && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <polyline points="1.5,4 3,5.5 6.5,2"
                    stroke="#fff" strokeWidth="1.4"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Step Progress Indicator ───────────────────────────────────────────────── */
function StepIndicator({ currentStep }) {
  const steps = [
    { n: 1, label: "Account Details" },
    { n: 2, label: "Verify Account" },
    { n: 3, label: "Complete" },
  ];
  return (
    <div className="step-indicator">
      {steps.map((s, idx) => {
        const done   = currentStep > s.n;
        const active = currentStep === s.n;
        return (
          <div key={s.n} className="step-item">
            <div className={"step-circle" + (done ? " done" : active ? " active" : "")}>
              {done ? (
                <svg viewBox="0 0 12 12" fill="none" width="12" height="12">
                  <polyline points="2,6 4.5,8.5 10,3.5"
                    stroke="#fff" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : s.n}
            </div>
            <span className={"step-label" + (active ? " active" : done ? " done" : "")}>
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <div className={"step-line" + (currentStep > s.n ? " done" : "")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
export default function LoginPage() {
  usePageMeta(
    "AlphaSync Campus — Login | Start Your Learning Journey",
    "Join AlphaSync Campus. Learn, backtest and practice trading with ₹10L virtual capital. SEBI-aligned. Zero risk."
  );

  /* --- Tab state (login | register) — default: login --- */
  const [tab, setTab] = useState("login");

  /* --- Login state --- */
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPass,     setLoginPass]     = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [rememberMe,    setRememberMe]    = useState(false);

  /* --- Register multi-step state --- */
  const [regStep,         setRegStep]        = useState(1);
  const [regFullName,     setRegFullName]     = useState("");
  const [regEmail,        setRegEmail]        = useState("");
  const [regUsername,     setRegUsername]     = useState("");
  const [regPass,         setRegPass]         = useState("");
  const [regConfirmPass,  setRegConfirmPass]  = useState("");
  const [showRegPass,     setShowRegPass]     = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [regAgree,        setRegAgree]        = useState(false);
  const [regLoading,      setRegLoading]      = useState(false);
  const [refreshLoading,  setRefreshLoading]  = useState(false);
  const [registeredUser,  setRegisteredUser]  = useState(null);
  const [inviteInfo,      setInviteInfo]      = useState(null); // { institution_name, target_role } | null

  /* --- Password match helpers --- */
  const passMatch    = regConfirmPass.length > 0 && regPass === regConfirmPass;
  const passMismatch = regConfirmPass.length > 0 && regPass !== regConfirmPass;

  const loginWithEmail    = useAuthStore((s) => s.loginWithEmail);
  const registerWithEmail = useAuthStore((s) => s.registerWithEmail);
  const existingUser      = useAuthStore((s) => s.user);
  const updateUser        = useAuthStore((s) => s.updateUser);
  const logout            = useAuthStore((s) => s.logout);
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const adminIntent       = (searchParams.get("intent") || "").toLowerCase() === "admin";

  /* ─── Route by account status ─────────────────────────────────────────────── */
  const routeByAccountStatus = (profile) => {
    const status   = (profile?.account_status || "active").toLowerCase();
    const isActive = status === "active" && profile?.is_active !== false;
    const role     = (profile?.role || "").toLowerCase();
    if (isActive) {
      // Academic roles always land on their own destination, even if the
      // user arrived via the "Sign In As Admin" (/admin) entry point out of
      // habit — never bounce them back to the Super Admin gate.
      if (role === "institution_admin") {
        navigate("/institution/portal");
        return;
      }
      if (role === "faculty" || role === "student") {
        localStorage.setItem("alphasync_trading_mode", "demo");
        localStorage.setItem("alphasync_onboarded", "1");
        navigate("/dashboard");
        return;
      }
      if (adminIntent) {
        if (role === "admin") {
          navigate("/admin/panel");
        } else {
          toast.error(
            `Signed in as ${profile?.username || profile?.email || "this account"}, but it is not an admin account.`
          );
          navigate("/admin");
        }
        return;
      }
      localStorage.setItem("alphasync_trading_mode", "demo");
      localStorage.setItem("alphasync_onboarded", "1");
      navigate("/dashboard");
    } else {
      // Show pending / inactive state INLINE — no redirect to /account-status
      setRegisteredUser(profile);
      setTab("register");
      setRegStep(2);
    }
  };

  /* ─── Auto-redirect if already logged in (skip if mid-registration) ──────── */
  useEffect(() => {
    if (!existingUser || adminIntent) return;
    if (!hasUserSessionCookie()) return;
    if (tab === "register" && regStep > 1) return;
    routeByAccountStatus(existingUser);
  }, [existingUser, adminIntent]);

  /* ─── Invite link banner (?invite=TOKEN) ────────────────────────────────── */
  useEffect(() => {
    const token = peekInviteToken();
    if (!token) return;
    setTab("register");
    academicApi.getInviteInfo(token)
      .then((res) => {
        if (res?.data?.valid) {
          setInviteInfo({
            institutionName: res.data.institution_name,
            targetRole: res.data.target_role,
          });
        }
      })
      .catch(() => {});
  }, []);

  const INVITE_ROLE_LABELS = {
    institution_admin: "Institution Admin",
    faculty: "Faculty",
    student: "Student",
  };

  /* ─── Login ──────────────────────────────────────────────────────────────── */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim()) return toast.error("Username is required");
    setLoginLoading(true);
    try {
      const result = await loginWithEmail(loginUsername.trim(), loginPass);
      const status = (result?.user?.account_status || "active").toLowerCase();
      if (status === "active" && result?.user?.is_active !== false) {
        toast.success("Welcome back!");
      } else {
        toast("Login successful. Your account is under review.");
      }
      routeByAccountStatus(result?.user);
    } catch (err) {
      const httpStatus = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || "Login failed";
      if (httpStatus === 401) {
        toast.error("Invalid username or password");
      } else if (httpStatus === 403) {
        toast.error("Account is inactive or pending review");
      } else if (httpStatus === 429) {
        toast.error("Too many attempts. Try again later.");
      } else {
        toast.error(detail);
      }
    } finally { setLoginLoading(false); }
  };

  /* ─── Register ───────────────────────────────────────────────────────────── */
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regFullName.trim())             return toast.error("Full name is required");
    if (!regEmail.trim())                return toast.error("Email address is required");
    if (!regUsername.trim())             return toast.error("Username is required");
    if (regPass.length < 8)              return toast.error("Password must be at least 8 characters");
    if (!/[A-Z]/.test(regPass))          return toast.error("Password must contain an uppercase letter");
    if (!/[0-9]/.test(regPass))          return toast.error("Password must contain a number");
    if (!/[^A-Za-z0-9]/.test(regPass))  return toast.error("Password must contain a special character");
    if (!passMatch)                      return toast.error("Passwords do not match");
    if (!regAgree)                       return toast.error("Please agree to the Terms of Service and Privacy Policy");

    setRegLoading(true);
    try {
      const result = await registerWithEmail(
        regEmail.trim(), regPass, regFullName.trim(), regUsername.trim()
      );
      const status = (result?.user?.account_status || "pending_approval").toLowerCase();
      const isActive = status === "active" && result?.user?.is_active !== false;
      if (inviteInfo) {
        toast.success(`Account created! Welcome to ${inviteInfo.institutionName}.`);
      } else {
        toast.success("Account created! Awaiting admin verification.");
      }
      setRegisteredUser(result?.user);
      if (isActive) {
        setRegStep(3); // First-ever user (admin) or invite-based signup — skip straight to complete
      } else {
        setRegStep(2);
      }
    } catch (err) {
      const httpStatus = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || "Registration failed";
      if (httpStatus === 409) {
        toast.error("Username or email already taken. Please choose another.");
      } else {
        toast.error(detail);
      }
    } finally { setRegLoading(false); }
  };

  /* ─── Refresh verification (Step 2) ─────────────────────────────────────── */
  const handleCheckVerification = async () => {
    setRefreshLoading(true);
    try {
      const res = await api.get("/auth/me");
      const user = res.data;
      const status   = (user?.account_status || "pending_approval").toLowerCase();
      const isActive = status === "active" && user?.is_active !== false;
      if (isActive) {
        updateUser(user);
        setRegisteredUser(user);
        toast.success("Account verified! Welcome aboard.");
        setRegStep(3);
      } else {
        toast("Still pending approval. Please wait for admin to verify your account.");
      }
    } catch {
      toast.error("Could not check status. Please try again.");
    } finally { setRefreshLoading(false); }
  };

  /* ─── Enter Campus (Step 3) ─────────────────────────────────────────────── */
  const handleEnterCampus = () => {
    localStorage.setItem("alphasync_trading_mode", "demo");
    localStorage.setItem("alphasync_onboarded", "1");
    if ((registeredUser?.role || "").toLowerCase() === "institution_admin") {
      navigate("/institution/portal");
    } else {
      navigate("/dashboard");
    }
  };

  /* ─── Forgot password ────────────────────────────────────────────────────── */
  const handleForgotPassword = (e) => {
    e.preventDefault();
    toast("Password reset is not yet available. Please contact your admin.");
  };

  /* ─── Back to login from Step 2 ─────────────────────────────────────────── */
  const handleBackToLogin = async () => {
    try { await logout(); } catch {}
    setTab("login");
    setRegStep(1);
    setRegisteredUser(null);
  };

  /* ─── Tab switch ─────────────────────────────────────────────────────────── */
  const switchTab = (t) => {
    setTab(t);
    if (t === "register") {
      setRegStep(1);
      setRegisteredUser(null);
    }
  };

  /* ─── Derived ────────────────────────────────────────────────────────────── */
  const showCardHead = tab === "login" || (tab === "register" && regStep === 1);

  /* ══════════════════════════════════════════════════════════════════════════
     JSX
     ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="lp-shell">
      <style dangerouslySetInnerHTML={{ __html: LP_STYLES }} />

      {/* ═══════════════════════════════════════════════
          LEFT — unchanged
          ═══════════════════════════════════════════════ */}
      <div className="lp-left">

        <div className="lp-glow lp-glow-tr" />
        <div className="lp-glow lp-glow-bl" />
        <div className="lp-glow lp-glow-mid" />
        <div className="lp-grid" aria-hidden />

        {/* Candlestick Chart */}
        <div className="lp-chart" aria-hidden>
          <svg viewBox="0 0 420 560" preserveAspectRatio="xMaxYMin meet" width="100%" height="100%">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#00E599" stopOpacity="0.22"/>
                <stop offset="55%"  stopColor="#00B67A" stopOpacity="0.06"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="candleGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#3DE8A8"/>
                <stop offset="100%" stopColor="#00A968"/>
              </linearGradient>
              <linearGradient id="candleRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FB9C9C"/>
                <stop offset="100%" stopColor="#E45858"/>
              </linearGradient>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="6"/>
              </filter>
            </defs>
            {[100,180,260,340,420,500].map(y => (
              <line key={y} x1="0" y1={y} x2="420" y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 5"/>
            ))}
            {[70,150,230,310,390].map(x => (
              <line key={`v${x}`} x1={x} y1="60" x2={x} y2="560"
                stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>
            ))}
            <polygon
              points="30,510 70,462 110,418 150,382 190,338 230,296 270,248 310,204 350,158 390,114 420,88 420,560 30,560"
              fill="url(#areaGrad)"
            />
            <polyline
              points="30,510 70,462 110,418 150,382 190,338 230,296 270,248 310,204 350,158 390,114"
              fill="none" stroke="#00E599" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
            />
            <circle cx="390" cy="114" r="14" fill="#00E599" opacity="0.16" filter="url(#softGlow)"/>
            <circle cx="390" cy="114" r="4.5" fill="#00E599"/>
            <circle cx="390" cy="114" r="4.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
            <g filter="url(#glow)">
              {[[30,498,522,504,16],[70,448,474,454,16],[110,404,432,410,18],
                [190,324,352,330,18],[230,282,312,288,20],[270,234,266,240,20],
                [310,190,222,196,22],[350,144,178,150,22],[390,100,136,106,24]
              ].map(([x,wt,wb,bt,bh],i) => (
                <g key={`gb${i}`}>
                  <line x1={x} y1={wt} x2={x} y2={wb} stroke="#00A968" strokeWidth="1.5" opacity="0.7"/>
                  <rect x={x-8} y={bt} width="16" height={bh} fill="url(#candleGreen)" rx="3.5"
                    stroke="rgba(255,255,255,0.18)" strokeWidth="0.75"/>
                </g>
              ))}
            </g>
            <g filter="url(#glow)">
              {[[150,368,394,374,16],[420,76,106,80,20]].map(([x,wt,wb,bt,bh],i) => (
                <g key={`rb${i}`}>
                  <line x1={x} y1={wt} x2={x} y2={wb} stroke="#E45858" strokeWidth="1.5" opacity="0.7"/>
                  <rect x={x-8} y={bt} width="16" height={bh} fill="url(#candleRed)" rx="3.5"
                    stroke="rgba(255,255,255,0.18)" strokeWidth="0.75"/>
                </g>
              ))}
            </g>
            {[[30,540,14],[70,536,18],[110,532,22],[150,538,12],[190,530,26],[230,527,30],
              [270,524,34],[310,520,38],[350,516,42],[390,512,46],[420,524,30]
            ].map(([x,y,h],i) => (
              <rect key={`vol${i}`} x={x-6.5} y={y} width="13" height={h}
                fill={i===3||i===9 ? "#E45858" : "#00B67A"} opacity="0.22" rx="2.5"/>
            ))}
          </svg>
        </div>

        {/* Shield */}
        <div className="lp-shield" aria-hidden>
          <svg viewBox="0 0 220 260" width="100%" height="100%">
            <defs>
              <radialGradient id="shieldGlow" cx="50%" cy="40%" r="60%">
                <stop offset="0%"   stopColor="#00B67A" stopOpacity="0.08"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0"/>
              </radialGradient>
              <linearGradient id="shieldGrad" x1="0" y1="0" x2="0.8" y2="1">
                <stop offset="0%"   stopColor="#1C3D50"/>
                <stop offset="100%" stopColor="#0C2030"/>
              </linearGradient>
              <linearGradient id="shieldEdge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#00B67A" stopOpacity="0.7"/>
                <stop offset="60%"  stopColor="#00B67A" stopOpacity="0.2"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0.05"/>
              </linearGradient>
            </defs>
            <ellipse cx="110" cy="130" rx="110" ry="130" fill="url(#shieldGlow)"/>
            <path d="M110 10 L196 45 L196 130 C196 182 156 216 110 234 C64 216 24 182 24 130 L24 45 Z"
              fill="url(#shieldGrad)" stroke="url(#shieldEdge)" strokeWidth="2.5"/>
            <path d="M110 26 L180 57 L180 128 C180 172 148 202 110 218 C72 202 40 172 40 128 L40 57 Z"
              fill="none" stroke="rgba(0,182,122,0.18)" strokeWidth="1"/>
            <path d="M110 10 L196 45 L196 90 C175 72 148 60 110 52 C72 60 45 72 24 90 L24 45 Z"
              fill="rgba(255,255,255,0.04)"/>
            <polyline points="68,128 96,158 158,100" fill="none"
              stroke="#00B67A" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="68,128 96,158 158,100" fill="none"
              stroke="rgba(255,255,255,0.15)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"
              style={{mixBlendMode:"overlay"}}/>
          </svg>
        </div>

        {/* Logo */}
        <div className="lp-logo">
          <img src="/white-logo.png" alt="AlphaSync" className="lp-logo-icon" />
          <span className="lp-logo-name">AlphaSync</span>
          <span className="lp-logo-badge">Campus</span>
        </div>

        {/* Hero */}
        <div className="lp-hero">
          <h1>
            Learn. Backtest. Trade.<br/>
            <span className="lp-accent-txt">Comply. Grow.</span>
          </h1>
          <p className="lp-sub">
            AlphaSync Campus is an AI-powered learning and trading platform built
            with SEBI compliance at its core. Learn, practice and build your strategies
            in a 100% virtual and risk-free environment.
          </p>
          <div className="lp-sebi-label">Designed with SEBI-Aligned Compliance Controls</div>
          <div className="lp-feats">
            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M6 2.75h8.5L19 7.25V19.5a1.75 1.75 0 0 1-1.75 1.75h-9.5A1.75 1.75 0 0 1 6 19.5v-16.75Z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M14.25 2.75V6.5A1.75 1.75 0 0 0 16 8.25h3"
                    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8.75 12.25h6.5M8.75 15.25h6.5M8.75 9.25h2.5"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>Educational Purpose Only</strong>
                <span>Solely for learning &amp; simulation. Not for real trading.</span>
              </div>
            </div>
            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M6.5 17.5l11-11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>No Real Money or Advisory</strong>
                <span>No real funds, no investment advice, no guarantees.</span>
              </div>
            </div>
            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="4"    y="13"  width="3.4" height="7.25"  rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="10.3" y="8.5" width="3.4" height="11.75" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="16.6" y="4.5" width="3.4" height="15.75" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>Data from Authorised Sources</strong>
                <span>NSE &amp; BSE data displayed per SEBI guidelines.</span>
              </div>
            </div>
            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v18M8 21h8M12 5.5 4.5 8M12 5.5 19.5 8"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M2.5 8 4.5 8 6.5 12.5a2.6 2.6 0 0 1-4 0L4.5 8Z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M17.5 8 19.5 8 21.5 12.5a2.6 2.6 0 0 1-4 0L19.5 8Z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>Transparent &amp; Fair</strong>
                <span>Clear pricing, unbiased educational content.</span>
              </div>
            </div>
            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="10.75" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 10.75V7.5a4 4 0 0 1 8 0v3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="12" cy="15" r="1.35" fill="currentColor"/>
                  <path d="M12 16.35V17.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>Privacy &amp; Security</strong>
                <span>Encrypted data, strict privacy &amp; security policies.</span>
              </div>
            </div>
          </div>
          <div className="lp-capital">
            <div className="lp-cap-icon"><i className="fa fa-graduation-cap"></i></div>
            <div className="lp-cap-text">
              Start your learning journey with{" "}
              <span className="lp-cap-amt">₹10,00,000</span>
              {" "}virtual capital in Campus.
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="lp-trust">
          <span><i className="fa fa-shield-halved"></i>SEBI Aligned</span>
          <span><i className="fa fa-lock"></i>Secure &amp; Private</span>
          <span><i className="fa fa-ban"></i>No Investment Advice</span>
          <span><i className="fa fa-arrows-rotate"></i>Continuous Compliance</span>
          <span><i className="fa fa-graduation-cap"></i>Ethical &amp; Responsible Learning</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          RIGHT — no nav bar (free space)
          ═══════════════════════════════════════════════ */}
      <div className="lp-right">
        <div className="lp-form-area">
          <div className="lp-card">

            {/* ── Card Header (login + Step 1 only) ── */}
            {showCardHead && (
              <div className="lp-card-head">
                <div className="lp-secure-badge">
                  <svg viewBox="0 0 20 20" fill="none" width="13" height="13">
                    <path d="M10 2L17 5v5c0 4.5-3.5 7.5-7 8.5C3.5 17.5 3 14.5 3 10V5l7-3z"
                      stroke="#00B67A" strokeWidth="1.5" strokeLinejoin="round"/>
                    <polyline points="7,10 9,12 13,8" stroke="#00B67A" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Secure. Private. Trusted by Learners.
                </div>
                <h2>
                  {tab === "login"
                    ? "Welcome to AlphaSync Campus"
                    : "Create your Campus account"}
                </h2>
                <p>
                  {tab === "login"
                    ? "Sign in to continue your learning journey"
                    : "Join AlphaSync Campus and begin your learning journey"}
                </p>
              </div>
            )}

            {/* ── Step Indicator (register tab, all steps) ── */}
            {tab === "register" && <StepIndicator currentStep={regStep} />}

            {/* ══════════════════════════════════════════════
                LOGIN PANEL
                ══════════════════════════════════════════════ */}
            <div className={"lp-panel" + (tab === "login" ? " active" : "")} id="login-panel">
              <form onSubmit={handleLogin} id="login-form">

                <div className="lp-field">
                  <label htmlFor="login-username">Username</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-user" />
                    <input
                      id="login-username"
                      type="text"
                      placeholder="Enter your username"
                      required
                      autoComplete="username"
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value)}
                    />
                  </div>
                </div>

                <div className="lp-field">
                  <label htmlFor="login-password">Password</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-lock" />
                    <input
                      id="login-password"
                      type={showLoginPass ? "text" : "password"}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      value={loginPass}
                      onChange={e => setLoginPass(e.target.value)}
                    />
                    <i
                      className={"lp-eye fa " + (showLoginPass ? "fa-eye-slash" : "fa-eye")}
                      onClick={() => setShowLoginPass(p => !p)}
                      aria-label="Toggle password visibility"
                    />
                  </div>
                </div>

                <div className="lp-row">
                  <label className="lp-check" htmlFor="remember-me">
                    <input
                      id="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>
                  <a href="#forgot" className="lp-forgot" onClick={handleForgotPassword}>
                    Forgot password?
                  </a>
                </div>

                <button
                  id="login-submit-btn"
                  type="submit"
                  className="lp-btn-primary"
                  disabled={loginLoading}
                >
                  {loginLoading
                    ? <><i className="fa fa-spinner fa-spin" />&nbsp;Signing in…</>
                    : <><i className="fa fa-right-to-bracket" />&nbsp;Sign In to Campus</>}
                </button>

              </form>

              <p className="lp-terms">
                By signing in, you agree to our{" "}
                <a href="/terms">Terms &amp; Privacy Policy</a>
              </p>

              <div className="lp-switch-row">
                New to AlphaSync Campus?{" "}
                <button
                  type="button"
                  className="lp-switch-btn"
                  id="goto-register-btn"
                  onClick={() => switchTab("register")}
                >
                  Create your account
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════════════
                REGISTER PANEL
                ══════════════════════════════════════════════ */}
            <div className={"lp-panel" + (tab === "register" ? " active" : "")} id="register-panel">

              {/* ── STEP 1: Account Details ── */}
              {regStep === 1 && (
                <form onSubmit={handleRegister} id="register-step1-form">

                  {inviteInfo && (
                    <div
                      className="lp-invite-banner"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "7px",
                        padding: "8px 12px",
                        marginBottom: "12px",
                        borderRadius: "9px",
                        border: "1px solid rgba(0,229,153,0.3)",
                        background: "rgba(0,229,153,0.08)",
                        color: "#00E599",
                        fontSize: "12.5px",
                        fontWeight: 500,
                        lineHeight: 1.35,
                      }}
                    >
                      <svg viewBox="0 0 20 20" fill="none" width="14" height="14" style={{ flexShrink: 0 }}>
                        <path d="M10 3L2 7l8 4 8-4-8-4z" stroke="#00E599" strokeWidth="1.4" strokeLinejoin="round" />
                        <path d="M5 9v4c0 1.1 2.5 2 5 2s5-.9 5-2V9" stroke="#00E599" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>
                        Joining <strong>{inviteInfo.institutionName}</strong> as{" "}
                        <strong>{INVITE_ROLE_LABELS[inviteInfo.targetRole] || inviteInfo.targetRole}</strong>
                      </span>
                    </div>
                  )}

                  <div className="lp-field">
                    <label htmlFor="reg-fullname">Full Name</label>
                    <div className="lp-inp">
                      <i className="lp-ico fa fa-user" />
                      <input
                        id="reg-fullname"
                        type="text"
                        placeholder="Enter your full name"
                        required
                        autoComplete="name"
                        value={regFullName}
                        onChange={e => setRegFullName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="lp-field">
                    <label htmlFor="reg-email">Email Address</label>
                    <div className="lp-inp">
                      <i className="lp-ico fa fa-envelope" />
                      <input
                        id="reg-email"
                        type="email"
                        placeholder="Enter your email address"
                        required
                        autoComplete="email"
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="lp-field">
                    <label htmlFor="reg-username">Username</label>
                    <div className="lp-inp">
                      <i className="lp-ico fa fa-at" />
                      <input
                        id="reg-username"
                        type="text"
                        placeholder="Choose a unique username"
                        required
                        autoComplete="username"
                        value={regUsername}
                        onChange={e => setRegUsername(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="lp-field">
                    <label htmlFor="reg-password">Password</label>
                    <div className="lp-inp">
                      <i className="lp-ico fa fa-lock" />
                      <input
                        id="reg-password"
                        type={showRegPass ? "text" : "password"}
                        placeholder="Create a strong password"
                        required
                        autoComplete="new-password"
                        value={regPass}
                        onChange={e => setRegPass(e.target.value)}
                      />
                      <i
                        className={"lp-eye fa " + (showRegPass ? "fa-eye-slash" : "fa-eye")}
                        onClick={() => setShowRegPass(p => !p)}
                        aria-label="Toggle password visibility"
                      />
                    </div>
                  </div>

                  <div className="lp-field">
                    <label htmlFor="reg-confirm">Confirm Password</label>
                    <div className={
                      "lp-inp" +
                      (passMatch    ? " inp-match"    : "") +
                      (passMismatch ? " inp-mismatch" : "")
                    }>
                      <i className="lp-ico fa fa-lock" />
                      <input
                        id="reg-confirm"
                        type={showConfirmPass ? "text" : "password"}
                        placeholder="Confirm your password"
                        required
                        autoComplete="new-password"
                        value={regConfirmPass}
                        onChange={e => setRegConfirmPass(e.target.value)}
                      />
                      {passMatch ? (
                        <span className="lp-match-icon">
                          <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
                            <circle cx="7" cy="7" r="6.5" fill="#00B67A"/>
                            <polyline points="4,7 6.2,9.2 10,5"
                              stroke="#fff" strokeWidth="1.5"
                              strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      ) : (
                        <i
                          className={"lp-eye fa " + (showConfirmPass ? "fa-eye-slash" : "fa-eye")}
                          onClick={() => setShowConfirmPass(p => !p)}
                          aria-label="Toggle confirm password visibility"
                        />
                      )}
                    </div>
                    {passMatch    && <div className="pwd-match-ok">Passwords match</div>}
                    {passMismatch && <div className="pwd-match-err">Passwords do not match</div>}
                  </div>

                  {/* Password requirements — only shown while typing */}
                  {regPass.length > 0 && <PwdRequirements password={regPass} />}

                  {/* Terms */}
                  <div className="lp-field lp-terms-field">
                    <label className="lp-check" htmlFor="reg-agree">
                      <input
                        id="reg-agree"
                        type="checkbox"
                        required
                        checked={regAgree}
                        onChange={e => setRegAgree(e.target.checked)}
                      />
                      <span>
                        I agree to the{" "}
                        <a href="/terms" className="lp-link">Terms of Service</a>
                        {" "}and{" "}
                        <a href="/privacy" className="lp-link">Privacy Policy</a>
                      </span>
                    </label>
                  </div>

                  <button
                    id="create-account-btn"
                    type="submit"
                    className="lp-btn-primary"
                    disabled={regLoading}
                  >
                    {regLoading
                      ? <><i className="fa fa-spinner fa-spin" />&nbsp;Creating Account…</>
                      : <><i className="fa fa-user-plus" />&nbsp;Create Account</>}
                  </button>

                  <div className="lp-switch-row">
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="lp-switch-btn"
                      id="goto-login-btn"
                      onClick={() => switchTab("login")}
                    >
                      Sign in
                    </button>
                  </div>

                </form>
              )}

              {/* ── STEP 2: Verify Account ── */}
              {regStep === 2 && (
                <div className="step2-container" id="verify-account-section">

                  <div className="step2-icon-wrap" aria-hidden>
                    <div className="step2-svg-wrap">
                      <svg viewBox="0 0 80 80" fill="none" width="76" height="76">
                        <circle cx="40" cy="40" r="36"
                          stroke="#00B67A" strokeWidth="2.5" strokeOpacity="0.18"/>
                        <circle cx="40" cy="40" r="36"
                          stroke="#00B67A" strokeWidth="2.5"
                          strokeDasharray="226" strokeDashoffset="56"
                          strokeLinecap="round" className="step2-ring"/>
                        <circle cx="40" cy="40" r="27" fill="rgba(0,182,122,0.07)"
                          stroke="rgba(0,182,122,0.2)" strokeWidth="1.5"/>
                        {/* Clock face */}
                        <path d="M40 24v16l9 7" stroke="#00B67A" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  <h3 className="step2-title">Awaiting Admin Verification</h3>
                  <p className="step2-subtitle">
                    Your account has been created. Our team will review and approve
                    your access. This typically takes a short while.
                  </p>

                  <div className="step2-info-card">
                    {registeredUser?.full_name && (
                      <div className="step2-info-row">
                        <span className="step2-info-lbl">Name</span>
                        <span className="step2-info-val">{registeredUser.full_name}</span>
                      </div>
                    )}
                    <div className="step2-info-row">
                      <span className="step2-info-lbl">Email</span>
                      <span className="step2-info-val">
                        {registeredUser?.email || regEmail}
                      </span>
                    </div>
                    <div className="step2-info-row">
                      <span className="step2-info-lbl">Username</span>
                      <span className="step2-info-val">
                        @{registeredUser?.username || regUsername}
                      </span>
                    </div>
                    <div className="step2-info-row">
                      <span className="step2-info-lbl">Status</span>
                      <span className="step2-pending-badge">Pending Approval</span>
                    </div>
                  </div>

                  <button
                    id="refresh-verification-btn"
                    type="button"
                    className="lp-btn-primary step2-refresh-btn"
                    onClick={handleCheckVerification}
                    disabled={refreshLoading}
                  >
                    {refreshLoading
                      ? <><i className="fa fa-spinner fa-spin" />&nbsp;Checking…</>
                      : <><i className="fa fa-rotate-right" />&nbsp;Refresh Verification Status</>}
                  </button>

                  <p className="step2-note">
                    Once admin approves your account, click Refresh to continue.
                  </p>

                  <button
                    type="button"
                    className="lp-back-link"
                    onClick={handleBackToLogin}
                  >
                    Back to Sign In
                  </button>

                </div>
              )}

              {/* ── STEP 3: Complete ── */}
              {regStep === 3 && (
                <div className="step3-container" id="account-complete-section">

                  <div className="step3-blast" aria-hidden>
                    <div className="step3-ring-wrap">
                      <svg viewBox="0 0 96 96" fill="none" width="96" height="96">
                        <circle cx="48" cy="48" r="44" stroke="#00B67A" strokeWidth="2"
                          strokeOpacity="0.2" className="step3-pulse"/>
                        <circle cx="48" cy="48" r="36"
                          fill="rgba(0,182,122,0.08)"
                          stroke="#00B67A" strokeWidth="2.5"/>
                        <polyline points="30,48 42,60 66,36"
                          stroke="#00B67A" strokeWidth="4.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          className="step3-check"/>
                      </svg>
                    </div>
                    <div className="confetti-wrap" aria-hidden>
                      {["#00B67A","#6EE7B7","#F59E0B","#3B82F6","#EF4444","#34D399"].map((c,i) => (
                        <div key={i} className={`confetti-dot c${i}`} style={{background:c}} />
                      ))}
                    </div>
                  </div>

                  {inviteInfo ? (
                    <>
                      <h3 className="step3-title">Account Verified</h3>
                      <p className="step3-headline">
                        WELCOME TO {(inviteInfo.institutionName || "").toUpperCase()}
                      </p>
                      <p className="step3-subtitle">
                        Your account has been created as{" "}
                        <strong>{INVITE_ROLE_LABELS[inviteInfo.targetRole] || inviteInfo.targetRole}</strong>.
                        You're all set to get started.
                      </p>

                      <button
                        id="launch-campus-btn"
                        type="button"
                        className="lp-btn-primary step3-cta"
                        onClick={handleEnterCampus}
                      >
                        Continue
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className="step3-title">Account Verified</h3>
                      <p className="step3-headline">ACCESS GRANTED — ENTER THE ARENA</p>
                      <p className="step3-subtitle">
                        Your AlphaSync Campus account is live and loaded with{" "}
                        <strong>₹10,00,000 virtual capital</strong>.
                        The charts are calling. Your learning journey starts now.
                      </p>

                      <button
                        id="launch-campus-btn"
                        type="button"
                        className="lp-btn-primary step3-cta"
                        onClick={handleEnterCampus}
                      >
                        <i className="fa fa-bolt" />&nbsp;BLAST INTO CAMPUS
                      </button>

                      <p className="step3-tagline">
                        "The market opens every day. Be ready." — AlphaSync Campus
                      </p>
                    </>
                  )}

                </div>
              )}

            </div>
            {/* end register panel */}

          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   LP_STYLES
   ════════════════════════════════════════════════════════════ */
const LP_STYLES = `

  .lp-shell *, .lp-shell *::before, .lp-shell *::after { box-sizing: border-box; }

  .lp-shell {
    --accent:    #00B67A;
    --accent-dk: #009B68;
    --r-sm: 10px; --r-md: 14px; --r-lg: 18px; --r-xl: 22px; --r-pill: 999px;
    --f-sans:    'Inter', -apple-system, system-ui, sans-serif;
    --f-display: 'Manrope', 'Inter', system-ui, sans-serif;
    --f-mono:    'JetBrains Mono', 'SF Mono', monospace;
    --ease: all 0.2s cubic-bezier(0.4,0,0.2,1);

    display: grid;
    grid-template-columns: 55fr 45fr;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #060D1A;
    font-family: var(--f-sans);
    -webkit-font-smoothing: antialiased;
  }

  /* ══ LEFT ═════════════════════════════════════════════════ */
  .lp-left {
    background: linear-gradient(155deg, #050C18 0%, #06111E 45%, #091828 100%);
    display: flex; flex-direction: column;
    padding: 1.75rem 2.25rem 1.25rem;
    position: relative; overflow: hidden;
    scrollbar-width: none;
  }
  .lp-left::-webkit-scrollbar { display: none; }

  .lp-glow { position: absolute; border-radius: 50%; pointer-events: none; z-index: 0; }
  .lp-glow-tr {
    width: 700px; height: 700px;
    background: radial-gradient(circle, rgba(0,182,122,0.10) 0%, transparent 60%);
    top: -280px; right: -220px;
  }
  .lp-glow-bl {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(0,150,180,0.07) 0%, transparent 65%);
    bottom: -180px; left: -130px;
    animation: lpGlowBl 9s ease-in-out infinite;
  }
  .lp-glow-mid {
    width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(0,182,122,0.05) 0%, transparent 70%);
    top: 50%; right: 15%; transform: translateY(-50%);
    animation: lpGlowMid 12s ease-in-out infinite;
  }
  @keyframes lpGlowBl  { 0%,100%{transform:scale(1);opacity:.75} 50%{transform:scale(1.1);opacity:1} }
  @keyframes lpGlowMid { 0%,100%{transform:translateY(-50%) scale(1);opacity:.6} 50%{transform:translateY(-50%) scale(1.15);opacity:1} }

  .lp-grid {
    position: absolute; inset: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
    background-size: 32px 32px; pointer-events: none; z-index: 0;
    mask-image: linear-gradient(to bottom right, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 100%);
    -webkit-mask-image: linear-gradient(to bottom right, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 100%);
  }

  .lp-chart {
    position: absolute; top: 0; right: 0; width: 55%; height: 78%;
    opacity: 0.14; pointer-events: none; z-index: 1;
    -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 30%, rgba(0,0,0,0.3) 65%, transparent 100%);
    mask-image: linear-gradient(to left, rgba(0,0,0,1) 30%, rgba(0,0,0,0.3) 65%, transparent 100%);
  }

  .lp-shield {
    position: absolute; right: 3%; top: 52%; transform: translateY(-50%);
    width: 270px; height: 325px; opacity: 0.28; pointer-events: none; z-index: 1;
  }

  .lp-logo {
    display: flex; align-items: center; gap: .75rem;
    flex-shrink: 0; position: relative; z-index: 2;
  }
  .lp-logo-icon { height: 40px; width: 40px; object-fit: contain; }
  .lp-logo-name {
    color: #FFF; font-size: 1.5rem; font-weight: 700;
    font-family: var(--f-display); letter-spacing: -.02em; line-height: 1;
  }
  .lp-logo-badge {
    font-size: .72rem; font-weight: 700;
    background: rgba(0,182,122,0.15); color: #00B67A;
    border: 1px solid rgba(0,182,122,0.4);
    padding: .22rem .7rem; border-radius: var(--r-pill); letter-spacing: .05em;
  }

  .lp-hero {
    flex: 1; display: flex; flex-direction: column; justify-content: center;
    position: relative; z-index: 2; padding: 1.5rem 0 1rem;
    min-height: 0; overflow-y: auto; scrollbar-width: none;
  }
  .lp-hero::-webkit-scrollbar { display: none; }

  .lp-left h1 {
    font-size: clamp(1.75rem, 3vw, 2.6rem); line-height: 1.18; letter-spacing: -.5px;
    font-weight: 800; font-family: var(--f-display); color: #FFF; margin: 0 0 1.1rem;
  }
  .lp-accent-txt { color: #00B67A; }
  .lp-sub {
    font-size: .925rem; color: rgba(255,255,255,0.68); line-height: 1.7;
    max-width: 480px; margin-bottom: 1.35rem;
  }
  .lp-sebi-label {
    font-size: .72rem; font-weight: 700; color: #00B67A;
    text-transform: uppercase; letter-spacing: .14em; margin-bottom: 1rem;
  }
  .lp-feats { display: flex; flex-direction: column; gap: .9rem; margin-bottom: 1.25rem; }
  .lp-feat  { display: flex; align-items: center; gap: 1.1rem; }
  .lp-icon  {
    width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: .9rem;
    background: linear-gradient(155deg, rgba(0,182,122,0.16), rgba(0,182,122,0.06));
    border: 1px solid rgba(0,182,122,0.3); color: #00B67A;
    box-shadow: 0 0 12px rgba(0,182,122,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .lp-icon svg { width: 20px; height: 20px; }
  .lp-feat-txt { line-height: 1.4; }
  .lp-feat-txt strong { display: block; color: #FFF; font-size: .9rem; font-weight: 600; margin-bottom: .15rem; }
  .lp-feat-txt span  { display: block; color: rgba(255,255,255,0.55); font-size: .82rem; }

  .lp-capital {
    background: rgba(0,182,122,0.06); border: 1px solid rgba(0,182,122,0.18);
    border-radius: 14px; padding: 1rem 1.4rem;
    display: flex; align-items: center; gap: 1.1rem; width: 100%;
  }
  .lp-cap-icon {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: rgba(0,182,122,0.12); border: 1px solid rgba(0,182,122,0.25);
    display: flex; align-items: center; justify-content: center; color: #00B67A; font-size: 1rem;
  }
  .lp-cap-text { font-size: .875rem; color: rgba(255,255,255,0.8); line-height: 1.45; }
  .lp-cap-amt  { font-weight: 700; color: #00B67A; font-family: var(--f-mono); }

  .lp-trust {
    display: flex; align-items: center; justify-content: space-between; gap: .25rem;
    padding: .9rem 0 .5rem; flex-shrink: 0; position: relative; z-index: 2;
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .lp-trust span {
    display: inline-flex; align-items: center; justify-content: center; gap: .3rem;
    font-size: .7rem; font-weight: 500; color: rgba(255,255,255,0.55);
    white-space: nowrap; flex: 1;
  }
  .lp-trust span i { font-size: .8rem; color: rgba(0,182,122,0.8); }

  /* ══ RIGHT ════════════════════════════════════════════════ */
  .lp-right {
    background: #F0F4F8;
    display: flex; flex-direction: column;
    overflow: hidden; /* browser window never shows scrollbar */
  }

  /*
   * lp-form-area is the ONLY scroller on the right side.
   * flex-direction:column + margin:auto on the card = centered when
   * there is space; scrollable (invisibly) when content is taller
   * than the available height (zoom-in / small screens).
   */
  .lp-form-area {
    flex: 1;
    display: flex;
    flex-direction: column;   /* needed so margin:auto on card works */
    align-items: center;
    padding: 1.5rem 2rem;
    overflow-y: auto;         /* scroll internally when needed */
    overflow-x: hidden;
    scrollbar-width: none;    /* Firefox: hide scrollbar */
    -ms-overflow-style: none; /* IE/Edge */
  }
  .lp-form-area::-webkit-scrollbar { display: none; } /* Chrome/Safari */

  /* ── Card ── */
  .lp-card {
    width: 100%; max-width: 460px;
    background: #FFFFFF;
    border-radius: 22px;
    padding: 1.75rem 2.25rem 1.5rem;
    border: 1.5px solid #E2E8F0;
    box-shadow:
      0 24px 48px rgba(15,23,42,0.06),
      0 6px 16px rgba(15,23,42,0.03);
    /* margin:auto centres vertically when lp-form-area has spare space */
    margin: auto;
    /* Do NOT set max-height or overflow here — lp-form-area handles it */
  }

  /* ── Secure badge ── */
  .lp-secure-badge {
    display: inline-flex; align-items: center; gap: .4rem;
    font-size: .78rem; font-weight: 600; color: #00B67A;
    background: rgba(0,182,122,0.07); border: 1px solid rgba(0,182,122,0.22);
    border-radius: var(--r-pill); padding: .28rem .9rem;
    margin-bottom: .9rem;
  }

  .lp-card-head { text-align: center; margin-bottom: 1.1rem; }
  .lp-card-head h2 {
    font-size: 1.6rem; font-weight: 700; font-family: var(--f-display);
    color: #0F172A; letter-spacing: -.4px; margin: 0 0 .4rem; line-height: 1.2;
  }
  .lp-card-head p { font-size: .9rem; color: #64748B; line-height: 1.5; margin: 0; }

  /* ── Panels ── */
  .lp-panel { display: none; }
  .lp-panel.active { display: block; }

  /* ── Fields ── */
  .lp-field { margin-bottom: 0.8rem; }
  .lp-field > label, .lp-field label {
    display: block; font-size: .88rem; font-weight: 600;
    color: #1E293B; margin-bottom: .38rem; letter-spacing: .01em;
  }
  .lp-inp { position: relative; }
  .lp-ico {
    position: absolute; left: 1.1rem; top: 50%; transform: translateY(-50%);
    color: #94A3B8; font-size: .95rem; pointer-events: none; z-index: 1;
  }
  .lp-inp input {
    width: 100%; height: 46px;
    background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 11px;
    padding: 0 2.8rem 0 2.8rem;
    color: #0F172A; font-size: .93rem; font-family: var(--f-sans);
    outline: none; transition: var(--ease);
  }
  .lp-inp input::placeholder { color: #A0AEC0; }
  .lp-inp input:focus {
    border-color: #00B67A; background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(0,182,122,0.09);
  }
  /* Match states */
  .lp-inp.inp-match input {
    border-color: #00B67A; background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(0,182,122,0.09);
  }
  .lp-inp.inp-mismatch input {
    border-color: #EF4444;
    box-shadow: 0 0 0 3px rgba(239,68,68,0.07);
  }
  .lp-eye {
    position: absolute; right: 1.1rem; top: 50%; transform: translateY(-50%);
    color: #94A3B8; cursor: pointer; font-size: 1rem; transition: color .18s; z-index: 1;
  }
  .lp-eye:hover { color: #00B67A; }
  .lp-match-icon {
    position: absolute; right: 1rem; top: 50%; transform: translateY(-50%);
    display: flex; align-items: center; z-index: 1;
  }
  .pwd-match-ok {
    margin-top: .3rem; font-size: .8rem; font-weight: 600; color: #00B67A;
    display: flex; align-items: center; gap: .3rem;
  }
  .pwd-match-err {
    margin-top: .3rem; font-size: .8rem; font-weight: 600; color: #EF4444;
  }

  /* ── Remember + Forgot row ── */
  .lp-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1.1rem;
  }
  .lp-check {
    display: flex; align-items: center; gap: .45rem;
    font-size: .88rem; color: #64748B; cursor: pointer; user-select: none;
  }
  .lp-check input[type="checkbox"] {
    accent-color: #00B67A; width: 15px; height: 15px;
    cursor: pointer; flex-shrink: 0;
  }
  .lp-forgot {
    font-size: .88rem; color: #00B67A; text-decoration: none;
    font-weight: 600; transition: color .18s;
  }
  .lp-forgot:hover { color: #009B68; }

  /* ── Primary button ── */
  .lp-btn-primary {
    width: 100%; height: 48px; border-radius: 12px;
    background: linear-gradient(90deg, #00B67A 0%, #009E6A 100%);
    color: #FFF; font-size: .95rem; font-weight: 700;
    font-family: var(--f-sans); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: .45rem;
    margin-bottom: .9rem;
    box-shadow: 0 8px 20px rgba(0,182,122,0.18);
    letter-spacing: .02em; transition: var(--ease);
  }
  .lp-btn-primary:hover  { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,182,122,0.32); }
  .lp-btn-primary:active { transform: translateY(0);    box-shadow: 0 5px 12px rgba(0,182,122,0.18); }
  .lp-btn-primary:disabled { opacity:.58; cursor:not-allowed; transform:none; box-shadow:none; }

  /* ── Terms text ── */
  .lp-terms {
    font-size: .82rem; color: #94A3B8;
    text-align: center; line-height: 1.5; margin: 0 0 .75rem;
  }
  .lp-terms a { color: #00B67A; font-weight: 600; text-decoration: none; }
  .lp-terms a:hover { color: #009B68; }

  /* ── Tab switch row (text links, no buttons) ── */
  .lp-switch-row {
    text-align: center; font-size: .88rem; color: #64748B;
    padding-top: .75rem;
    border-top: 1px solid #F1F5F9;
  }
  .lp-switch-btn {
    background: none; border: none; padding: 0;
    color: #00B67A; font-size: .88rem; font-weight: 700;
    font-family: var(--f-sans); cursor: pointer;
    text-decoration: underline; transition: color .18s;
  }
  .lp-switch-btn:hover { color: #009B68; }

  /* ── Terms field ── */
  .lp-terms-field { margin-bottom: .9rem; }
  .lp-terms-field .lp-check { align-items: flex-start; }
  .lp-terms-field .lp-check input { margin-top: 2px; }
  .lp-link { color: #00B67A; font-weight: 600; text-decoration: none; }
  .lp-link:hover { color: #009B68; text-decoration: underline; }

  /* ══ PASSWORD REQUIREMENTS ═══════════════════════════════ */
  .pwd-rules-box {
    background: #F8FAFC;
    border: 1.5px solid #E2E8F0;
    border-radius: 10px;
    padding: .7rem .9rem;
    margin-bottom: .8rem;
    transition: border-color .3s;
  }
  .pwd-rules-box.all-pass {
    border-color: rgba(0,182,122,0.4);
    background: rgba(0,182,122,0.03);
  }
  .pwd-rules-title {
    display: block; font-size: .8rem; font-weight: 700;
    color: #475569; margin-bottom: .45rem; letter-spacing: .01em;
  }
  .pwd-rules-box ul {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: .28rem;
  }
  .pwd-rules-box li {
    display: flex; align-items: center; gap: .55rem;
    font-size: .81rem; color: #94A3B8; transition: color .25s;
    line-height: 1.3;
  }
  .pwd-rules-box li.pass { color: #00B67A; }
  /* The dot/check circle */
  .pwd-dot {
    width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
    border: 1.5px solid #CBD5E1; background: #fff;
    display: flex; align-items: center; justify-content: center;
    transition: background .25s, border-color .25s;
  }
  .pwd-dot.pass {
    background: #00B67A; border-color: #00B67A;
  }

  /* ══ STEP INDICATOR ══════════════════════════════════════ */
  .step-indicator {
    display: flex; align-items: flex-start; justify-content: center;
    gap: 0; margin-bottom: 1.25rem;
  }
  .step-item {
    display: flex; flex-direction: column; align-items: center;
    position: relative; flex: 1;
  }
  .step-circle {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: .85rem; font-weight: 700;
    background: #F1F5F9; color: #94A3B8;
    border: 2px solid #E2E8F0;
    transition: all .3s ease; position: relative; z-index: 2; flex-shrink: 0;
  }
  .step-circle.active {
    background: #00B67A; color: #FFF; border-color: #00B67A;
    box-shadow: 0 0 0 4px rgba(0,182,122,0.14);
  }
  .step-circle.done { background: #00B67A; color: #FFF; border-color: #00B67A; }
  .step-label {
    font-size: .72rem; font-weight: 500; color: #94A3B8;
    text-align: center; margin-top: .38rem; white-space: nowrap; transition: color .3s;
  }
  .step-label.active { color: #00B67A; font-weight: 700; }
  .step-label.done   { color: #64748B; }
  .step-line {
    position: absolute; top: 17px;
    left: calc(50% + 17px); width: calc(100% - 34px);
    height: 2px; background: #E2E8F0; z-index: 1; transition: background .3s;
  }
  .step-line.done { background: #00B67A; }

  /* ══ STEP 2 ══════════════════════════════════════════════ */
  .step2-container {
    display: flex; flex-direction: column; align-items: center;
    text-align: center; padding: .25rem 0 .5rem;
  }
  .step2-icon-wrap { margin-bottom: 1rem; }
  .step2-svg-wrap {
    animation: step2Rotate 4s linear infinite;
    display: inline-block;
  }
  @keyframes step2Rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .step2-ring {
    transform-origin: center;
    animation: step2RingDash 2.5s ease-in-out infinite;
  }
  @keyframes step2RingDash {
    0%   { stroke-dashoffset: 226; }
    50%  { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: -226; }
  }
  .step2-title {
    font-size: 1.2rem; font-weight: 700; color: #0F172A;
    margin: 0 0 .5rem; font-family: var(--f-display);
  }
  .step2-subtitle {
    font-size: .85rem; color: #64748B; line-height: 1.6;
    margin: 0 0 1.1rem; max-width: 320px;
  }
  .step2-info-card {
    width: 100%; background: #F8FAFC; border: 1.5px solid #E2E8F0;
    border-radius: 12px; padding: .85rem 1.1rem;
    margin-bottom: 1.1rem; text-align: left;
    display: flex; flex-direction: column; gap: .55rem;
  }
  .step2-info-row {
    display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  }
  .step2-info-lbl {
    font-size: .75rem; font-weight: 600; color: #94A3B8;
    text-transform: uppercase; letter-spacing: .07em; white-space: nowrap;
  }
  .step2-info-val {
    font-size: .85rem; font-weight: 600; color: #0F172A;
    text-align: right; word-break: break-all;
  }
  .step2-pending-badge {
    font-size: .75rem; font-weight: 700;
    background: rgba(245,158,11,0.1); color: #D97706;
    border: 1px solid rgba(245,158,11,0.28); border-radius: var(--r-pill);
    padding: .18rem .65rem;
  }
  .step2-refresh-btn { margin-bottom: .65rem; }
  .step2-note {
    font-size: .79rem; color: #94A3B8; margin: 0 0 .9rem; line-height: 1.5;
  }
  .lp-back-link {
    background: none; border: none; padding: 0;
    font-size: .84rem; color: #94A3B8; cursor: pointer;
    font-family: var(--f-sans); text-decoration: underline;
    transition: color .18s;
  }
  .lp-back-link:hover { color: #64748B; }

  /* ══ STEP 3 ══════════════════════════════════════════════ */
  .step3-container {
    display: flex; flex-direction: column; align-items: center;
    text-align: center; padding: .25rem 0 .5rem;
  }
  .step3-blast { position: relative; margin-bottom: 1.25rem; }
  .step3-ring-wrap { display: inline-block; }
  .step3-pulse {
    animation: step3Pulse 2s ease-in-out infinite;
  }
  @keyframes step3Pulse {
    0%,100%{ opacity:.2; } 50%{ opacity:.5; }
  }
  .step3-check {
    stroke-dasharray: 85; stroke-dashoffset: 85;
    animation: step3CheckDraw .7s .15s ease-out forwards;
  }
  @keyframes step3CheckDraw { to { stroke-dashoffset: 0; } }

  /* Confetti */
  .confetti-wrap { position: absolute; top: 50%; left: 50%; pointer-events: none; }
  .confetti-dot {
    position: absolute; width: 7px; height: 7px; border-radius: 50%;
    opacity: 0; animation: .9s ease-out forwards;
  }
  .confetti-dot.c0 { animation-name: cp0; animation-delay: .1s; }
  .confetti-dot.c1 { animation-name: cp1; animation-delay: .15s; }
  .confetti-dot.c2 { animation-name: cp2; animation-delay: .2s; }
  .confetti-dot.c3 { animation-name: cp3; animation-delay: .1s; }
  .confetti-dot.c4 { animation-name: cp4; animation-delay: .25s; }
  .confetti-dot.c5 { animation-name: cp5; animation-delay: .18s; }
  @keyframes cp0 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(-50px,-54px) scale(.4)} }
  @keyframes cp1 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(54px,-50px) scale(.4)} }
  @keyframes cp2 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(-46px,52px) scale(.4)} }
  @keyframes cp3 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(48px,48px) scale(.4)} }
  @keyframes cp4 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(62px,-22px) scale(.4)} }
  @keyframes cp5 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(-62px,22px) scale(.4)} }

  .step3-title    { font-size: 1.45rem; font-weight: 800; color: #0F172A; margin: 0 0 .3rem; font-family: var(--f-display); }
  .step3-headline { font-size: .92rem; font-weight: 800; color: #00B67A; margin: 0 0 .75rem; letter-spacing: .06em; }
  .step3-subtitle { font-size: .86rem; color: #64748B; line-height: 1.65; margin: 0 0 1.35rem; max-width: 340px; }
  .step3-subtitle strong { color: #0F172A; }
  .step3-cta {
    height: 52px; font-size: .98rem; font-weight: 800; letter-spacing: .04em;
    background: linear-gradient(90deg, #00B67A 0%, #00CF8A 50%, #009E6A 100%);
    box-shadow: 0 10px 28px rgba(0,182,122,0.32); margin-bottom: .75rem;
    animation: ctaPulse 2.2s ease-in-out infinite;
  }
  @keyframes ctaPulse {
    0%,100%{ box-shadow: 0 10px 28px rgba(0,182,122,0.32); }
    50%    { box-shadow: 0 14px 36px rgba(0,182,122,0.52); }
  }
  .step3-tagline { font-size: .78rem; color: #94A3B8; font-style: italic; margin: 0; }

  /* ══ RESPONSIVE ══════════════════════════════════════════ */
  @media (min-width: 1440px) {
    .lp-left      { padding: 1.75rem 2.75rem 1.25rem; }
    .lp-form-area { padding: 2rem 2.5rem; }
    .lp-card      { max-width: 470px; padding: 2rem 2.5rem 1.75rem; }
    .lp-card-head h2 { font-size: 1.75rem; }
    .lp-left h1   { font-size: 2.25rem; }
  }

  @media (max-width: 1280px) and (min-width: 901px) {
    .lp-left      { padding: 1.25rem 1.75rem .85rem; }
    .lp-form-area { padding: 1rem 1.5rem; }
    .lp-card      { max-width: 440px; padding: 1.5rem 2rem 1.25rem; }
    .lp-left h1   { font-size: clamp(1.375rem, 2.8vw, 2rem); }
    .lp-card-head h2 { font-size: 1.5rem; }
    .lp-feats     { gap: .35rem; }
    .lp-sub       { margin-bottom: .5rem; }
    .lp-shield    { width: 180px; height: 215px; }
  }

  @media (max-width: 900px) {
    .lp-shell     { grid-template-columns: 1fr; }
    .lp-left      { display: none; }
    .lp-right     { height: 100dvh; overflow: hidden; }
    /* lp-form-area already scrolls with hidden bar — just adjust padding */
    .lp-form-area { padding: 1rem 1.5rem; }
    .lp-card      { max-width: 520px; }
  }

  @media (max-width: 480px) {
    .lp-form-area    { padding: .75rem 1rem; }
    .lp-card         { max-width: 100%; padding: 1.5rem 1.25rem; border-radius: 16px; }
    .lp-card-head h2 { font-size: 1.35rem; }
    .lp-card-head p  { font-size: .85rem; }
    .lp-inp input    { height: 46px; }
    .lp-btn-primary  { height: 48px; }
    .step-label      { font-size: .66rem; }
    .step-circle     { width: 30px; height: 30px; font-size: .78rem; }
    .step-line       { top: 15px; left: calc(50% + 15px); width: calc(100% - 30px); }
  }

  /* Landscape / short viewport — same hidden-scroll approach, no max-height */
  @media (max-height: 620px) and (orientation: landscape) {
    .lp-shell     { height: 100dvh; overflow: hidden; }
    .lp-left      { display: none; }
    .lp-shell     { grid-template-columns: 1fr; }
    .lp-right     { height: 100dvh; overflow: hidden; }
    .lp-form-area { padding: .75rem 1.5rem; }
  }
`;
