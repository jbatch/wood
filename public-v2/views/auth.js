import { state } from "../state.js";
import { escHtml, humanErr } from "../utils.js";

export function renderAuth(ctx) {
  const { app, api, loadApp, render, startPolling } = ctx;
  const params = new URLSearchParams(location.search);
  const invite = params.get("invite") || "";

  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-logo">🪵</div>
      <div class="auth-title">Wood</div>
      <div class="auth-sub">${invite ? "You've been invited." : "Welcome back."}</div>
      <form class="auth-card" id="auth-form">
        ${invite ? `
          <div class="sheet-field">
            <div class="field-label">Invite code</div>
            <input class="field-input" name="inviteCode" value="${escHtml(invite)}" required autocomplete="off" />
          </div>
          <div class="sheet-field">
            <div class="field-label">Email</div>
            <input class="field-input" name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
          </div>
        ` : ""}
        <div class="sheet-field">
          <div class="field-label">Username</div>
          <input class="field-input" name="username" autocomplete="username" required placeholder="your_username" autocapitalize="none" autocorrect="off" spellcheck="false" />
        </div>
        <div class="sheet-field">
          <div class="field-label">Password</div>
          <input class="field-input" name="password" type="password" autocomplete="${invite ? "new-password" : "current-password"}" required placeholder="••••••••" />
        </div>
        <div class="auth-error" id="auth-error">${escHtml(state.error)}</div>
        <button class="btn-primary" type="submit">${invite ? "Create account" : "Log in"}</button>
      </form>
    </div>
  `;

  document.querySelector("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    document.querySelector("#auth-error").textContent = "";
    try {
      const resp = await api(invite ? "/api/signup" : "/api/login", { method: "POST", body: payload });
      state.session = { user: resp.user, push: state.session?.push || {} };
      history.replaceState(null, "", "/");
      await loadApp();
      startPolling();
      render();
    } catch (err) {
      document.querySelector("#auth-error").textContent = humanErr(err.message);
    }
  });
}
