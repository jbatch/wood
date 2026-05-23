# TODO

## Bugs

- [ ] Conversation screen should update when a new Wood arrives while the user is already viewing that conversation.
  - Decide whether the right fix is tighter polling, push-triggered refresh, or a lightweight websocket/SSE channel.

- [x] Send notifications when a friend request is received or accepted.

- [x] Admin invite links are truncated in the v2 invite list, making them hard to copy without inspecting the DOM.
  - Add a copy-to-clipboard button for each invite link.

## Product Follow-ups

- [x] Support reusable invite links.
  - Current invite links are single-use; reusable links would make onboarding easier when sharing with several people.
