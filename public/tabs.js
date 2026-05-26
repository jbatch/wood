import { state } from "./state.js";

const HOME_TABS = new Set(["friends", "stats", "groups", "settings"]);
const ADMIN_TABS = new Set(["overview", "invites", "users", "groups", "achievements", "bugs", "debug"]);
const HOME_TAB_KEY = "wood:home-tab";
const ADMIN_TAB_KEY = "wood:admin-tab";

export function restoreTabs() {
  const params = new URLSearchParams(location.search);
  const queryTab = params.get("tab");
  const storedHomeTab = readTab(HOME_TAB_KEY, HOME_TABS);
  const storedAdminTab = readTab(ADMIN_TAB_KEY, ADMIN_TABS);

  if (HOME_TABS.has(queryTab)) {
    state.homeTab = queryTab;
    saveHomeTab(queryTab);
  } else if (storedHomeTab) {
    state.homeTab = storedHomeTab;
  }

  if (storedAdminTab) state.adminTab = storedAdminTab;
}

export function saveHomeTab(tab) {
  if (!HOME_TABS.has(tab)) return;
  state.homeTab = tab;
  writeTab(HOME_TAB_KEY, tab);
}

export function saveAdminTab(tab) {
  if (!ADMIN_TABS.has(tab)) return;
  state.adminTab = tab;
  writeTab(ADMIN_TAB_KEY, tab);
}

function readTab(key, allowed) {
  try {
    const value = localStorage.getItem(key);
    return allowed.has(value) ? value : "";
  } catch {
    return "";
  }
}

function writeTab(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage restrictions should not break tab switching.
  }
}
