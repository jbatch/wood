function username(user, fallback = "Someone") {
  return user?.username || fallback;
}

function groupName(group) {
  return group?.name || "your group";
}

export function friendRequestNotification(requester) {
  return {
    title: "Wood friend request",
    body: `${username(requester)} wants to Wood with you`,
    url: "/",
    friendId: requester?.id,
  };
}

export function friendRequestAcceptedNotification(accepter) {
  return {
    title: "Wood friend accepted",
    body: `${username(accepter)} accepted your friend request`,
    url: `/?friend=${encodeURIComponent(accepter?.id || "")}`,
    friendId: accepter?.id,
  };
}

export function groupInviteNotification(inviter, group) {
  return {
    title: "Wood group invite",
    body: `${username(inviter)} invited you to ${groupName(group)}`,
    url: "/?tab=groups",
    groupId: group?.id,
  };
}

export function groupInviteAcceptedNotification(member, group) {
  return {
    title: "Wood group",
    body: `${username(member)} joined ${groupName(group)}`,
    url: `/?tab=groups&group=${encodeURIComponent(group?.id || "")}`,
    groupId: group?.id,
    userId: member?.id,
  };
}

export function inviteUsedNotification(joinedUser, invite, creator) {
  return {
    title: "Wood invite used",
    body: `${username(joinedUser)} joined Wood with your invite`,
    url: creator?.role === "admin" ? "/admin" : "/",
    inviteId: invite?.id,
    userId: joinedUser?.id,
  };
}
