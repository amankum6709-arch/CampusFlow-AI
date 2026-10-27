import { api } from "./api";

function currentUserOrgId() {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
    return user?.organization_id || null;
  } catch {
    return null;
  }
}

export async function ensureOrganization(setup) {
  const authOrg = currentUserOrgId();
  if (authOrg) {
    localStorage.setItem("campusflow.organizationId", authOrg);
    return authOrg;
  }
  const existing = localStorage.getItem("campusflow.organizationId");
  if (existing) return existing;

  const name = setup.institution.name?.trim();
  if (!name) {
    throw new Error("Institution name is required before generating a timetable.");
  }
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`.slice(0, 110);
  const organization = await api.createOrganization({ name, slug, timezone: "Asia/Kolkata" });
  localStorage.setItem("campusflow.organizationId", organization.id);
  return organization.id;
}

export const buildSchedulerConfiguration = (setup, selectedSubjectIds = null) => {
  const subjects = selectedSubjectIds
    ? setup.subjects.filter((subject) => selectedSubjectIds.includes(subject.id))
    : setup.subjects;

  const sessions = [];
  subjects.forEach((subject) => {
    const course = setup.courses.find((item) => item.id === subject.courseId);
    const batches = (course?.batches || []).filter((batch) =>
      !subject.batchIds?.length || subject.batchIds.includes(batch.id),
    );

    batches.forEach((batch) => {
      const sections = batch.sections?.length ? batch.sections : [{ id: `${batch.id}-section-1`, number: 1, studentCount: batch.studentCount || 0, groups: [] }];
      sections.forEach((section) => {
        const eligibleFaculty = (subject.facultyIds || []).filter((id) => setup.faculty.some((person) => person.id === id));
        sessions.push({
          id: `${subject.id}:${batch.id}:${section.id}`,
          courseId: course?.id,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code || "",
          facultyIds: eligibleFaculty,
          sectionName: `${batch.name || "Batch"}-${section.number || 1}`,
          batchId: batch.id,
          batchName: batch.name || "",
          batchYear: batch.admissionYear ?? null,
          batchSemester: batch.currentSemester ?? null,
          studentCount: Number(section.studentCount || batch.studentCount || 0),
          weeklyPeriods: Number(subject.weeklyPeriods || 1),
          mode: String(subject.type || "Lecture").toLowerCase().includes("lab") || String(subject.type || "").toLowerCase().includes("practical") ? "lab" : "theory",
          requiredFacilities: subject.requiredFacilities || [],
          campusId: course?.campusId,
          buildingId: course?.buildingId,
          groups: (section.groups || []).map((group) => ({ id: group.id, name: group.name, studentCount: group.studentCount })),
        });
      });
    });
  });

  const rooms = setup.rooms.map((room) => ({
    id: room.id,
    name: room.roomNumber || room.name,
    capacity: Number(room.capacity || 0),
    room_type: room.roomType || "classroom",
    facilities: room.facilities || {},
    timetableAvailable: room.timetableAvailable !== false,
    campusId: room.campusId,
    buildingId: room.buildingId,
    availability: room.availability || {},
  }));

  const faculty = setup.faculty.map((person) => ({
    id: person.id,
    name: person.name,
    max_weekly_hours: Number(person.maxWeeklyHours || setup.constraints.maxWeeklyHours || 18),
    max_classes_per_day: Number(person.maxClassesPerDay || setup.constraints.maxClassesPerDay || 0),
    availableDays: person.availableDays || setup.availability.workingDays,
    leaveDates: person.leaveDates || [],
    availability: person.availability || {},
  }));

  const slotDuration = Number(setup.availability.slotDuration || 60);
  const dayStartMinutes = toMinutes(setup.availability.dayStart);
  const dayEndMinutes = toMinutes(setup.availability.dayEnd);
  const periodCount = Math.max(1, Math.round((dayEndMinutes - dayStartMinutes) / slotDuration));
  const breakAfter = Number(setup.constraints.breakAfterPeriods || 0);
  const breakDuration = Number(setup.constraints.breakDuration || 0);
  const lunchStart = setup.availability.lunchStart || "12:30";
  const lunchDuration = Number(setup.availability.lunchDuration || 60);

  const period_times = {};
  let cursor = dayStartMinutes;
  let periodNum = 1;
  let sinceBreak = 0;

  for (let i = 0; i < periodCount; i++) {
    const startMin = cursor;
    const endMin = cursor + slotDuration;
    period_times[String(periodNum)] = `${minutesToHHMM(startMin)}-${minutesToHHMM(endMin)}`;
    periodNum++;
    cursor = endMin;
    sinceBreak++;
    if (breakAfter > 0 && sinceBreak >= breakAfter && cursor < toMinutes(lunchStart)) {
      cursor += breakDuration;
      sinceBreak = 0;
    }
    const lunchStartMin = toMinutes(lunchStart);
    if (cursor >= lunchStartMin && cursor < lunchStartMin + lunchDuration) {
      cursor = lunchStartMin + lunchDuration;
    }
  }

  return {
    days: setup.availability.workingDays,
    period_count: periodCount,
    day_start: setup.availability.dayStart || "09:00",
    day_end: setup.availability.dayEnd || "17:00",
    period_duration_minutes: slotDuration,
    lunch: { start: lunchStart, duration_minutes: lunchDuration },
    break: breakAfter > 0 ? { after_periods: breakAfter, duration_minutes: breakDuration } : null,
    period_times,
    sessions,
    rooms,
    faculty,
    max_classes_per_day: Number(setup.constraints.maxClassesPerDay || 0),
    max_same_subject_per_day: Number(setup.constraints.maxSameSubjectPerDay || 0),
    min_gap_between_same_subject: Number(setup.constraints.minGapBetweenSameSubject || 0),
    avoid_last_period: Boolean(setup.constraints.avoidLastPeriod),
    allowSaturday: Boolean(setup.constraints.allowSaturday),
    period_duration_hours: slotDuration / 60,
  };
};

function toMinutes(value) {
  const [hours, minutes] = String(value || "09:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
