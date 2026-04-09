import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const loginEl = document.getElementById("screen-login");
const appEl = document.getElementById("screen-app");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const registerSubmit = document.getElementById("register-submit");
const loginLoading = document.getElementById("login-loading");

let supabase = null;
let dashboardStarted = false;

function showLogin() {
  if (loginEl) loginEl.hidden = false;
  if (appEl) appEl.hidden = true;
}

function showApp() {
  if (loginEl) loginEl.hidden = true;
  if (appEl) appEl.hidden = false;
}

async function loadConfig() {
  const res = await fetch("/api/auth-config", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "No se pudo cargar la configuracion de acceso.");
  }
  return data;
}

async function bootstrap() {
  if (loginLoading) loginLoading.hidden = false;
  if (loginError) {
    loginError.hidden = true;
    loginError.textContent = "";
  }

  try {
    const cfg = await loadConfig();
    supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    const getAuthHeaders = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return {};
      return { Authorization: `Bearer ${session.access_token}` };
    };

    const signOut = async () => {
      try {
        if (supabase) {
          await supabase.auth.signOut({ scope: "global" });
        }
      } catch {
        /* offline o error de red: igual cerramos sesión local */
      }
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith("sb-")) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        /* ignore */
      }
      const path = window.location.pathname || "/";
      window.location.replace(path);
    };

    function bindLogoutButton() {
      const btn = document.getElementById("btn-logout");
      if (!btn || btn.dataset.authBound === "1") return;
      btn.dataset.authBound = "1";
      btn.type = "button";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.disabled = true;
        void signOut().finally(() => {
          btn.disabled = false;
        });
      });
    }

    bindLogoutButton();

    async function verifyAndEnter() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showLogin();
        if (loginLoading) loginLoading.hidden = true;
        return;
      }

      const vr = await fetch("/api/auth-session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!vr.ok) {
        await supabase.auth.signOut();
        showLogin();
        if (loginLoading) loginLoading.hidden = true;
        return;
      }

      const info = await vr.json().catch(() => ({}));
      const emailEl = document.getElementById("user-email-display");
      if (emailEl && typeof info.email === "string") {
        emailEl.textContent = info.email;
      }

      let authUserId = typeof info.userId === "string" ? info.userId.trim() : "";
      if (!authUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        authUserId = user?.id && typeof user.id === "string" ? user.id : "";
      }
      if (!authUserId) {
        await supabase.auth.signOut();
        showLogin();
        if (loginLoading) loginLoading.hidden = true;
        return;
      }

      showApp();
      bindLogoutButton();
      if (loginLoading) loginLoading.hidden = true;
      if (!dashboardStarted) {
        dashboardStarted = true;
        const { runApp } = await import("./finanzas-app.js");
        await runApp({ getAuthHeaders, authUserId });
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      if (loginError) {
        loginError.textContent = "";
        loginError.hidden = true;
      }
      const email = loginEmail?.value.trim() ?? "";
      const password = loginPassword?.value ?? "";
      if (!email || !password) {
        if (loginError) {
          loginError.textContent = "Completa correo y contrasena.";
          loginError.hidden = false;
        }
        return;
      }

      if (loginSubmit) loginSubmit.disabled = true;
      if (registerSubmit) registerSubmit.disabled = true;
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (loginError) {
            loginError.textContent = error.message || "No se pudo iniciar sesion.";
            loginError.hidden = false;
          }
          return;
        }
        await verifyAndEnter();
      } finally {
        if (loginSubmit) loginSubmit.disabled = false;
        if (registerSubmit) registerSubmit.disabled = false;
      }
    }

    async function handleSignUp() {
      if (loginError) {
        loginError.textContent = "";
        loginError.hidden = true;
      }
      const email = loginEmail?.value.trim() ?? "";
      const password = loginPassword?.value ?? "";
      if (!email || !password) {
        if (loginError) {
          loginError.textContent = "Escribe correo y contrasena para crear tu cuenta.";
          loginError.hidden = false;
        }
        return;
      }
      if (password.length < 6) {
        if (loginError) {
          loginError.textContent = "La contrasena debe tener al menos 6 caracteres.";
          loginError.hidden = false;
        }
        return;
      }

      if (loginSubmit) loginSubmit.disabled = true;
      if (registerSubmit) registerSubmit.disabled = true;
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          if (loginError) {
            loginError.textContent = error.message || "No se pudo crear la cuenta.";
            loginError.hidden = false;
          }
          return;
        }

        if (data.session?.access_token) {
          await verifyAndEnter();
          return;
        }

        if (loginError) {
          loginError.textContent = "Cuenta creada. Revisa tu correo para confirmar y luego inicia sesion.";
          loginError.hidden = false;
        }
      } finally {
        if (loginSubmit) loginSubmit.disabled = false;
        if (registerSubmit) registerSubmit.disabled = false;
      }
    }

    if (loginForm) {
      loginForm.addEventListener("submit", handleLogin);
    }
    if (registerSubmit) {
      registerSubmit.addEventListener("click", () => {
        void handleSignUp();
      });
    }

    await verifyAndEnter();
  } catch (err) {
    showLogin();
    if (loginError) {
      loginError.textContent = err instanceof Error ? err.message : String(err);
      loginError.hidden = false;
    }
    if (loginLoading) loginLoading.hidden = true;
  }
}

void bootstrap();
