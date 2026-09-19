'use strict';

const extras = new Map();

function setUserExtras(userId, data) {
  if (!userId) return;
  extras.set(userId, { ...(extras.get(userId) || {}), ...data });
}

function getUserExtras(userId) {
  return extras.get(userId) || {};
}

function mergeUserProfile(user) {
  if (!user?.id) return user;
  const stored = getUserExtras(user.id);
  const image = user.profile_image || stored.profile_image || '';
  if (!image) return user;
  return {
    ...user,
    profile_image: image,
    company_logo: image,
  };
}

module.exports = {
  setUserExtras,
  getUserExtras,
  mergeUserProfile
};
