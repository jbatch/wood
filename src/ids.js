import crypto from "node:crypto";

export function id(prefix = "") {
  const value = crypto.randomBytes(12).toString("base64url");
  return prefix ? `${prefix}_${value}` : value;
}

export function inviteCode() {
  return crypto.randomBytes(18).toString("base64url");
}

export function resetToken() {
  return crypto.randomBytes(32).toString("base64url");
}
