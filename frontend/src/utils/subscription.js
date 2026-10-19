// ============================================================
// Subscription Plans & Feature Gating
// Free plan: manual scheduling + conflict detection only
// Advanced plan: everything including AI, Excel import, etc.
// ============================================================

export const PLANS = {
  FREE: "free",
  ADVANCED: "advanced",
};

export const FEATURES = {
  MANUAL_SCHEDULING: "manual_scheduling",
  EXCEL_IMPORT: "excel_import",
  AI_ASSISTANT: "ai_assistant",
  AI_NATURAL_LANGUAGE: "ai_natural_language",
  AI_CONFLICT_FIX: "ai_conflict_fix",
  CONFLICT_DETECTION: "conflict_detection",
  SAVED_CONTEXT: "saved_context",
  UNLIMITED_TIMETABLES: "unlimited_timetables",
  PRIORITY_SUPPORT: "priority_support",
};

const PLAN_FEATURES = {
  [PLANS.FREE]: [
    FEATURES.MANUAL_SCHEDULING,
    FEATURES.CONFLICT_DETECTION,
  ],
  [PLANS.ADVANCED]: [
    FEATURES.MANUAL_SCHEDULING,
    FEATURES.EXCEL_IMPORT,
    FEATURES.AI_ASSISTANT,
    FEATURES.AI_NATURAL_LANGUAGE,
    FEATURES.AI_CONFLICT_FIX,
    FEATURES.CONFLICT_DETECTION,
    FEATURES.SAVED_CONTEXT,
    FEATURES.UNLIMITED_TIMETABLES,
    FEATURES.PRIORITY_SUPPORT,
  ],
};

export const getPlan = () => {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
    return user?.plan || PLANS.FREE;
  } catch {
    return PLANS.FREE;
  }
};

export const hasFeature = (feature) => {
  const plan = getPlan();
  return PLAN_FEATURES[plan]?.includes(feature) ?? false;
};

export const setPlan = (plan) => {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "{}");
    user.plan = plan;
    localStorage.setItem("campusflow.user", JSON.stringify(user));
  } catch { /* ignore */ }
};
