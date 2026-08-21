/**
 * useAuthStore.js — Direct username/password auth (no Firebase for login/register).
 *
 * Flow:
 *  1. User submits username + password form
 *  2. Frontend calls POST /api/auth/register-direct  OR  POST /api/auth/login-direct
 *  3. Backend returns { token, user }
 *  4. JWT token stored in localStorage and sent as Bearer on every API call
 *  5. All subsequent API calls use this JWT
 *
 * Firebase is NOT used for login/register. Firebase SDK is still imported
 * for Google sign-in (disabled for now) and the initAuth listener gracefully
 * handles the absence of a Firebase session.
 */
import { create } from 'zustand';
import axios from 'axios';
import api from '../services/api';
import {
    setUserSessionCookie,
    clearUserSessionCookie,
} from '../utils/authSessionCookie';

// ── Helpers ──────────────────────────────────────────────────────────────────

const GROUP_TOKEN_STORAGE_KEY = 'alphasync_group_token';
const API_BASE = import.meta.env.VITE_API_URL || '';

function getGroupTokenForSync() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const fromUrl = (params.get('grp') || '').trim();
        if (fromUrl) {
            localStorage.setItem(GROUP_TOKEN_STORAGE_KEY, fromUrl);
            return fromUrl;
        }
    } catch { }
    try {
        return (localStorage.getItem(GROUP_TOKEN_STORAGE_KEY) || '').trim();
    } catch {
        return '';
    }
}

function syncUserSessionCookie() {
    setUserSessionCookie();
}

function clearSession() {
    localStorage.removeItem('alphasync_token');
    localStorage.removeItem('alphasync_user');
    clearUserSessionCookie();
    try { sessionStorage.removeItem('alphasync_admin_session'); } catch { }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create((set, get) => ({
    /** @type {object|null} */
    user: (() => {
        try {
            const stored = localStorage.getItem('alphasync_user');
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    })(),

    /** @type {null} — kept for compatibility with components that read it */
    firebaseUser: null,

    /** @type {boolean} */
    loading: false,

    /** @type {boolean} */
    initializing: false,

    // ─── Initialize (no-op — no Firebase listener needed) ─────────────────────
    initAuth: () => {
        // Restore user from localStorage on app mount
        try {
            const stored = localStorage.getItem('alphasync_user');
            const token = localStorage.getItem('alphasync_token');
            if (stored && token) {
                set({ user: JSON.parse(stored), loading: false, initializing: false });
            } else {
                set({ user: null, loading: false, initializing: false });
            }
        } catch {
            set({ user: null, loading: false, initializing: false });
        }
        return () => { }; // no unsubscribe needed
    },

    // ─── Actions ──────────────────────────────────────────────────────────────

    /**
     * Register with username + password — calls backend directly, no Firebase.
     */
    registerWithEmail: async (emailInput, password, displayName, usernameInput) => {
        const username = (usernameInput || '').trim().toLowerCase().replace(/\s+/g, '_');
        const fullName = (displayName || username).trim();
        const groupToken = getGroupTokenForSync();

        const payload = {
            username,
            password,
            full_name: fullName,
            ...(emailInput && emailInput.trim() ? { email: emailInput.trim() } : {}),
            ...(groupToken ? { group_token: groupToken } : {}),
        };

        const res = await axios.post(`${API_BASE}/api/auth/register-direct`, payload);
        const { token, user } = res.data;

        localStorage.setItem('alphasync_token', token);
        localStorage.setItem('alphasync_user', JSON.stringify(user));
        localStorage.removeItem(GROUP_TOKEN_STORAGE_KEY);
        syncUserSessionCookie();
        set({ user, firebaseUser: null, loading: false, initializing: false });

        return { success: true, isNew: true, user };
    },

    /**
     * Login with username + password — calls backend directly, no Firebase.
     */
    loginWithEmail: async (usernameInput, password) => {
        const username = (usernameInput || '').trim();
        const res = await axios.post(`${API_BASE}/api/auth/login-direct`, {
            username,
            password,
        });
        const { token, user } = res.data;

        localStorage.setItem('alphasync_token', token);
        localStorage.setItem('alphasync_user', JSON.stringify(user));
        syncUserSessionCookie();
        set({ user, firebaseUser: null, loading: false, initializing: false });

        return { success: true, isNew: false, user };
    },

    /**
     * Alias for loginWithEmail — used by some existing components.
     */
    loginWithUsername: async (usernameInput, password) => {
        return get().loginWithEmail(usernameInput, password);
    },

    /**
     * Google sign-in — disabled for now.
     */
    loginWithGoogle: async () => {
        throw Object.assign(
            new Error('Google sign-in is disabled. Please use username and password.'),
            { code: 'auth/google-disabled' }
        );
    },

    /**
     * Logout — clear token and user.
     */
    logout: async () => {
        try { await api.post('/auth/logout'); } catch { }
        clearSession();
        set({ user: null, firebaseUser: null });
    },

    /**
     * Resend verification — not needed for direct auth (no email verification).
     */
    resendVerification: async () => {
        throw Object.assign(
            new Error('Email verification not required for direct login.'),
            { code: 'auth/not-required' }
        );
    },

    /**
     * Reset password — for direct auth, admin must reset manually for now.
     */
    resetPassword: async () => {
        throw Object.assign(
            new Error('Password reset is not yet available. Contact admin.'),
            { code: 'auth/not-supported' }
        );
    },

    /**
     * Get the current JWT token (used by API interceptor).
     */
    getToken: async () => {
        return localStorage.getItem('alphasync_token') || null;
    },

    /**
     * Partially update user fields in store + localStorage.
     */
    updateUser: (patch) => {
        const current = get().user;
        if (!current) return;
        const updated = { ...current, ...patch };
        localStorage.setItem('alphasync_user', JSON.stringify(updated));
        set({ user: updated });
    },

    /**
     * Save the user's mobile number as contact info.
     */
    submitPhone: async (phone) => {
        const response = await api.post('/auth/set-phone', { phone });
        const current = get().user;
        if (current) {
            const updated = { ...current, phone: response.data.phone };
            localStorage.setItem('alphasync_user', JSON.stringify(updated));
            set({ user: updated });
        }
        return response.data;
    },
}));