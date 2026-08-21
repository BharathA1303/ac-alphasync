import { useState, useEffect } from "react";

import toast from "react-hot-toast";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck, User, X } from "lucide-react";
import { useBrokerStore } from "../../stores/useBrokerStore";
import BrokerLogo from "./BrokerLogo";
import { getBrokerMeta } from "./brokerMeta";

/**
 * Unified "Add Broker Account" modal — replaces the old separate
 * credentials-modal + OAuth-redirect-modal two-step flow.
 *
 * One screen collects everything: App Key/Secret, the user's broker
 * Client ID, and (optionally) a trading password + DOB/PAN (Zebu) or
 * TOTP secret (Alice Blue). Submitting saves the credentials, then
 * immediately tries to connect — if a password was given, the backend
 * authenticates headlessly with zero browser interaction; otherwise the
 * browser is sent to the broker's own login page one time.
 */
const FIELD_CONFIG = {
  zebu: [
    { key: "api_key", label: "App Key", sublabel: "(from MYNT portal → Client Code → API Key)", placeholder: "Paste MYNT App Key", required: true },
    { key: "api_secret", label: "Secret Key", sublabel: "(OAuth secret — optional for API-only accounts)", placeholder: "Paste OAuth Secret if you have one", required: false, secret: true },
    { key: "client_id", label: "Zebu User ID", sublabel: "(required)", placeholder: "Your Zebu User ID", required: true },
    { key: "factor2", label: "Date of Birth / PAN", sublabel: "(required for API login)", placeholder: "e.g. 01-01-1990 or ABCDE1234", required: true },
    { key: "trading_password", label: "Trading Password", sublabel: "(required for API login)", placeholder: "Your Zebu login password", required: true, secret: true },
    { key: "vendor_code", label: "Vendor Code", sublabel: "(optional — defaults to User ID)", placeholder: "Your Zebu Vendor Code", required: false },
  ],
  aliceblue: [
    { key: "api_key", label: "App Key", sublabel: "(API Key)", placeholder: "Paste AliceBlue App Key", required: true },
    { key: "api_secret", label: "App Secret Key", sublabel: "(apiSecret — required)", placeholder: "Paste apiSecret from a3.aliceblueonline.com (Apps)", required: true, secret: true },
    { key: "client_id", label: "AliceBlue User ID", sublabel: "(required)", placeholder: "e.g. AB1234 — your AliceBlue User ID", required: true },
    { key: "trading_password", label: "Trading Password", sublabel: "(optional — for auto-refresh)", placeholder: "Your AliceBlue login password", required: false, secret: true },
    { key: "totp_secret", label: "TOTP Secret", sublabel: "(optional — for auto-refresh)", placeholder: "Base32 TOTP seed from AliceBlue 2FA setup", required: false, secret: true },
    { key: "algo_id", label: "Algo ID", sublabel: "(optional — not used by AliceBlue ANT API)", placeholder: "Leave blank — algoid not sent", required: false },
  ],
};

function ZebuHelpPanel({ redirectUrl }) {
  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUrl);
      toast.success("Redirect URL copied");
    } catch {
      toast.error("Could not copy — select and copy the URL manually");
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/80 to-slate-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50/60">
        <p className="text-sm font-bold text-slate-900">How to connect Zebull (Mynt)</p>
        <p className="text-[11px] text-slate-500 mt-0.5">One-time setup — takes about 2 minutes</p>
      </div>

      <ol className="px-4 py-3 space-y-3 text-xs text-slate-700 leading-relaxed list-none">
        <li className="flex gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
          <span>
            Log in to the <strong>MYNT developer portal</strong> at{" "}
            <a href="https://go.mynt.in" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-semibold underline">go.mynt.in</a>
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
          <span>
            Go to <strong>Client Code → API Key</strong> and copy your <strong>App Key</strong> into the field above.
            Most API-only accounts do <strong>not</strong> need an OAuth Secret Key.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
          <span>
            Enter your <strong>Zebu User ID</strong>, <strong>Trading Password</strong>, and{" "}
            <strong>Date of Birth</strong> (DD-MM-YYYY) or <strong>PAN</strong> — this is <em>not</em> a TOTP/OTP code.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">4</span>
          <div className="min-w-0 flex-1">
            <span className="block mb-1.5">
              <strong>Only if you have OAuth access:</strong> in the MYNT portal, set your Redirect URL to:
            </span>
            <div className="flex items-stretch gap-1.5">
              <code className="flex-1 text-[10px] font-mono bg-white border border-slate-200 rounded-lg px-2 py-1.5 break-all text-slate-800">
                {redirectUrl}
              </code>
              <button
                type="button"
                onClick={copyRedirect}
                className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                Copy
              </button>
            </div>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">5</span>
          <span>
            Click <strong>Add Broker</strong>. Sessions expire at midnight IST — with password + DOB saved,
            AlphaSync reconnects automatically each day.
          </span>
        </li>
      </ol>

      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-900">
        <strong>API-only accounts:</strong> if MYNT shows &quot;Access Restricted for API Only Users&quot; in the browser,
        ignore OAuth — use Trading Password + DOB/PAN above instead.
      </div>
    </div>
  );
}

function HelpBox({ broker, redirectUrl }) {
  if (broker === "zebu") {
    return <ZebuHelpPanel redirectUrl={redirectUrl} />;
  }
  return (
    <div className="text-xs text-slate-600 leading-relaxed p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <p className="font-semibold text-slate-700 mb-1.5">Alice Blue setup (one-time):</p>
      <ol className="list-decimal list-inside space-y-1">
        <li>Get <strong>App Key</strong> + <strong>API Secret</strong> from a3.aliceblueonline.com → Apps</li>
        <li>In the Apps page set <strong>Redirect URL</strong> to <span className="font-mono text-[11px] break-all">{redirectUrl}</span></li>
        <li>In the same Apps page, find <strong>IP Whitelist</strong> — add this server's outbound IP (shown on the Trade page as "Server IP")</li>
        <li>Enter your AliceBlue User ID (e.g. AB1234) as the Client ID</li>
        <li>Leave <strong>Algo ID</strong> blank — Alice Blue's ANT API doesn't require it for manual orders</li>
      </ol>
      <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
        <strong>⚠️ Crucial Redirect Warning:</strong> If you are currently logged into the Alice Blue web trading platform (ant.aliceblueonline.com) in this browser, Alice Blue will skip the redirect and land you in their dashboard. <strong>You must log out of ant.aliceblueonline.com first</strong> or run this connect flow in an <strong>Incognito / Private Window</strong>.
      </div>
      <p className="mt-2">
        <strong>Optional:</strong> enter Trading Password + TOTP Secret to enable automatic
        daily reconnect — without them, Refresh opens a one-click login page each day.
      </p>
      <p className="mt-2">
        <strong>Most common rejection:</strong> "IP restriction" — fix by whitelisting the
        server IP in step 3.
      </p>
    </div>
  );
}

export default function AddBrokerAccountModal({ open, onClose, broker, brokerName, color, logoText, onConnected }) {
  const fields = FIELD_CONFIG[broker] || [];
  const brokerMeta = getBrokerMeta(broker) || { broker, name: brokerName, color, logoText };
  const [values, setValues] = useState({});
  const [displayName, setDisplayName] = useState("");
  const [showSecret, setShowSecret] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [zebuStep, setZebuStep] = useState(1);
  const saveCredentials = useBrokerStore((s) => s.saveCredentials);
  const refreshSession = useBrokerStore((s) => s.refreshSession);
  const storeOAuthContext = useBrokerStore((s) => s.storeOAuthContext);
  const clearCredentials = useBrokerStore((s) => s.clearCredentials);
  const fetchCredentialsStatus = useBrokerStore((s) => s.fetchCredentialsStatus);
  const brokerData = useBrokerStore((s) => s.brokers[broker] || {});
  const isConfigured = brokerData.credentialsConfigured;
  const loading = useBrokerStore((s) => s.loading);
  const serverIp = useBrokerStore((s) => s.serverIp) || "147.93.168.157";

  useEffect(() => {
    if (open && broker) {
      fetchCredentialsStatus(broker);
    }
  }, [open, broker, fetchCredentialsStatus]);

  useEffect(() => {
    if (open) {
      setZebuStep(1);
      setValues({});
      setDisplayName("");
    }
  }, [open]);

  if (!open) return null;

  const handleClearCredentials = async () => {
    if (!window.confirm(`Are you sure you want to delete and clear all saved credentials for ${brokerName}?`)) {
      return;
    }
    try {
      await clearCredentials(broker);
      setValues({});
      setDisplayName("");
      setZebuStep(1);
      toast.success("Credentials cleared successfully. You can now enter them freshly.");
    } catch (err) {
      toast.error(err.message || "Failed to clear credentials");
    }
  };

  const isZebuValid = (values.client_id || "").trim() &&
                      (values.trading_password || "").trim() &&
                      (values.factor2 || "").trim() &&
                      (values.api_key || "").trim();

  const requiredFilled = broker === "zebu" ? isZebuValid : fields.filter((f) => f.required).every((f) => (values[f.key] || "").trim());
  const redirectUrl = `${window.location.origin}/broker/callback?broker=${broker}`;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const payload = broker === "zebu" ? {
      ...values,
      display_name: values.client_id,
      vendor_code: values.client_id
    } : { ...values, display_name: displayName };

    const requiredFields = broker === "zebu" ? ["client_id", "trading_password", "factor2", "api_key"] : fields.filter(f => f.required).map(f => f.key);
    const allFilled = requiredFields.every(key => (payload[key] || "").trim());

    if (!allFilled) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      await saveCredentials(broker, payload);
      const result = await refreshSession(broker);
      if (result.reauth_required && result.oauth_blocked) {
        toast.error(result.message || "Add your Trading Password and DOB/PAN to connect.");
        return;
      }
      if (result.reauth_required && result.redirect_url) {
        storeOAuthContext(broker, result.state);
        window.location.href = result.redirect_url;
        return;
      }
      toast.success(`${brokerName} connected!`);
      onConnected?.(result);
    } catch (err) {
      toast.error(err.message || "Failed to connect broker");
    } finally {
      setSubmitting(false);
    }
  };

  const renderZebuStepContent = () => {
    switch (zebuStep) {
      case 1:
        return (
          <div className="space-y-4 animate-fadeIn">
            {isConfigured && (
              <div className="p-3.5 rounded-xl border border-red-200/60 bg-red-50/20 flex items-center justify-between gap-3 text-xs">
                <div className="text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Saved Config:</span> Existing credentials stored.
                </div>
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm outline-none"
                >
                  Clear Credentials
                </button>
              </div>
            )}
            
            <div className="text-center pb-1">
              <h3 className="text-sm font-bold text-slate-800">Step 1: Enter User ID & Password</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Connect your Mynt broker account</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Zebu User ID (Client Code) <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={values.client_id || ""}
                  onChange={(e) => setValues((v) => ({ ...v, client_id: e.target.value.toUpperCase() }))}
                  placeholder="e.g. TNCKTOI"
                  className="broker-cred-input w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Trading Password <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showSecret.trading_password ? "text" : "password"}
                  value={values.trading_password || ""}
                  onChange={(e) => setValues((v) => ({ ...v, trading_password: e.target.value }))}
                  placeholder="Your Zebu login password"
                  className="broker-cred-input w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                />
                <button type="button" onClick={() => setShowSecret((s) => ({ ...s, trading_password: !s.trading_password }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showSecret.trading_password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Guide Panel */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3.5 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Where to get User ID?
              </div>
              <p className="leading-relaxed">
                Log in to your <strong>Zebull / Mynt</strong> portal. Click the profile name/initials menu in the top right. 
                Your <strong>Client ID (User ID)</strong> is displayed under your name (e.g. <strong>TNCKTOI</strong>) as shown in the profile avatar menu.
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center pb-1">
              <h3 className="text-sm font-bold text-slate-800">Step 2: Second Factor Verification</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Provide secondary authentication details</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Date of Birth or PAN Card <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={values.factor2 || ""}
                  onChange={(e) => setValues((v) => ({ ...v, factor2: e.target.value }))}
                  placeholder="e.g. 25-12-1990 or ABCDE1234F"
                  className="broker-cred-input w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Guide Panel */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3.5 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                DOB / PAN format
              </div>
              <p className="leading-relaxed">
                Zebu developer APIs require secondary login details. Enter your <strong>Date of Birth</strong> (DD-MM-YYYY format, e.g. 15-08-1995) 
                or your <strong>PAN card</strong> number. This is safely processed directly with the Zebu portal.
              </p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center pb-1">
              <h3 className="text-sm font-bold text-slate-800">Step 3: Developer API Keys</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Get your MYNT API App Key and Secret Key</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Developer API Key (App Key) <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={values.api_key || ""}
                  onChange={(e) => setValues((v) => ({ ...v, api_key: e.target.value }))}
                  placeholder="Paste your MYNT App Key"
                  className="broker-cred-input w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Secret Key (OAuth Secret) <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showSecret.api_secret ? "text" : "password"}
                  value={values.api_secret || ""}
                  onChange={(e) => setValues((v) => ({ ...v, api_secret: e.target.value }))}
                  placeholder="Paste OAuth Secret if you have one"
                  className="broker-cred-input w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                />
                <button type="button" onClick={() => setShowSecret((s) => ({ ...s, api_secret: !s.api_secret }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showSecret.api_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Guide Panel */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3.5 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Where are the API Keys?
              </div>
              <p className="leading-relaxed">
                1. Go to the profile menu at the top-right in your Mynt portal and click <strong>Setting</strong>.<br/>
                2. Expand the <strong>API Key</strong> row.<br/>
                3. Open the <strong>Base Key</strong> tab to copy your <strong>App Key</strong>.<br/>
                4. Open the <strong>OAuth Key</strong> tab to copy your <strong>Secret Code</strong> (OAuth Secret Key).
              </p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center pb-1">
              <h3 className="text-sm font-bold text-slate-800">Step 4: Configure Redirect URL</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Almost done! Set the callback link in Zebu settings</p>
            </div>

            {/* Copy redirect URL box */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-600">Redirect URL</span>
              <div className="flex items-stretch gap-1.5">
                <code className="flex-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 break-all text-slate-800 select-all">
                  {redirectUrl}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(redirectUrl);
                    toast.success("Redirect URL copied!");
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Copy server IP box */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-600">Primary IP Address (Server IP)</span>
              <div className="flex items-stretch gap-1.5">
                <code className="flex-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 break-all text-slate-800 select-all">
                  {serverIp}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(serverIp);
                    toast.success("Server IP address copied!");
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Guide Panel */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3.5 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                OAuth Setup Steps
              </div>
              <p className="leading-relaxed">
                1. Under the <strong>API Key</strong> section in settings, switch to the <strong>OAuth Key</strong> tab.<br/>
                2. Set the <strong>Redirect URL</strong> exactly to the link above.<br/>
                3. Set the <strong>Primary IP Address</strong> exactly to the Server IP shown above.<br/>
                4. The Vendor Code and Account name will be matched to your User ID automatically.<br/>
                5. Press <strong>Connect Broker</strong> to finish the login.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderZebuFooter = () => {
    const isStep1Valid = (values.client_id || "").trim() && (values.trading_password || "").trim();
    const isStep2Valid = (values.factor2 || "").trim();
    const isStep3Valid = (values.api_key || "").trim();
    const isAllValid = isStep1Valid && isStep2Valid && isStep3Valid;

    return (
      <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-3 bg-slate-50/40">
        <div className="flex items-center gap-1.5 justify-center px-3 py-2 rounded-full bg-slate-50 border border-slate-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[10px] text-slate-600 text-center">
            Encrypted at rest · used only to fetch live prices for your demo account
          </span>
        </div>
        <div className="flex items-center gap-2">
          {zebuStep === 1 ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setZebuStep((s) => s - 1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
          )}

          {zebuStep < 4 ? (
            <button
              type="button"
              disabled={
                (zebuStep === 1 && !isStep1Valid) ||
                (zebuStep === 2 && !isStep2Valid) ||
                (zebuStep === 3 && !isStep3Valid)
              }
              onClick={() => setZebuStep((s) => s + 1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white transition-all duration-300 disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !isAllValid}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white transition-all duration-300 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #059669, #047857)", boxShadow: busy || !isAllValid ? "none" : "0 4px 20px rgba(5,150,105,.25)" }}
            >
              {busy ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Connecting...</>
              ) : (
                <>Connect Broker <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const busy = loading || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-fadeIn"
        style={{ background: "#ffffff", boxShadow: "0 32px 80px rgba(2,8,23,0.25)" }}
      >
        {broker === "zebu" && busy && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
              <div className="absolute inset-0 rounded-full border-4 border-t-emerald-600 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-600 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-slate-800 animate-pulse">Connecting Zebu Account...</p>
              <p className="text-xs text-slate-500">Securing session tokens & configuring API data</p>
            </div>
            <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 w-1/2 rounded-full absolute animate-loadingProgress" />
            </div>
          </div>
        )}

        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10">
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Add Broker Account</h2>
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <BrokerLogo broker={brokerMeta} size="sm" />
            <div className="text-sm font-semibold text-slate-900">{brokerName}</div>
          </div>
        </div>

        {broker === "zebu" && (
          <div className="w-full h-1 bg-slate-100 relative flex-shrink-0">
            <div
              className={`h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 transition-all duration-500 ${busy ? "bg-[length:200%_auto] animate-shimmer" : ""}`}
              style={{ width: `${(zebuStep / 4) * 100}%` }}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {broker === "zebu" ? (
            <div className="px-6 py-5">
              {renderZebuStepContent()}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Account Display Name <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. My Primary Account"
                    className="broker-cred-input w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              {isConfigured && (
                <div className="p-3.5 rounded-xl border border-red-200/60 bg-red-50/20 flex items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600 leading-relaxed">
                    <span className="font-bold text-slate-800">Saved Configuration:</span> An existing app key/credentials config {brokerData.apiKeyPreview ? `(${brokerData.apiKeyPreview})` : ''} is stored in the database.
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCredentials}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm outline-none"
                  >
                    Clear Credentials
                  </button>
                </div>
              )}

              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-1">Credentials</p>

              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {f.label} {f.sublabel && <span className="text-slate-400 font-normal">{f.sublabel}</span>}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={f.secret && !showSecret[f.key] ? "password" : "text"}
                      value={values[f.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="broker-cred-input w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                    />
                    {f.secret && (
                      <button type="button" onClick={() => setShowSecret((s) => ({ ...s, [f.key]: !s[f.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        {showSecret[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-2">Setup guide</p>
              <HelpBox broker={broker} redirectUrl={redirectUrl} />
            </form>
          )}
        </div>

        {broker === "zebu" ? (
          renderZebuFooter()
        ) : (
          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-3">
            <div className="flex items-center gap-1.5 justify-center px-3 py-2 rounded-full bg-slate-50 border border-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] text-slate-600 text-center">
                Encrypted at rest · used only to fetch live prices for your demo account — no real orders are placed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy || !requiredFilled}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white transition-all duration-300 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #059669, #047857)", boxShadow: busy || !requiredFilled ? "none" : "0 4px 20px rgba(5,150,105,.25)" }}
              >
                {busy ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Connecting...</>
                ) : (
                  <>Add Broker <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        .broker-cred-input { color: #0f172a; caret-color: #0f172a; }
        .broker-cred-input::placeholder { color: #94a3b8; opacity: 1; }
        .broker-cred-input:-webkit-autofill, .broker-cred-input:-webkit-autofill:hover,
        .broker-cred-input:-webkit-autofill:focus, .broker-cred-input:-webkit-autofill:active {
          -webkit-text-fill-color: #0f172a !important;
          box-shadow: 0 0 0px 1000px #f8fafc inset !important;
        }
        @keyframes stepFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fadeIn {
          animation: stepFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes loadingProgress {
          0% { left: -50%; }
          100% { left: 100%; }
        }
        .animate-loadingProgress {
          animation: loadingProgress 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2.5s linear infinite;
        }
      `}</style>
    </div>
  );
}
