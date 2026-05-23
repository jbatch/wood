export const state = {
  session: null,
  data: null,
  error: "",
  pushStatus: null,
  admin: null,
  debug: null,
  pollTimer: null,
  polling: false,
  view: "home",
  homeTab: "friends",
  adminTab: "overview",
  historyFriendId: null,
  historyData: null,
  woodKeyboardOpen: false,
  toast: "",
  showAddSheet: false,
  addError: "",
  showGroupSheet: false,
  groupError: "",
};

export const swipeOpen = new Set();
