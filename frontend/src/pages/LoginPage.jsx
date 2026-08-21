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

        {/* Candlestick chart — top-right, full height, diagonal rise */}
        <div className="lp-chart" aria-hidden>
          <svg viewBox="0 0 360 480" preserveAspectRatio="xMaxYMin meet" width="100%" height="100%">
            {/* Rising green candles */}
            <g opacity="0.9">
              <line x1="40" y1="380" x2="40" y2="340" stroke="#00B67A" strokeWidth="2"/>
              <rect x="32" y="345" width="16" height="30" fill="#00B67A" rx="2"/>
              <line x1="80" y1="340" x2="80" y2="295" stroke="#00B67A" strokeWidth="2"/>
              <rect x="72" y="302" width="16" height="32" fill="#00B67A" rx="2"/>
              <line x1="120" y1="305" x2="120" y2="258" stroke="#00B67A" strokeWidth="2"/>
              <rect x="112" y="265" width="16" height="35" fill="#00B67A" rx="2"/>
              <line x1="200" y1="238" x2="200" y2="190" stroke="#00B67A" strokeWidth="2"/>
              <rect x="192" y="196" width="16" height="36" fill="#00B67A" rx="2"/>
              <line x1="240" y1="198" x2="240" y2="152" stroke="#00B67A" strokeWidth="2"/>
              <rect x="232" y="158" width="16" height="34" fill="#00B67A" rx="2"/>
              <line x1="280" y1="158" x2="280" y2="110" stroke="#00B67A" strokeWidth="2"/>
              <rect x="272" y="116" width="16" height="36" fill="#00B67A" rx="2"/>
              <line x1="320" y1="112" x2="320" y2="65" stroke="#00B67A" strokeWidth="2"/>
              <rect x="312" y="70" width="16" height="36" fill="#00B67A" rx="2"/>
            </g>
            {/* Bearish red candles mixed in */}
            <g opacity="0.85">
              <line x1="160" y1="275" x2="160" y2="232" stroke="#F87171" strokeWidth="2"/>
              <rect x="152" y="238" width="16" height="30" fill="#F87171" rx="2"/>
              <line x1="360" y1="68" x2="360" y2="32" stroke="#F87171" strokeWidth="2"/>
              <rect x="352" y="36" width="16" height="26" fill="#F87171" rx="2"/>
            </g>
            {/* Trend line */}
            <polyline
              points="40,360 80,318 120,282 160,254 200,214 240,175 280,130 320,88 360,52"
              fill="none" stroke="#00B67A" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3"
            />
          </svg>
        </div>

        {/* Shield graphic — positioned right-center */}
        <div className="lp-shield" aria-hidden>
          <svg viewBox="0 0 200 240" width="100%" height="100%">
            <defs>
              <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a3a4a"/>
                <stop offset="100%" stopColor="#0d2535"/>
              </linearGradient>
              <linearGradient id="shieldEdge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00B67A" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#00B67A" stopOpacity="0.1"/>
              </linearGradient>
            </defs>
            {/* Shield body */}
            <path d="M100 8 L180 40 L180 120 C180 168 142 200 100 218 C58 200 20 168 20 120 L20 40 Z"
              fill="url(#shieldGrad)" stroke="url(#shieldEdge)" strokeWidth="2"/>
            {/* Inner shield highlight */}
            <path d="M100 22 L168 50 L168 118 C168 160 134 190 100 206 C66 190 32 160 32 118 L32 50 Z"
              fill="rgba(0,182,122,0.05)" stroke="rgba(0,182,122,0.15)" strokeWidth="1"/>
            {/* Checkmark */}
            <polyline points="60,118 88,145 145,90" fill="none"
              stroke="#00B67A" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
              opacity="0.9"/>
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
              <div className="lp-icon"><i className="fa fa-file-contract"></i></div>
              <div className="lp-feat-txt">
                <strong>Educational Purpose Only</strong>
                <span>Solely for learning & simulation. Not for real trading.</span>
              </div>
            </div>

            <div className="lp-feat">
              <div className="lp-icon"><i className="fa fa-ban"></i></div>
              <div className="lp-feat-txt">
                <strong>No Real Money or Advisory</strong>
                <span>No real funds, no investment advice, no guarantees.</span>
              </div>
            </div>

            <div className="lp-feat">
              <div className="lp-icon"><i className="fa fa-chart-bar"></i></div>
              <div className="lp-feat-txt">
                <strong>Data from Authorised Sources</strong>
                <span>NSE &amp; BSE data displayed per SEBI guidelines.</span>
              </div>
            </div>

            <div className="lp-feat">
              <div className="lp-icon"><i className="fa fa-scale-balanced"></i></div>
              <div className="lp-feat-txt">
                <strong>Transparent &amp; Fair</strong>
                <span>Clear pricing, unbiased educational content.</span>
              </div>
            </div>

            <div className="lp-feat">
              <div className="lp-icon"><i className="fa fa-lock"></i></div>
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
    background: linear-gradient(155deg, #060D1A 0%, #071422 50%, #0A1B2E 100%);
    display: flex;
    flex-direction: column;
    padding: 1.5rem 2rem 1rem;
    position: relative;
    overflow: hidden;
    scrollbar-width: none;
  }
  .lp-left::-webkit-scrollbar { display: none; }

  .lp-glow { position: absolute; border-radius: 50%; pointer-events: none; z-index: 0; }
  .lp-glow-tr {
    width: 640px; height: 640px;
    background: radial-gradient(circle, rgba(0,182,122,0.07) 0%, transparent 62%);
    top: -230px; right: -180px;
  }
  .lp-glow-bl {
    width: 480px; height: 480px;
    background: radial-gradient(circle, rgba(0,155,185,0.06) 0%, transparent 65%);
    bottom: -150px; left: -110px;
    animation: lpGlow 9s ease-in-out infinite;
  }
  @keyframes lpGlow { 0%,100%{transform:scale(1);opacity:.75} 50%{transform:scale(1.08);opacity:1} }

  /* Candlestick chart — top-right, diagonal rising bars */
  .lp-chart {
    position: absolute;
    top: 0; right: 0;
    width: 58%; height: 60%;
    opacity: 0.6; pointer-events: none;
    z-index: 1;
  }

  /* Shield graphic — right center */
  .lp-shield {
    position: absolute;
    right: -2%; top: 50%;
    transform: translateY(-55%);
    width: 220px; height: 265px;
    opacity: 0.22;
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
    padding: 1.25rem 0 .75rem;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .lp-hero::-webkit-scrollbar { display: none; }

  .lp-left h1 {
    font-size: clamp(1.65rem, 2.8vw, 2.5rem);
    line-height: 1.18; letter-spacing: -.5px;
    font-weight: 800; font-family: var(--f-display);
    color: #FFFFFF; margin: 0 0 .9rem;
  }
  .lp-accent-txt { color: #00B67A; }

  .lp-sub {
    font-size: .9rem;
    color: rgba(255,255,255,0.68); line-height: 1.65;
    max-width: 480px; margin-bottom: 1rem;
  }

  /* SEBI label */
  .lp-sebi-label {
    font-size: .7rem; font-weight: 700;
    color: #00B67A;
    text-transform: uppercase; letter-spacing: .12em;
    margin-bottom: .85rem;
  }

  /* Features */
  .lp-feats { display: flex; flex-direction: column; gap: .65rem; margin-bottom: 1rem; }

  .lp-feat {
    display: flex; align-items: center; gap: 1rem;
  }

  .lp-icon {
    width: 38px; height: 38px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: .9rem; flex-shrink: 0;
    background: rgba(0, 182, 122, 0.12);
    border: 1px solid rgba(0, 182, 122, 0.25);
    color: #00B67A;
  }

  .lp-feat-txt { line-height: 1.35; }
  .lp-feat-txt strong {
    display: block; color: #FFFFFF;
    font-size: .875rem; font-weight: 600; margin-bottom: .1rem;
  }
  .lp-feat-txt span { display: block; color: rgba(255,255,255,0.55); font-size: .8rem; }

  /* Capital banner */
  .lp-capital {
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: .85rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
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
