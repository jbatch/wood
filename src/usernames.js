export const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidUsername(value) {
  return USERNAME_PATTERN.test(value);
}
