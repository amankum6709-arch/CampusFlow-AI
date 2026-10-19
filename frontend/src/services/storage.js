// ============================================================
// Naam: Storage Service
// Kya karta hai: University setup ko browser localStorage mein save/load/clear karta hai.
//                Setup data organization-specific keys use karta hai taaki
//                doosri organization ka data leak na ho.
// ============================================================

import { SETUP_STORAGE_KEY } from "../utils/constants";

function orgKey(organizationId) {
  if (!organizationId) return SETUP_STORAGE_KEY;
  return `${SETUP_STORAGE_KEY}__${organizationId}`;
}

function currentOrgId() {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
    return user?.organization_id || localStorage.getItem("campusflow.organizationId") || "";
  } catch {
    return localStorage.getItem("campusflow.organizationId") || "";
  }
}

export const saveSetup = (setup, organizationId) => {
  const orgId = organizationId || currentOrgId();
  const key = orgKey(orgId);
  localStorage.setItem(key, JSON.stringify(setup));
  // Also update the non-org-specific key for backwards compatibility,
  // but only if no org ID is available (logged-out state).
  if (!orgId) {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  }
};

export const loadSetup = (organizationId) => {
  try {
    const orgId = organizationId || currentOrgId();
    const key = orgKey(orgId);
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
    // Fallback: try non-org-specific key for backwards compat
    if (orgId) {
      const legacy = localStorage.getItem(SETUP_STORAGE_KEY);
      if (legacy) return JSON.parse(legacy);
    }
    return null;
  } catch (error) {
    console.error("CampusFlow setup load error:", error);
    return null;
  }
};

export const clearSetup = (organizationId) => {
  const orgId = organizationId || currentOrgId();
  const key = orgKey(orgId);
  localStorage.removeItem(key);
  // Also clear the legacy non-org-specific key if clearing for current org
  if (!orgId) {
    localStorage.removeItem(SETUP_STORAGE_KEY);
  }
};

export const clearAllSetup = () => {
  // Remove the legacy non-org-specific key
  localStorage.removeItem(SETUP_STORAGE_KEY);
  // Remove all org-specific keys
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SETUP_STORAGE_KEY + "__")) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
};
