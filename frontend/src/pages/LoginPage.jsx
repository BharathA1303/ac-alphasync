// LoginPage.jsx — Combined Login + Register
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import toast from "react-hot-toast";
import usePageMeta from "../hooks/usePageMeta";
import { hasUserSessionCookie } from "../utils/authSessionCookie";

function PwdStrength({ password }) {
  if (!password) return null;
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const cls = score <= 1 ? "weak" : score <= 2 ? "medium" : "strong";
  return (
    <div className="pwd-strength">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={"pwd-bar" + (i <= score ? " " + cls : "")} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  usePageMeta(
    "α·SIM Demo Trading — Login | AlphaSync",
    "Start paper trading for free. ₹10L virtual capital, live NSE/BSE data, zero risk."
  );

  const [tab, setTab] = useState("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPass, setLoginPass]       = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [regUsername, setRegUsername]   = useState("");
  const [regFname, setRegFname]         = useState("");
  const [regLname, setRegLname]         = useState("");
  const [regEmail, setRegEmail]         = useState("");
  const [regPass, setRegPass]           = useState("");
  const [regAgree, setRegAgree]         = useState(false);
  const [regLoading, setRegLoading]     = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass,   setShowRegPass]   = useState(false);

  const loginWithEmail     = useAuthStore((s) => s.loginWithEmail);
  const loginWithGoogle    = useAuthStore((s) => s.loginWithGoogle);
  const registerWithEmail  = useAuthStore((s) => s.registerWithEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const existingUser       = useAuthStore((s) => s.user);
  const navigate           = useNavigate();
  const [searchParams]     = useSearchParams();
  const adminIntent        = (searchParams.get("intent") || "").toLowerCase() === "admin";

  const routeByAccountStatus = (profile) => {
    const status   = (profile?.account_status || "active").toLowerCase();
    const isActive = status === "active" && profile?.is_active !== false;
    if (isActive) {
      if (adminIntent) {
        if ((profile?.role || "").toLowerCase() === "admin") {
          navigate("/admin/panel");
        } else {
          toast.error(`Signed in as ${profile?.username || profile?.email || "this account"}, but it is not an admin account.`);
          navigate("/admin");
        }
        return;
      }
      localStorage.setItem("alphasync_trading_mode", "demo");
      localStorage.setItem("alphasync_onboarded", "1");
      navigate("/dashboard");
    } else {
      navigate("/account-status");
    }
  };

  const handleAuthSuccess = (profile) => {
    routeByAccountStatus(profile);
  };

  useEffect(() => {
    if (!existingUser || adminIntent) return;
    if (!hasUserSessionCookie()) return;
    handleAuthSuccess(existingUser);
  }, [existingUser, adminIntent]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim()) return toast.error("Username is required");
    setLoginLoading(true);
    try {
      const result = await loginWithEmail(loginUsername.trim(), loginPass);
      if ((result?.user?.account_status || "active") !== "active") {
        toast("Login successful. Your account is pending review.");
      } else {
        toast.success("Welcome back!");
      }
      handleAuthSuccess(result?.user);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || "Login failed";
      if (status === 401) {
        toast.error("Invalid username or password");
      } else if (status === 403) {
        toast.error("Account is inactive or pending review");
      } else if (status === 429) {
        toast.error("Too many attempts. Try again later.");
      } else {
        toast.error(detail);
      }
    } finally { setLoginLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regUsername.trim()) return toast.error("Username is required");
    if (regPass.length < 6) return toast.error("Password must be at least 6 characters");
    setRegLoading(true);
    try {
      const fullName = (regFname + " " + regLname).trim();
      const result   = await registerWithEmail(regEmail.trim(), regPass, fullName, regUsername.trim());
      localStorage.setItem("alphasync_trading_mode", "demo");
      localStorage.setItem("alphasync_onboarded", "1");
      toast.success("Account created successfully!");
      handleAuthSuccess(result?.user);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || "Registration failed";
      if (status === 409) {
        toast.error("Username already taken. Choose a different one.");
      } else if (status === 400) {
        toast.error(detail);
      } else {
        toast.error(detail);
      }
    } finally { setRegLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle("login");
      const email  = result?.user?.email || "selected Google account";
      if ((result?.user?.account_status || "active") !== "active") {
        toast(`Signed in as ${email}. Your account is under review.`);
      } else {
        toast.success(`Welcome back, ${email}!`);
      }
      handleAuthSuccess(result?.user);
    } catch (err) {
      if (err.response?.status === 404) { toast.error("Account not found. Please create an account first."); setTab("register"); return; }
      if (err.code !== "auth/popup-closed-by-user") toast.error(err.message || "Google sign-in failed");
    } finally { setGoogleLoading(false); }
  };

  const handleGoogleRegister = async () => {
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle("register");
      const email  = result?.user?.email || "selected Google account";
      if ((result?.user?.account_status || "active") !== "active") {
        toast.success(`Registered as ${email}. Account pending approval.`);
      } else {
        toast.success(result.isNew ? `Welcome to AlphaSync, ${email}!` : `Welcome back, ${email}!`);
      }
      handleAuthSuccess(result?.user);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") toast.error(err.message || "Google sign-up failed");
    } finally { setGoogleLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail) return toast.error("Enter your email first");
    try {
      const { resetPassword } = useAuthStore.getState();
      await resetPassword(loginEmail);
      toast.success("Password reset email sent!");
    } catch { toast.error("Could not send reset email."); }
  };

  return (
    <div className="lp-shell">
      <style dangerouslySetInnerHTML={{ __html: LP_STYLES }} />

      {/* ═══════════════════════════════════════════════
          LEFT — FULL BLEED dark navy — Campus design
          ═══════════════════════════════════════════════ */}
      <div className="lp-left">

        {/* Background glows */}
        <div className="lp-glow lp-glow-tr" />
        <div className="lp-glow lp-glow-bl" />
        <div className="lp-glow lp-glow-mid" />

        {/* Subtle grid overlay */}
        <div className="lp-grid" aria-hidden />

        {/* ── Premium Candlestick Chart (right half, full height diagonal) ── */}
        <div className="lp-chart" aria-hidden>
          <svg viewBox="0 0 420 560" preserveAspectRatio="xMaxYMin meet" width="100%" height="100%">
            <defs>
              {/* Area gradient under the trend line */}
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00E599" stopOpacity="0.22"/>
                <stop offset="55%" stopColor="#00B67A" stopOpacity="0.06"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0"/>
              </linearGradient>
              {/* Candle body gradients */}
              <linearGradient id="candleGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3DE8A8"/>
                <stop offset="100%" stopColor="#00A968"/>
              </linearGradient>
              <linearGradient id="candleRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FB9C9C"/>
                <stop offset="100%" stopColor="#E45858"/>
              </linearGradient>
              {/* Candle glow filter */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="6"/>
              </filter>
            </defs>

            {/* Horizontal grid lines */}
            {[100,180,260,340,420,500].map(y => (
              <line key={y} x1="0" y1={y} x2="420" y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 5"/>
            ))}
            {/* Vertical guide lines */}
            {[70,150,230,310,390].map(x => (
              <line key={`v${x}`} x1={x} y1="60" x2={x} y2="560"
                stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>
            ))}

            {/* Area fill under trend */}
            <polygon
              points="30,510 70,462 110,418 150,382 190,338 230,296 270,248 310,204 350,158 390,114 420,88 420,560 30,560"
              fill="url(#areaGrad)"
            />

            {/* Trend line */}
            <polyline
              points="30,510 70,462 110,418 150,382 190,338 230,296 270,248 310,204 350,158 390,114"
              fill="none" stroke="#00E599" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
            />

            {/* Endpoint marker with soft halo */}
            <circle cx="390" cy="114" r="14" fill="#00E599" opacity="0.16" filter="url(#softGlow)"/>
            <circle cx="390" cy="114" r="4.5" fill="#00E599"/>
            <circle cx="390" cy="114" r="4.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>

            {/* Green bullish candles — rising diagonally */}
            <g filter="url(#glow)">
              {/* candle: [x, wickTop, wickBot, bodyTop, bodyH] */}
              {[[30,498,522,504,16],[70,448,474,454,16],[110,404,432,410,18],
                [190,324,352,330,18],[230,282,312,288,20],[270,234,266,240,20],
                [310,190,222,196,22],[350,144,178,150,22],[390,100,136,106,24]
              ].map(([x,wt,wb,bt,bh],i)=>(
                <g key={`gb${i}`}>
                  <line x1={x} y1={wt} x2={x} y2={wb} stroke="#00A968" strokeWidth="1.5" opacity="0.7"/>
                  <rect x={x-8} y={bt} width="16" height={bh} fill="url(#candleGreen)" rx="3.5"
                    stroke="rgba(255,255,255,0.18)" strokeWidth="0.75"/>
                </g>
              ))}
            </g>

            {/* Red bearish candles mixed in */}
            <g filter="url(#glow)">
              {[[150,368,394,374,16],[420,76,106,80,20]].map(([x,wt,wb,bt,bh],i)=>(
                <g key={`rb${i}`}>
                  <line x1={x} y1={wt} x2={x} y2={wb} stroke="#E45858" strokeWidth="1.5" opacity="0.7"/>
                  <rect x={x-8} y={bt} width="16" height={bh} fill="url(#candleRed)" rx="3.5"
                    stroke="rgba(255,255,255,0.18)" strokeWidth="0.75"/>
                </g>
              ))}
            </g>

            {/* Volume bars at bottom */}
            {[[30,540,14],[70,536,18],[110,532,22],[150,538,12],[190,530,26],[230,527,30],
              [270,524,34],[310,520,38],[350,516,42],[390,512,46],[420,524,30]
            ].map(([x,y,h],i)=>(
              <rect key={`vol${i}`} x={x-6.5} y={y} width="13" height={h}
                fill={i===3||i===9 ? "#E45858" : "#00B67A"} opacity="0.22" rx="2.5"/>
            ))}
          </svg>
        </div>

        {/* ── Shield with checkmark — right-center, premium glow ── */}
        <div className="lp-shield" aria-hidden>
          <svg viewBox="0 0 220 260" width="100%" height="100%">
            <defs>
              <radialGradient id="shieldGlow" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#00B67A" stopOpacity="0.08"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0"/>
              </radialGradient>
              <linearGradient id="shieldGrad" x1="0" y1="0" x2="0.8" y2="1">
                <stop offset="0%" stopColor="#1C3D50"/>
                <stop offset="100%" stopColor="#0C2030"/>
              </linearGradient>
              <linearGradient id="shieldEdge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00B67A" stopOpacity="0.7"/>
                <stop offset="60%" stopColor="#00B67A" stopOpacity="0.2"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0.05"/>
              </linearGradient>
            </defs>
            {/* Outer glow halo */}
            <ellipse cx="110" cy="130" rx="110" ry="130" fill="url(#shieldGlow)"/>
            {/* Shield body */}
            <path d="M110 10 L196 45 L196 130 C196 182 156 216 110 234 C64 216 24 182 24 130 L24 45 Z"
              fill="url(#shieldGrad)" stroke="url(#shieldEdge)" strokeWidth="2.5"/>
            {/* Inner rim */}
            <path d="M110 26 L180 57 L180 128 C180 172 148 202 110 218 C72 202 40 172 40 128 L40 57 Z"
              fill="none" stroke="rgba(0,182,122,0.18)" strokeWidth="1"/>
            {/* Sheen highlight */}
            <path d="M110 10 L196 45 L196 90 C175 72 148 60 110 52 C72 60 45 72 24 90 L24 45 Z"
              fill="rgba(255,255,255,0.04)"/>
            {/* Checkmark */}
            <polyline points="68,128 96,158 158,100" fill="none"
              stroke="#00B67A" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="68,128 96,158 158,100" fill="none"
              stroke="rgba(255,255,255,0.15)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"
              style={{mixBlendMode:"overlay"}}/>
          </svg>
        </div>

        {/* ── Logo ── */}
        <div className="lp-logo">
          <img src="/white-logo.png" alt="AlphaSync" className="lp-logo-icon" />
          <span className="lp-logo-name">AlphaSync</span>
          <span className="lp-logo-badge">Campus</span>
        </div>

        {/* ── Main content area ── */}
        <div className="lp-hero">

          {/* Hero headline */}
          <h1>
            Learn. Backtest. Trade.<br/>
            <span className="lp-accent-txt">Comply. Grow.</span>
          </h1>

          <p className="lp-sub">
            AlphaSync Campus is an AI-powered learning and trading platform built
            with SEBI compliance at its core. Learn, practice and build your strategies
            in a 100% virtual and risk-free environment.
          </p>

          {/* SEBI section label */}
          <div className="lp-sebi-label">Designed with SEBI-Aligned Compliance Controls</div>

          {/* 5 compliance features */}
          <div className="lp-feats">

            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 2.75h8.5L19 7.25V19.5a1.75 1.75 0 0 1-1.75 1.75h-9.5A1.75 1.75 0 0 1 6 19.5v-16.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M14.25 2.75V6.5A1.75 1.75 0 0 0 16 8.25h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8.75 12.25h6.5M8.75 15.25h6.5M8.75 9.25h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>Educational Purpose Only</strong>
                <span>Solely for learning & simulation. Not for real trading.</span>
              </div>
            </div>

            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="4" y="13" width="3.4" height="7.25" rx="1" stroke="currentColor" strokeWidth="1.5"/>
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
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3v18M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M12 5.5 4.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M12 5.5 19.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M2.5 8 4.5 8 6.5 12.5a2.6 2.6 0 0 1-4 0L4.5 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M17.5 8 19.5 8 21.5 12.5a2.6 2.6 0 0 1-4 0L19.5 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="lp-feat-txt">
                <strong>Transparent &amp; Fair</strong>
                <span>Clear pricing, unbiased educational content.</span>
              </div>
            </div>

            <div className="lp-feat">
              <div className="lp-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

          {/* Capital banner */}
          <div className="lp-capital">
            <div className="lp-cap-icon"><i className="fa fa-graduation-cap"></i></div>
            <div className="lp-cap-text">
              Start your learning journey with{" "}
              <span className="lp-cap-amt">{"₹"}10,00,000</span>
              {" "}virtual capital in Campus.
            </div>
          </div>

        </div>

        {/* ── Trust strip ── */}
        <div className="lp-trust">
          <span><i className="fa fa-shield-halved"></i>SEBI Aligned</span>
          <span><i className="fa fa-lock"></i>Secure &amp; Private</span>
          <span><i className="fa fa-ban"></i>No Investment Advice</span>
          <span><i className="fa fa-arrows-rotate"></i>Continuous Compliance</span>
          <span><i className="fa fa-graduation-cap"></i>Ethical &amp; Responsible Learning</span>
        </div>


      </div>

      {/* ═══════════════════════════════════════════════
          RIGHT — pure white
          ═══════════════════════════════════════════════ */}
      <div className="lp-right">

        <div className="lp-nav">
          <a href="/login" className="lpn-active">Live Trading</a>
          <a href="/admin" className="lpn-muted">Admin Panel</a>
        </div>

        <div className="lp-form-area">
          <div className="lp-card">

            <div className="lp-card-head">
              <h2>{tab === "login" ? "Welcome back 👋" : "Start trading free 🚀"}</h2>
              <p>
                {tab === "login"
                  ? <>Login to your {"α·SIM"} demo account</>
                  : <>Create your {"α·SIM"} account — takes 30 seconds</>}
              </p>
            </div>

            <div className="lp-tabs" role="tablist">
              <button
                className={"lp-tab" + (tab === "login"    ? " active" : "")}
                onClick={() => setTab("login")} type="button" role="tab"
              >Login</button>
              <button
                className={"lp-tab" + (tab === "register" ? " active" : "")}
                onClick={() => setTab("register")} type="button" role="tab"
              >Create Account</button>
            </div>

            {/* LOGIN */}
            <div className={"lp-panel" + (tab === "login" ? " active" : "")}>
              <form onSubmit={handleLogin}>

                <div className="lp-field">
                  <label>Username</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-user"></i>
                    <input type="text" placeholder="Enter your username" required
                      autoComplete="username" value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)} />
                  </div>
                </div>

                <div className="lp-field">
                  <label>Password</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-lock"></i>
                    <input
                      type={showLoginPass ? "text" : "password"}
                      placeholder="••••••••" required autoComplete="current-password"
                      value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
                    />
                    <i className={"lp-eye fa " + (showLoginPass ? "fa-eye-slash" : "fa-eye")}
                       onClick={() => setShowLoginPass(!showLoginPass)} />
                  </div>
                </div>

                <div className="lp-row">
                  <label className="lp-check">
                    <input type="checkbox" /> Remember me
                  </label>
                  <a href="#forgot" className="lp-forgot"
                     onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}>
                    Forgot password?
                  </a>
                </div>

                <button type="submit" className="lp-btn-primary" disabled={loginLoading}>
                  {loginLoading
                    ? <><i className="fa fa-spinner fa-spin"></i>&nbsp; Signing in…</>
                    : <><i className="fa fa-lock"></i>&nbsp; Enter {"α·SIM"} Dashboard</>}
                </button>

              </form>



              <p className="lp-terms">
                By logging in, you agree to our{" "}
                <a href="/terms">Terms &amp; Privacy Policy</a>
              </p>
            </div>

            {/* REGISTER */}
            <div className={"lp-panel" + (tab === "register" ? " active" : "")}>
              <form onSubmit={handleRegister}>

                <div className="lp-field">
                  <label>Username</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-user"></i>
                    <input type="text" placeholder="Choose a unique username" required autoComplete="username"
                      value={regUsername} onChange={(e) => setRegUsername(e.target.value)} />
                  </div>
                </div>

                <div className="lp-field-row">
                  <div className="lp-field">
                    <label>First Name</label>
                    <div className="lp-inp">
                      <i className="lp-ico fa fa-user"></i>
                      <input type="text" placeholder="First name" required autoComplete="given-name"
                        value={regFname} onChange={(e) => setRegFname(e.target.value)} />
                    </div>
                  </div>
                  <div className="lp-field">
                    <label>Last Name</label>
                    <div className="lp-inp">
                      <i className="lp-ico fa fa-user"></i>
                      <input type="text" placeholder="Last name" required autoComplete="family-name"
                        value={regLname} onChange={(e) => setRegLname(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="lp-field">
                  <label>Email Address</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-envelope"></i>
                    <input type="email" placeholder="you@email.com" required autoComplete="email"
                      value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                  </div>
                </div>

                <div className="lp-field">
                  <label>Create Password</label>
                  <div className="lp-inp">
                    <i className="lp-ico fa fa-lock"></i>
                    <input
                      type={showRegPass ? "text" : "password"}
                      placeholder="Min 8 characters" required autoComplete="new-password"
                      value={regPass} onChange={(e) => setRegPass(e.target.value)}
                    />
                    <i className={"lp-eye fa " + (showRegPass ? "fa-eye-slash" : "fa-eye")}
                       onClick={() => setShowRegPass(!showRegPass)} />
                  </div>
                  <PwdStrength password={regPass} />
                </div>

                <div className="lp-field" style={{ marginBottom:"1.125rem" }}>
                  <label style={{ display:"flex", alignItems:"flex-start", gap:".5rem",
                                  cursor:"pointer", fontSize:".9375rem", color:"#64748B", fontWeight:400 }}>
                    <input type="checkbox" required checked={regAgree}
                           onChange={(e) => setRegAgree(e.target.checked)}
                           style={{ marginTop:"3px", flexShrink:0, accentColor:"#00B67A" }} />
                    <span>
                      I agree to the{" "}<a href="/terms" className="lp-link">Terms of Service</a>
                      {" "}and{" "}<a href="/privacy" className="lp-link">Privacy Policy</a>
                    </span>
                  </label>
                </div>

                <button type="submit" className="lp-btn-primary" disabled={regLoading}>
                  {regLoading
                    ? <><i className="fa fa-spinner fa-spin"></i>&nbsp; Creating account…</>
                    : <><i className="fa fa-rocket"></i>&nbsp; Create Free Account &amp; Start Trading</>}
                </button>

              </form>

            </div>

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
    --green-lt:  #6EE7B7;
    --green-md:  #34D399;
    --r-sm: 10px; --r-md: 14px; --r-lg: 18px; --r-xl: 22px; --r-pill: 999px;
    --f-sans:    'Inter', -apple-system, system-ui, sans-serif;
    --f-display: 'Manrope', 'Inter', system-ui, sans-serif;
    --f-mono:    'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    --ease: all 0.2s cubic-bezier(0.4,0,0.2,1);

    display: grid;
    grid-template-columns: 55fr 45fr;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #060D1A;
    font-family: var(--f-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ══════════════════════════════════════════════════════
     LEFT — FULL BLEED (zero margin, zero border-radius)
     ══════════════════════════════════════════════════════ */
  .lp-left {
    background: linear-gradient(155deg, #050C18 0%, #06111E 45%, #091828 100%);
    display: flex;
    flex-direction: column;
    padding: 1.75rem 2.25rem 1.25rem;
    position: relative;
    overflow: hidden;
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
    top: 50%; right: 15%;
    transform: translateY(-50%);
    animation: lpGlowMid 12s ease-in-out infinite;
  }
  @keyframes lpGlowBl  { 0%,100%{transform:scale(1);opacity:.75} 50%{transform:scale(1.1);opacity:1} }
  @keyframes lpGlowMid { 0%,100%{transform:translateY(-50%) scale(1);opacity:.6} 50%{transform:translateY(-50%) scale(1.15);opacity:1} }

  /* Subtle dot grid background */
  .lp-grid {
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none; z-index: 0;
    mask-image: linear-gradient(to bottom right, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 100%);
    -webkit-mask-image: linear-gradient(to bottom right, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 100%);
  }

  /* Candlestick chart — background only, top-right quadrant */
  .lp-chart {
    position: absolute;
    top: 0; right: 0;
    width: 55%; height: 78%;
    opacity: 0.14;
    pointer-events: none;
    z-index: 1;
    /* Fade out toward the left so it never competes with text */
    -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 30%, rgba(0,0,0,0.3) 65%, transparent 100%);
    mask-image: linear-gradient(to left, rgba(0,0,0,1) 30%, rgba(0,0,0,0.3) 65%, transparent 100%);
  }

  /* Shield graphic — right-center, larger and more visible */
  .lp-shield {
    position: absolute;
    right: 3%; top: 52%;
    transform: translateY(-50%);
    width: 270px; height: 325px;
    opacity: 0.28;
    pointer-events: none;
    z-index: 1;
  }

  /* ── Logo ─────────────────────────────────────────── */
  .lp-logo {
    display: flex; align-items: center; gap: .75rem;
    flex-shrink: 0; position: relative; z-index: 2;
  }
  .lp-logo-icon {
    height: 40px; width: 40px; object-fit: contain;
  }
  .lp-logo-name {
    color: #FFFFFF;
    font-size: 1.5rem;
    font-weight: 700;
    font-family: var(--f-display);
    letter-spacing: -.02em;
    line-height: 1;
  }
  .lp-logo-badge {
    font-size: .72rem; font-weight: 700;
    background: rgba(0,182,122,0.15);
    color: #00B67A;
    border: 1px solid rgba(0,182,122,0.4);
    padding: .22rem .7rem;
    border-radius: var(--r-pill);
    letter-spacing: .05em;
  }

  /* ── Hero — scrollable internally, never overflows page ── */
  .lp-hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative; z-index: 2;
    padding: 1.5rem 0 1rem;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .lp-hero::-webkit-scrollbar { display: none; }

  .lp-left h1 {
    font-size: clamp(1.75rem, 3vw, 2.6rem);
    line-height: 1.18; letter-spacing: -.5px;
    font-weight: 800; font-family: var(--f-display);
    color: #FFFFFF; margin: 0 0 1.1rem;
  }
  .lp-accent-txt { color: #00B67A; }

  .lp-sub {
    font-size: .925rem;
    color: rgba(255,255,255,0.68); line-height: 1.7;
    max-width: 480px; margin-bottom: 1.35rem;
  }

  /* SEBI label */
  .lp-sebi-label {
    font-size: .72rem; font-weight: 700;
    color: #00B67A;
    text-transform: uppercase; letter-spacing: .14em;
    margin-bottom: 1rem;
  }

  /* Features */
  .lp-feats { display: flex; flex-direction: column; gap: .9rem; margin-bottom: 1.25rem; }

  .lp-feat {
    display: flex; align-items: center; gap: 1.1rem;
  }

  .lp-icon {
    width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    font-size: .9rem; flex-shrink: 0;
    background: linear-gradient(155deg, rgba(0,182,122,0.16), rgba(0,182,122,0.06));
    border: 1px solid rgba(0, 182, 122, 0.3);
    color: #00B67A;
    box-shadow: 0 0 12px rgba(0,182,122,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .lp-icon svg { width: 20px; height: 20px; }

  .lp-feat-txt { line-height: 1.4; }
  .lp-feat-txt strong {
    display: block; color: #FFFFFF;
    font-size: .9rem; font-weight: 600; margin-bottom: .15rem;
  }
  .lp-feat-txt span { display: block; color: rgba(255,255,255,0.55); font-size: .82rem; }

  /* Capital banner */
  .lp-capital {
    background: rgba(0,182,122,0.06);
    border: 1px solid rgba(0,182,122,0.18);
    border-radius: 14px;
    padding: 1rem 1.4rem;
    display: flex;
    align-items: center;
    gap: 1.1rem;
    width: 100%;
  }
  .lp-cap-icon {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: rgba(0,182,122,0.12); border: 1px solid rgba(0,182,122,0.25);
    display: flex; align-items: center; justify-content: center;
    color: #00B67A; font-size: 1rem;
  }
  .lp-cap-text {
    font-size: .875rem; color: rgba(255,255,255,0.8); line-height: 1.45;
  }
  .lp-cap-amt {
    font-weight: 700; color: #00B67A;
    font-family: var(--f-mono);
  }

  /* Trust strip — 5 items */
  .lp-trust {
    display: flex; align-items: center;
    justify-content: space-between; gap: .25rem;
    padding: .9rem 0 .5rem;
    flex-shrink: 0; position: relative; z-index: 2;
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .lp-trust span {
    display: inline-flex; align-items: center; justify-content: center; gap: .3rem;
    font-size: .7rem; font-weight: 500;
    color: rgba(255,255,255,0.55); white-space: nowrap;
    flex: 1;
  }
  .lp-trust span i { font-size: .8rem; color: rgba(0,182,122,0.8); }

  /* ══════════════════════════════════════════════════════
     RIGHT — pure white
     ══════════════════════════════════════════════════════ */
  .lp-right {
    background: #F8FAFC;
    display: flex; flex-direction: column; overflow: hidden;
    position: relative;
  }

  /* Nav is a static top row — NOT absolute, so it never overlaps the card */
  .lp-nav {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 1.5rem;
    padding: 1.5rem 2.5rem .75rem;
    flex-shrink: 0;
    z-index: 10;
  }
  .lp-nav a { font-size: .9rem; font-weight: 500; text-decoration: none; transition: color .18s; }
  .lpn-back   { color: #94A3B8; }
  .lpn-back:hover { color: #64748B; }
  .lpn-active { color: #00B67A !important; font-weight: 600; }
  .lpn-active:hover { color: #009B68 !important; }
  .lpn-muted  { color: #94A3B8; }
  .lpn-muted:hover { color: #64748B; }

  .lp-form-area {
    flex: 1; display: flex;
    align-items: center; justify-content: center;
    padding: 1rem 2rem 2rem;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .lp-form-area::-webkit-scrollbar { display: none; }

  /* ── Card ────────────────── */
  .lp-card {
    width: 100%; max-width: 480px;
    background: #FFFFFF;
    border-radius: 20px;
    padding: 2rem 2.5rem 1.75rem;
    border: 1.5px solid #E2E8F0;
    box-shadow:
      0 20px 40px rgba(15,23,42,0.04),
      0 4px 12px rgba(15,23,42,0.02);
  }

  .lp-card-head { text-align: center; margin-bottom: 1rem; }
  .lp-card-head h2 {
    font-size: 2rem; font-weight: 700;
    font-family: var(--f-display); color: #0F172A;
    letter-spacing: -.5px; margin: 0 0 .5rem; line-height: 1.15;
  }
  .lp-card-head p { font-size: 1.05rem; color: #64748B; line-height: 1.5; }

  /* Tabs */
  .lp-tabs {
    display: grid; grid-template-columns: 1fr 1fr;
    border: 1px solid #E2E8F0; border-radius: 14px;
    background: #F1F5F9;
    padding: 5px;
    margin-bottom: 1rem;
    gap: 5px;
  }
  .lp-tab {
    padding: .75rem 1rem; text-align: center;
    font-size: .95rem; font-weight: 600; color: #64748B;
    background: transparent; border: 2px solid transparent; cursor: pointer;
    font-family: var(--f-sans);
    border-radius: 10px;
    transition: all 0.2s ease;
    outline: none;
  }
  .lp-tab.active {
    background: #FFFFFF;
    color: #00B67A;
    border: 2px solid transparent;
    border-bottom: 2.5px solid #00B67A;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .lp-tab:not(.active):hover { color: #0F172A; }

  /* Fields */
  .lp-field { margin-bottom: 0.875rem; }
  .lp-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

  .lp-field > label {
    display: block; font-size: .95rem; font-weight: 600;
    color: #1E293B; margin-bottom: .5rem; letter-spacing: .01em;
  }
  .lp-inp { position: relative; }
  .lp-ico {
    position: absolute; left: 1.25rem; top: 50%;
    transform: translateY(-50%);
    color: #64748B; font-size: 1rem; pointer-events: none;
  }
  .lp-inp input {
    width: 100%; height: 50px;
    background: #FFFFFF; border: 1.5px solid #E2E8F0;
    border-radius: 12px;
    padding: 0 1rem 0 3.25rem;
    color: #0F172A; font-size: .95rem;
    font-family: var(--f-sans); outline: none; transition: var(--ease);
  }
  .lp-inp input::placeholder { color: #94A3B8; }
  .lp-inp input:focus {
    border-color: #00B67A;
    box-shadow: 0 0 0 4px rgba(0,182,122,0.08);
    background: #FFFFFF;
  }
  .lp-eye {
    position: absolute; right: 1.25rem; top: 50%;
    transform: translateY(-50%);
    color: #64748B; cursor: pointer; font-size: 1.05rem; transition: color .18s;
  }
  .lp-eye:hover { color: #00B67A; }

  .lp-row {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 1.25rem;
  }
  .lp-check {
    display: flex; align-items: center; gap: .5rem;
    font-size: .95rem; color: #64748B; cursor: pointer;
    user-select: none;
  }
  .lp-check input[type="checkbox"] {
    accent-color: #00B67A;
    width: 16px; height: 16px;
    cursor: pointer;
  }
  .lp-forgot {
    font-size: .95rem; color: #00B67A;
    text-decoration: none; font-weight: 600; transition: color .18s;
  }
  .lp-forgot:hover { color: #009B68; text-decoration: underline; }

  /* Primary button */
  .lp-btn-primary {
    width: 100%; height: 50px;
    border-radius: 12px;
    background: linear-gradient(90deg, #00B67A 0%, #009E6A 100%);
    color: #FFFFFF; font-size: 1rem; font-weight: 600;
    font-family: var(--f-sans); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: .5rem;
    margin-bottom: 1rem;
    box-shadow: 0 10px 25px rgba(0, 182, 122, 0.15);
    letter-spacing: .01em; transition: var(--ease);
  }
  .lp-btn-primary:hover  { transform: translateY(-1px); box-shadow: 0 12px 30px rgba(0,182,122,0.35); }
  .lp-btn-primary:active { transform: translateY(0);    box-shadow: 0 6px 16px rgba(0,182,122,0.2); }
  .lp-btn-primary:disabled { opacity:.6; cursor:not-allowed; transform:none; box-shadow:none; }

  .lp-or {
    display: flex; align-items: center; gap: 1rem;
    margin: 1rem 0;
    color: #94A3B8; font-size: .9rem; font-weight: 500;
  }
  .lp-or::before,.lp-or::after { content:''; flex:1; height:1px; background:#E2E8F0; }

  .lp-btn-google {
    width: 100%; height: 50px;
    border-radius: 12px; background: #FFFFFF;
    border: 1.5px solid #E2E8F0; color: #0F172A;
    font-size: .95rem; font-weight: 600;
    font-family: var(--f-sans); cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: .7rem;
    margin-bottom: 1rem; transition: var(--ease);
  }
  .lp-btn-google:hover { background: #F8FAFC; border-color: #CBD5E1; transform: translateY(-1px); }
  .lp-btn-google:disabled { opacity:.6; cursor:not-allowed; }

  .lp-terms {
    font-size: .9rem; color: #64748B;
    text-align: center; line-height: 1.6;
    margin-top: 1rem;
  }
  .lp-terms a { color: #00B67A; font-weight: 600; text-decoration: none; }
  .lp-terms a:hover { color: #009B68; text-decoration: underline; }

  .lp-link { color: #00B67A; font-weight: 600; text-decoration: none; }
  .lp-link:hover { color: #009B68; text-decoration: underline; }

  .lp-switch {
    margin-top: 1rem; padding-top: 0.875rem;
    border-top: 1px solid #E2E8F0;
    text-align: center; font-size: .95rem; color: #64748B;
  }
  .lp-switch a {
    color: #00B67A; font-weight: 600; text-decoration: none;
    display: inline-flex; align-items: center; gap: .3rem;
    transition: gap .18s, color .18s;
  }
  .lp-switch a:hover { color: #009B68; gap: .45rem; }

  .lp-panel { display: none; }
  .lp-panel.active { display: block; }

  .pwd-strength { margin-top:.375rem; display:flex; gap:4px; }
  .pwd-bar { flex:1; height:3px; border-radius:2px; background:#E8EDF5; transition:background .3s; }
  .pwd-bar.weak   { background:#EF4444; }
  .pwd-bar.medium { background:#F59E0B; }
  .pwd-bar.strong { background:#00B67A; }

  /* ══════════════════════════════════════════════════════
     RESPONSIVE
     ══════════════════════════════════════════════════════ */
  @media (min-width: 1440px) {
    .lp-left      { padding: 1.75rem 2.75rem 1.25rem; }
    .lp-nav       { padding: 2rem 3rem 1rem; }
    .lp-form-area { padding: 1rem 2.5rem 2.5rem; }
    .lp-card      { max-width: 480px; padding: 2rem 2.5rem 2rem; }
    .lp-card-head h2 { font-size: 2.125rem; }
    .lp-left h1   { font-size: 2.25rem; }
    .lp-feat-txt strong { font-size: .9rem; }
    .lp-feat-txt span { font-size: .8rem; }
  }

  @media (max-width: 1280px) and (min-width: 901px) {
    .lp-left      { padding: 1.25rem 1.75rem .85rem; }
    .lp-nav       { padding: 1.25rem 2rem .5rem; gap: 1.25rem; }
    .lp-form-area { padding: .75rem 1.5rem 1.75rem; }
    .lp-card      { max-width: 460px; padding: 1.75rem 2.25rem 1.5rem; }
    .lp-left h1   { font-size: clamp(1.375rem, 2.8vw, 2rem); }
    .lp-card-head h2 { font-size: 1.75rem; }
    .lp-feats     { gap: .35rem; }
    .lp-sub       { margin-bottom: .5rem; }
    .lp-sebi-label { margin-bottom: .45rem; }
    .lp-capital   { padding: .7rem 1rem; }
    .lp-shield    { width: 180px; height: 215px; }
  }

  @media (max-width: 900px) {
    .lp-shell     { grid-template-columns: 1fr; }
    .lp-left      { display: none; }
    .lp-right     { height: 100dvh; }
    .lp-nav       { justify-content: center; padding: 1.25rem 1.5rem .5rem; gap: 1.25rem; }
    .lp-form-area { padding: .5rem 1.5rem 2.5rem; align-items: flex-start; overflow-y: auto; }
    .lp-card      { max-width: 520px; margin: 0 auto; box-shadow: 0 10px 30px rgba(15,23,42,0.04); }
  }

  @media (max-width: 680px) {
    .lp-nav a     { font-size: .85rem; }
    .lp-nav       { gap: 1rem; padding: 0 1.25rem; }
    .lp-form-area { padding: 0 1.25rem 2rem; }
    .lp-card      { padding: 2.25rem 2.5rem 2rem; border-radius: 16px; }
    .lp-card-head h2 { font-size: 1.75rem; }
    .lp-inp input { height: 54px; }
    .lp-btn-primary { height: 54px; }
    .lp-btn-google  { height: 54px; }
  }

  @media (max-width: 480px) {
    .lp-nav       { padding: 0 1rem; gap: 1rem; margin: 1.25rem auto .75rem; }
    .lp-nav a     { font-size: .8rem; }
    .lp-form-area { padding: 0 1rem 2rem; overflow-y: auto; }
    .lp-card      { max-width: 100%; padding: 1.75rem 1.25rem; box-shadow: none; border: none; background: transparent; }
    .lp-card-head h2 { font-size: 1.5rem; }
    .lp-card-head p  { font-size: .95rem; }
    .lp-tabs      { margin-bottom: 1.5rem; }
    .lp-tab       { padding: .8rem .5rem; font-size: .9rem; }
    .lp-field-row { grid-template-columns: 1fr; gap: 0; }
    .lp-field     { margin-bottom: 1.125rem; }
    .lp-field > label { font-size: .9rem; }
    .lp-inp input { height: 52px; font-size: .9rem; }
    .lp-btn-primary { height: 52px; font-size: .95rem; }
    .lp-btn-google  { height: 52px; font-size: .95rem; }
    .lp-row       { margin-bottom: 1.25rem; }
    .lp-check, .lp-forgot { font-size: .9rem; }
    .lp-terms     { font-size: .85rem; }
    .lp-switch    { font-size: .9rem; }
  }

  @media (max-height: 600px) and (orientation: landscape) {
    .lp-shell    { height: auto; min-height: 100dvh; grid-template-columns: 1fr; overflow-y: auto; }
    .lp-left     { display: none; }
    .lp-right    { height: auto; min-height: 100dvh; }
    .lp-form-area{ overflow-y: visible; }
  }
`;
