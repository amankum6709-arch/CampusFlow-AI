const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api/v1" : "");

function getToken() {
  return localStorage.getItem("campusflow.token") || "";
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function setAuth(token, user) {
  localStorage.setItem("campusflow.token", token);
  localStorage.setItem("campusflow.user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("campusflow.token");
  localStorage.removeItem("campusflow.user");
  localStorage.removeItem("campusflow.organizationId");
  // Clear org-specific setup keys (campusflow-university-setup-v2__<orgId>)
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("campusflow-university-setup-v2")) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem("campusflow.lastSetupSave");
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("campusflow.user") || "null");
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_URL must be configured for production builds.");
  }

  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (err) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Cannot reach the server. Please check your internet connection and try again.", { cause: err });
    }
    throw new Error(err.message || "Network error. Please try again.", { cause: err });
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    let detail = body.detail;
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join("; ");
    throw new Error(detail || `Request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export const api = {
  // Auth
  signup: (payload) => request("/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),

  // Organizations
  createOrganization: (payload) => request("/organizations", { method: "POST", body: JSON.stringify(payload) }),
  getOrganization: (id) => request(`/organizations/${id}`),

  // Setup persistence
  getSetup: (orgId) => request(`/organizations/${encodeURIComponent(orgId)}/setup`),
  saveSetup: (orgId, payload) => request(`/organizations/${encodeURIComponent(orgId)}/setup`, { method: "PUT", body: JSON.stringify(payload) }),
  resetSetup: (orgId) => request(`/organizations/${encodeURIComponent(orgId)}/setup`, { method: "DELETE" }),

  // Full sync
  fullSync: (payload) => request("/sync", { method: "POST", body: JSON.stringify(payload) }),

  // Faculty
  getFaculty: (organizationId) => request(`/faculty?organization_id=${encodeURIComponent(organizationId)}`),
  createFaculty: (payload) => request("/faculty", { method: "POST", body: JSON.stringify(payload) }),
  updateFaculty: (id, payload, organizationId) => request(`/faculty/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFaculty: (id, organizationId) => request(`/faculty/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" }),

  // Rooms
  getRooms: (organizationId) => request(`/rooms?organization_id=${encodeURIComponent(organizationId)}`),
  createRoom: (payload) => request("/rooms", { method: "POST", body: JSON.stringify(payload) }),
  updateRoom: (id, payload, organizationId) => request(`/rooms/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRoom: (id, organizationId) => request(`/rooms/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" }),
  deleteRoomsByBuilding: (organizationId, campusId, buildingId) =>
    request(`/rooms/bulk-delete?organization_id=${encodeURIComponent(organizationId)}`, {
      method: "POST",
      body: JSON.stringify({ organization_id: organizationId, campus_id: campusId, building_id: buildingId }),
    }),

  // Courses
  getCourses: (organizationId) => request(`/courses?organization_id=${encodeURIComponent(organizationId)}`),
  createCourse: (payload) => request("/courses", { method: "POST", body: JSON.stringify(payload) }),
  updateCourse: (id, payload, organizationId) => request(`/courses/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCourse: (id, organizationId) => request(`/courses/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" }),

  // Classes
  getClasses: (organizationId) => request(`/classes?organization_id=${encodeURIComponent(organizationId)}`),
  createClass: (payload) => request("/classes", { method: "POST", body: JSON.stringify(payload) }),
  updateClass: (id, payload, organizationId) => request(`/classes/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteClass: (id, organizationId) => request(`/classes/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" }),

  // Sessions
  getSessions: (organizationId) => request(`/sessions?organization_id=${encodeURIComponent(organizationId)}`),
  createSession: (payload) => request("/sessions", { method: "POST", body: JSON.stringify(payload) }),
  updateSession: (id, payload, organizationId) => request(`/sessions/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteSession: (id, organizationId) => request(`/sessions/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" }),

  // Constraints
  getConstraints: (organizationId) => request(`/constraints?organization_id=${encodeURIComponent(organizationId)}`),
  createConstraint: (payload) => request("/constraints", { method: "POST", body: JSON.stringify(payload) }),
  updateConstraint: (id, payload, organizationId) => request(`/constraints/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteConstraint: (id, organizationId) => request(`/constraints/${id}?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" }),

  // Timetable
  generateTimetable: (payload) => request("/timetable/generate", { method: "POST", body: JSON.stringify(payload) }),
  getRuns: (organizationId) => request(`/timetable/runs?organization_id=${encodeURIComponent(organizationId)}`),
  getRun: (runId) => request(`/timetable/runs/${encodeURIComponent(runId)}`),
  getRunEntries: (runId) => request(`/timetable/runs/${encodeURIComponent(runId)}/entries`),
  updateEntry: (runId, entryId, payload) => request(`/timetable/runs/${encodeURIComponent(runId)}/entries/${encodeURIComponent(entryId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  getRunAnalytics: (runId) => request(`/timetable/runs/${encodeURIComponent(runId)}/analytics`),
  askAI: (runId, question) => request(`/timetable/runs/${encodeURIComponent(runId)}/ai?question=${encodeURIComponent(question)}`, { method: "POST" }),

  // Action-taking assistant (analyze -> propose -> approve, all server-validated)
  assistantAnalyze: (runId) => request(`/assistant/runs/${encodeURIComponent(runId)}/analyze`, { method: "POST" }),
  assistantPropose: (runId, intent, params) => request(`/assistant/runs/${encodeURIComponent(runId)}/propose`, { method: "POST", body: JSON.stringify({ intent, params: params || {} }) }),
  assistantProposals: (runId) => request(`/assistant/runs/${encodeURIComponent(runId)}/proposals`),
  assistantProposal: (proposalId) => request(`/assistant/proposals/${encodeURIComponent(proposalId)}`),
  assistantApprove: (proposalId) => request(`/assistant/proposals/${encodeURIComponent(proposalId)}/approve`, { method: "POST" }),
  assistantCancel: (proposalId) => request(`/assistant/proposals/${encodeURIComponent(proposalId)}/cancel`, { method: "POST" }),
  assistantChat: (runId, message) => request(`/assistant/runs/${encodeURIComponent(runId)}/chat`, { method: "POST", body: JSON.stringify({ message }) }),
  exportRun: async (runId, format = "csv") => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/timetable/runs/${encodeURIComponent(runId)}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("Export failed");
    const text = await response.text();
    return { text, filename: `timetable-${runId.slice(0, 8)}.${format === "json" ? "json" : "csv"}` };
  },
};

export const API_BASE_URL_EXPORT = API_BASE_URL;
