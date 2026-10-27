// Synchronize the on-page setup wizard with the backend database.
// Now uses real backend endpoints for ALL data — no hardcoded values.

import { api } from "./api";

let syncQueue = Promise.resolve();

function currentOrgId() {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
    return user?.organization_id || localStorage.getItem("campusflow.organizationId") || "";
  } catch {
    return localStorage.getItem("campusflow.organizationId") || "";
  }
}

// Build the full setup object from ALL backend data.
export async function loadBackendSetup() {
  const orgId = currentOrgId();
  if (!orgId) return null;

  // Load setup (institution, campus, availability, constraints) + all resources in parallel.
  const [setupData, faculty, rooms, coursesRaw, classes, sessions] = await Promise.all([
    api.getSetup(orgId).catch(() => null),
    api.getFaculty(orgId).catch(() => []),
    api.getRooms(orgId).catch(() => []),
    api.getCourses(orgId).catch(() => []),
    api.getClasses(orgId).catch(() => []),
    api.getSessions(orgId).catch(() => []),
  ]);

  // Courses -> wizard shape with batches built from classes.
  const classByCourse = new Map();
  for (const cls of classes || []) {
    const list = classByCourse.get(cls.course_id) || [];
    list.push(cls);
    classByCourse.set(cls.course_id, list);
  }

  const courses = (coursesRaw || [])
    .filter((c) => (c.name || "").trim())
    .map((c) => {
    const cls = classByCourse.get(c.id) || [];
    const meta = c.metadata_json || {};
    const batches = cls.map((item, idx) => ({
      id: item.id,
      courseId: c.id,
      name: item.name || `Section ${item.section_number || idx + 1}`,
      currentSemester: Number(item.semester || 1),
      studentCount: Number(item.student_count || 0),
      admissionYear:
        Number(item.metadata_json?.admissionYear) ||
        Number(meta.admissionYear) ||
        new Date().getFullYear(),
      admissionMonth: item.metadata_json?.admissionMonth || meta.admissionMonth || "",
      sectionCount: 1,
      groupsPerSection: 2,
      groupsEnabled: false,
      sections: [{
        id: item.id,
        number: Number(item.section_number || idx + 1),
        studentCount: Number(item.student_count || 0),
        groupsEnabled: false,
        groups: [],
      }],
    }));
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      totalSemesters: meta.totalSemesters || 6,
      duration: meta.duration || "",
      campusId: meta.campusId || "",
      buildingId: meta.buildingId || "",
      batches,
    };
  });

  // Sessions -> subjects
  const subjects = [];
  const seen = new Set();
  for (const s of sessions || []) {
    const course = courses.find((c) => c.id === s.course_id);
    const key = `${s.course_id}:${s.section_name}:${s.subject_code || s.subject_name || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subjects.push({
      id: s.id,
      name: s.subject_name,
      code: s.subject_code,
      courseId: s.course_id,
      type: (s.mode === "lab" ? "Lab" : "Lecture"),
      weeklyPeriods: Number(s.weekly_periods || 1),
      durationMinutes: Number(s.duration_minutes || 60),
      studentCount: Number(s.student_count || 0),
      requiredFacilities: s.required_facilities || [],
      facultyIds: s.faculty_ids || [],
      batchIds: [s.class_id].filter(Boolean),
      semester: course?.batches?.[0]?.currentSemester || 1,
      teachingScope: "section",
    });
  }

  // Faculty -> wizard shape
  const facultyMapped = (faculty || []).map((f) => {
    const avail = f.availability || {};
    return {
      id: f.id,
      name: f.name,
      employeeId: f.employee_code || "",
      maxWeeklyHours: Number(f.max_weekly_hours || 0),
      maxClassesPerDay: avail.maxClassesPerDay || 6,
      availableDays: avail.days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      availability: avail,
      leaveDates: avail.leaveDates || [],
      subjectIds: avail.subjectIds || [],
      department: avail.department || "",
    };
  });

  const s = setupData || {};

  // Rooms -> wizard shape (deduplicate by name + campus + building to prevent duplicates)
  const campusesList = s.campuses || [];
  const campusMap = new Map();
  const buildingMap = new Map();
  for (const c of campusesList) {
    campusMap.set(String(c.id), c.name || "");
    for (const b of c.buildings || []) {
      buildingMap.set(String(b.id), b.name || "");
    }
  }

  const roomKeysSeen = new Set();
  const roomsMapped = [];
  for (const r of rooms || []) {
    const campusId = (r.availability || {}).campusId || "";
    const buildingId = (r.availability || {}).buildingId || "";
    const dedupeKey = `${(r.name || "").toLowerCase().trim()}|${campusId}|${buildingId}`;
    if (roomKeysSeen.has(dedupeKey)) continue;
    roomKeysSeen.add(dedupeKey);
    const rawRoomType = r.room_type || "classroom";
    const roomType = rawRoomType.charAt(0).toUpperCase() + rawRoomType.slice(1);
    roomsMapped.push({
      id: r.id,
      roomNumber: r.name,
      name: r.name,
      capacity: Number(r.capacity || 0),
      roomType,
      facilities: r.facilities || {},
      timetableAvailable: true,
      campusId,
      buildingId,
      campusName: (r.availability || {}).campusName || campusMap.get(campusId) || "",
      buildingName: (r.availability || {}).buildingName || buildingMap.get(buildingId) || "",
      availability: r.availability || {},
    });
  }

  // Build institution from real saved settings, with empty defaults (never hardcoded demo data).
  return {
    institution: {
      name: s.institution?.name || "",
      shortName: s.institution?.shortName || "",
      type: s.institution?.type || "",
      academicYearStart: s.institution?.academicYearStart || new Date().getFullYear(),
      city: s.institution?.city || "",
      state: s.institution?.state || "",
      country: s.institution?.country || "",
      established: s.institution?.established || "",
      website: s.institution?.website || "",
    },
    campusMode: s.campusMode || "single",
    campuses: s.campuses || [],
    availability: {
      workingDays: s.availability?.workingDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      dayStart: s.availability?.dayStart || "09:00",
      dayEnd: s.availability?.dayEnd || "17:00",
      slotDuration: s.availability?.slotDuration || 60,
      workingHours: s.availability?.workingHours || 8,
    },
    constraints: {
      maxClassesPerDay: s.constraints?.maxClassesPerDay || 6,
      maxSameSubjectPerDay: s.constraints?.maxSameSubjectPerDay || 1,
      minGapBetweenSameSubject: s.constraints?.minGapBetweenSameSubject || 1,
      avoidLastPeriod: s.constraints?.avoidLastPeriod || false,
      lunchStart: s.constraints?.lunchStart || "12:30",
      lunchDuration: s.constraints?.lunchDuration || 60,
      breakAfterPeriods: s.constraints?.breakAfterPeriods || 2,
      breakDuration: s.constraints?.breakDuration || 15,
      avoidFloorJump: s.constraints?.avoidFloorJump ?? true,
      maxFloorJump: s.constraints?.maxFloorJump || 1,
      allowSaturday: s.constraints?.allowSaturday || false,
    },
    faculty: facultyMapped,
    rooms: roomsMapped,
    courses,
    subjects,
    timetable: null,
  };
}

export { currentOrgId };

// Persist ALL wizard data to the backend — institution, campus, availability,
// constraints (via setup endpoint) + faculty, rooms, courses, sessions (via sync).
async function performSetupSync(setup) {
  const orgId = currentOrgId();
  if (!orgId) return { created: [], updated: [], skipped: [] };

  // 1) Save institution, campus, availability, constraints to Organization.settings
  await api.saveSetup(orgId, {
    institution: setup.institution || {},
    campusMode: setup.campusMode || "single",
    campuses: setup.campuses || [],
    availability: setup.availability || {},
    constraints: setup.constraints || {},
  }).catch((err) => {
    console.error("Setup save failed:", err);
  });

  // 2) Full-sync all resources (faculty, rooms, courses, classes, sessions)
  const facultyList = (setup.faculty || []).map((f) => ({
    client_id: f.id,
    name: f.name,
    employee_code: f.employeeId || "",
    max_weekly_hours: Number(f.maxWeeklyHours || 0),
    availability: {
      ...f.availability,
      maxClassesPerDay: f.maxClassesPerDay,
      days: f.availableDays,
      leaveDates: f.leaveDates,
      subjectIds: f.subjectIds,
      department: f.department,
    },
  }));

  // Build campus/building name lookup for room availability
  const campusNameLookup = new Map();
  const buildingNameLookup = new Map();
  for (const c of setup.campuses || []) {
    campusNameLookup.set(String(c.id), c.name || "");
    for (const b of c.buildings || []) {
      buildingNameLookup.set(String(b.id), b.name || "");
    }
  }

  const roomsList = (setup.rooms || []).map((r) => ({
    client_id: r.id,
    name: r.roomNumber || r.name,
    capacity: Number(r.capacity || 0),
    room_type: r.roomType || "classroom",
    facilities: r.facilities || {},
    availability: {
      ...r.availability,
      campusId: r.campusId,
      buildingId: r.buildingId,
      campusName: r.campusName || campusNameLookup.get(String(r.campusId)) || "",
      buildingName: r.buildingName || buildingNameLookup.get(String(r.buildingId)) || "",
    },
  }));

  const coursesList = (setup.courses || []).map((c) => ({
    client_id: c.id,
    name: c.name,
    code: c.code || "",
    metadata_json: {
      totalSemesters: c.totalSemesters,
      duration: c.duration,
      campusId: c.campusId,
      buildingId: c.buildingId,
    },
  }));

  // Build classes from courses/batches
  const classesList = [];
  for (const course of setup.courses || []) {
    for (const batch of course.batches || []) {
      classesList.push({
        client_id: batch.id,
        name: batch.name,
        course_id: course.id,
        courseName: course.name,
        batch_name: batch.name,
        section_number: batch.sections?.[0]?.number || 1,
        student_count: Number(batch.studentCount || 0),
        semester: Number(batch.currentSemester || 1),
        metadata_json: {
          admissionYear: Number(batch.admissionYear) || new Date().getFullYear(),
          admissionMonth: batch.admissionMonth || "",
        },
      });
    }
  }

  // Build sessions from subjects — one session per subject-batch pair
  const sessionsList = [];
  for (const sub of setup.subjects || []) {
    const course = (setup.courses || []).find((c) => c.id === sub.courseId);
    for (const batchId of sub.batchIds || []) {
      const batch = (course?.batches || []).find((b) => b.id === batchId);
      const section = batch?.sections?.[0];
      sessionsList.push({
        client_id: `${sub.id}:${batchId}`,
        subject_name: sub.name,
        subject_code: sub.code,
        course_id: course?.id,
        courseName: course?.name || "",
        class_id: batch?.id,
        className: batch?.name || "",
        section_name: `${batch?.name || course?.name || ""} Section ${section?.number || 1}`,
        weekly_periods: Number(sub.weeklyPeriods || 1),
        duration_minutes: Number(sub.durationMinutes || 60),
        mode: String(sub.type || "Lecture").toLowerCase().includes("lab") ? "lab" : "theory",
        student_count: Number(sub.studentCount || batch?.studentCount || 0),
        faculty_ids: sub.facultyIds || [],
      });
    }
  }

  const result = await api.fullSync({
    organization_id: orgId,
    courses: coursesList,
    faculty: facultyList,
    rooms: roomsList,
    classes: classesList,
    sessions: sessionsList,
  }).catch((err) => {
    console.error("Full sync failed:", err);
    return null;
  });

  return result || { status: "failed" };
}

export function saveSetupToBackend(setup) {
  const job = syncQueue.then(() => performSetupSync(setup));
  syncQueue = job.catch(() => {});
  return job;
}

export function resetSetupToBackend() {
  const orgId = currentOrgId();
  const job = syncQueue.then(() => {
    if (!orgId) {
      throw new Error("No organization found for the current account.");
    }
    return api.resetSetup(orgId);
  });
  syncQueue = job.catch(() => {});
  return job;
}
