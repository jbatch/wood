import { state } from "../state.js";
import { escHtml, humanErr } from "../utils.js";

const MONTHS = [
  ["", "Month"],
  ["1", "Jan"],
  ["2", "Feb"],
  ["3", "Mar"],
  ["4", "Apr"],
  ["5", "May"],
  ["6", "Jun"],
  ["7", "Jul"],
  ["8", "Aug"],
  ["9", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
];

export async function openProfile(ctx, userId) {
  const { api, render } = ctx;
  state.view = "profile";
  state.profileUserId = userId;
  state.profileData = null;
  state.profileError = "";
  state.profileNotice = "";
  render();
  try {
    state.profileData = await api(`/api/profiles/${userId}`);
    render();
  } catch (err) {
    state.profileError = humanErr(err.message);
    render();
  }
}

export function renderProfile(ctx) {
  const { app, render } = ctx;
  const data = state.profileData;
  const profile = data?.profile;
  const title = profile?.username || "Profile";

  app.innerHTML = `
    <div class="shell">
      <header class="app-header">
        <div class="header-left">
          <button class="back-btn" id="back-btn">← Back</button>
        </div>
        <div class="app-wordmark" style="font-size:17px">${escHtml(title)}</div>
        <div class="header-actions"></div>
      </header>
      <div class="scroll-content profile-scroll">
        ${data ? profileHtml(data) : loadingHtml()}
      </div>
      ${state.profileError ? `<div class="toast">${escHtml(state.profileError)}</div>` : ""}
    </div>
  `;

  document.querySelector("#back-btn")?.addEventListener("click", () => {
    state.view = "home";
    state.profileData = null;
    state.profileError = "";
    state.profileNotice = "";
    render();
  });

  document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProfile(ctx, event.currentTarget);
  });
  bindProfileDirtyState();

  document.querySelector("[data-profile-action='history']")?.addEventListener("click", () => {
    ctx.openHistory(state.profileUserId);
  });
  document.querySelector("[data-profile-action='mute']")?.addEventListener("click", async (event) => {
    await friendAction(ctx, event.currentTarget.dataset.nextAction);
  });
  document.querySelector("[data-profile-action='birthday']")?.addEventListener("click", async () => {
    await sendBirthdayWood(ctx);
  });
  document.querySelector("[data-profile-action='remove']")?.addEventListener("click", () => {
    document.querySelector("#remove-sheet")?.classList.add("visible");
  });
  document.querySelector("[data-profile-action='cancel-remove']")?.addEventListener("click", () => {
    document.querySelector("#remove-sheet")?.classList.remove("visible");
  });
  document.querySelector("[data-profile-action='confirm-remove']")?.addEventListener("click", async () => {
    await friendAction(ctx, "remove", { backHome: true });
  });
}

function loadingHtml() {
  return `
    <div class="empty-state" style="padding-top:60px">
      <div class="empty-emoji">W</div>
      <p>Loading profile…</p>
    </div>
  `;
}

function profileHtml(data) {
  return `
    <section class="profile-hero">
      <div class="profile-avatar">${escHtml(initial(data.profile.username))}</div>
      <div class="profile-title">
        <h1>${escHtml(data.profile.username)}</h1>
        <p>${escHtml(memberSince(data.profile.memberSince))}</p>
      </div>
    </section>
    ${data.isSelf ? selfProfileForm(data) : friendProfile(data)}
    ${statsHtml(data)}
    ${achievementsHtml(data.achievements || [])}
    ${!data.isSelf ? removeSheetHtml(data.profile.username) : ""}
  `;
}

function selfProfileForm(data) {
  const profile = data.profile;
  const options = data.favouriteWoodOptions || profile.favouriteWoodOptions || [];
  return `
    <form class="profile-panel profile-form" id="profile-form" autocomplete="off">
      <div class="field-label">Public profile</div>
      <label class="profile-field">
        <span>Username</span>
        <input class="field-input" name="username" value="${escHtml(profile.username)}" maxlength="32" autocapitalize="none" autocomplete="off" />
      </label>
      <label class="profile-field">
        <span>Favourite wood</span>
        <select class="field-input" name="favouriteWood">
          <option value="" ${profile.favouriteWood ? "" : "selected"}>Not chosen</option>
          ${options.map((option) => `
            <option value="${escHtml(option)}" ${option === profile.favouriteWood ? "selected" : ""}>${escHtml(titleCase(option))}</option>
          `).join("")}
        </select>
      </label>
      <div class="profile-field">
        <span>Birthday</span>
        <div class="birthday-row">
          <select class="field-input" name="birthdayMonth">
            ${MONTHS.map(([value, label]) => `
              <option value="${value}" ${String(profile.birthdayMonth || "") === value ? "selected" : ""}>${escHtml(label)}</option>
            `).join("")}
          </select>
          <input class="field-input" name="birthdayDay" type="number" min="1" max="31" placeholder="Day" value="${escHtml(profile.birthdayDay || "")}" />
        </div>
      </div>
      <label class="toggle-row">
        <input type="checkbox" name="birthdayVisible" ${profile.birthdayVisible ? "checked" : ""} />
        <span>Show birthday on my profile</span>
      </label>
      <div class="profile-error">${escHtml(state.profileError)}</div>
      <div class="profile-notice">${escHtml(state.profileNotice)}</div>
      <button class="btn-primary" id="profile-save-btn" type="submit" disabled>Save profile</button>
    </form>
  `;
}

function friendProfile(data) {
  const profile = data.profile;
  const muted = Boolean(data.friendship?.muted);
  return `
    <section class="profile-panel">
      <div class="profile-detail">
        <span>Favourite wood</span>
        <strong>${escHtml(profile.favouriteWood ? titleCase(profile.favouriteWood) : "Not chosen")}</strong>
      </div>
      <div class="profile-detail">
        <span>Birthday</span>
        <strong>${escHtml(birthdayLabel(profile))}</strong>
      </div>
    </section>
    <section class="profile-actions">
      <button class="profile-action" data-profile-action="history">History</button>
      ${data.friendship?.wood?.birthdayAvailable ? `<button class="profile-action birthday" data-profile-action="birthday">Birthday Wood</button>` : ""}
      <button class="profile-action" data-profile-action="mute" data-next-action="${muted ? "unmute" : "mute"}">${muted ? "Unmute" : "Mute"}</button>
      <button class="profile-action danger" data-profile-action="remove">Remove</button>
    </section>
  `;
}

function statsHtml(data) {
  const stats = data.stats || {};
  const rows = data.isSelf
    ? [
        ["Sent", stats.woods_sent || 0],
        ["Received", stats.woods_received || 0],
        ["Best streak", stats.longest_streak || 0],
        ["Friends", stats.friends || 0],
      ]
    : [
        ["You sent", stats.sent || 0],
        ["They sent", stats.received || 0],
        ["Current streak", stats.current_streak || 0],
        ["Best streak", stats.longest_streak || 0],
      ];
  return `
    <section class="profile-panel">
      <div class="field-label">${data.isSelf ? "Your Wood numbers" : "Between you"}</div>
      <div class="profile-stat-grid">
        ${rows.map(([label, value]) => `
          <div class="profile-stat">
            <strong>${escHtml(value)}</strong>
            <span>${escHtml(label)}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function achievementsHtml(achievements) {
  const earned = achievements.filter((achievement) => achievement.earned);
  return `
    <section class="profile-panel">
      <div class="field-label">Achievements ${earned.length}/${achievements.length}</div>
      <div class="profile-achievements">
        ${achievements.map((achievement) => `
          <div class="profile-achievement ${achievement.earned ? "earned" : ""}">
            <span>${escHtml(achievement.icon)}</span>
            <strong>${escHtml(achievement.name)}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function removeSheetHtml(username) {
  return `
    <div class="sheet-overlay remove-sheet" id="remove-sheet">
      <div class="sheet">
        <div class="sheet-title">Remove ${escHtml(username)}?</div>
        <p class="sheet-copy">This ends the friendship. A dramatic amount of nothing will happen.</p>
        <button class="btn-primary danger-btn" type="button" data-profile-action="confirm-remove">Remove friend</button>
        <button class="profile-action" type="button" data-profile-action="cancel-remove">Keep friend</button>
      </div>
    </div>
  `;
}

async function saveProfile(ctx, form) {
  const { api, render } = ctx;
  const data = new FormData(form);
  try {
    state.data = await api("/api/profile", {
      method: "PATCH",
      body: {
        username: data.get("username"),
        favouriteWood: data.get("favouriteWood"),
        birthdayMonth: data.get("birthdayMonth"),
        birthdayDay: data.get("birthdayDay"),
        birthdayVisible: Boolean(data.get("birthdayVisible")),
      },
    });
    state.profileData = await api(`/api/profiles/${state.data.user.id}`);
    state.profileUserId = state.data.user.id;
    state.profileError = "";
    state.profileNotice = "Saved successfully";
    render();
  } catch (err) {
    state.profileError = humanErr(err.message);
    state.profileNotice = "";
    render();
  }
}

function bindProfileDirtyState() {
  const form = document.querySelector("#profile-form");
  const saveBtn = document.querySelector("#profile-save-btn");
  if (!form || !saveBtn) return;
  const initial = profileFormSignature(form);
  const update = () => {
    const dirty = profileFormSignature(form) !== initial;
    saveBtn.disabled = !dirty;
    if (dirty && state.profileNotice) {
      state.profileNotice = "";
      document.querySelector(".profile-notice").textContent = "";
    }
  };
  form.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("input", update);
    control.addEventListener("change", update);
  });
  update();
}

function profileFormSignature(form) {
  const data = new FormData(form);
  return JSON.stringify({
    username: String(data.get("username") || "").trim(),
    favouriteWood: data.get("favouriteWood") || "",
    birthdayMonth: data.get("birthdayMonth") || "",
    birthdayDay: data.get("birthdayDay") || "",
    birthdayVisible: Boolean(data.get("birthdayVisible")),
  });
}

async function friendAction(ctx, action, { backHome = false } = {}) {
  const { api, render } = ctx;
  try {
    state.data = await api(`/api/friends/${state.profileUserId}/${action}`, { method: "POST" });
    state.profileError = "";
    if (backHome) {
      state.view = "home";
      state.profileData = null;
    } else {
      state.profileData = await api(`/api/profiles/${state.profileUserId}`);
    }
    render();
  } catch (err) {
    state.profileError = humanErr(err.message);
    render();
  }
}

async function sendBirthdayWood(ctx) {
  const { api, render } = ctx;
  try {
    state.data = await api(`/api/friends/${state.profileUserId}/wood`, {
      method: "POST",
      body: { birthday: true },
    });
    state.profileData = await api(`/api/profiles/${state.profileUserId}`);
    state.profileError = "";
    render();
  } catch (err) {
    state.profileError = humanErr(err.message);
    render();
  }
}

function initial(username) {
  return String(username || "W").slice(0, 1).toUpperCase();
}

function memberSince(iso) {
  if (!iso) return "Member since the beginning of wood";
  return `Member since ${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function birthdayLabel(profile) {
  if (!profile.hasBirthday) return "Secret";
  const date = new Date(2024, Number(profile.birthdayMonth) - 1, Number(profile.birthdayDay));
  const label = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return profile.isBirthdayToday ? `${label} · today` : label;
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
    .join(" ");
}
