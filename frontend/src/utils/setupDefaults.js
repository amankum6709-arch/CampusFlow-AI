// ============================================================
// Naam: Setup Defaults
// Kya karta hai: Wizard ke initial data objects provide karta hai.
// ============================================================

import { DEFAULT_CONSTRAINTS, DEFAULT_DAYS } from "./constants.js";
import { createId } from "./helpers.js";

export const createBuilding = (name = "", code = "") => ({
  id: createId("building"),
  name,
  code,
});

export const createCampus = (name = "Main Campus") => ({
  id: createId("campus"),
  name,
  buildings: [createBuilding("Block A")],
});

export const createGroup = (sectionId, name = "A", studentCount = 0) => ({
  id: createId("group"),
  sectionId,
  name,
  studentCount,
});

export const createSection = (number = 1, studentCount = 0, groupsEnabled = false, groupCount = 2) => {
  const sectionId = createId("section");
  const groups = groupsEnabled
    ? Array.from({ length: groupCount }, (_, index) =>
        createGroup(
          sectionId,
          String.fromCharCode(65 + index),
          Math.floor(studentCount / groupCount) + (index < studentCount % groupCount ? 1 : 0),
        ),
      )
    : [];

  return {
    id: sectionId,
    number,
    studentCount,
    groupsEnabled,
    groups,
  };
};

export const createSections = (studentCount, sectionCount, groupsEnabled = false, groupCount = 2) => {
  const totalStudents = Math.max(0, Number(studentCount) || 0);
  const totalSections = Math.max(1, Number(sectionCount) || 1);
  const base = Math.floor(totalStudents / totalSections);
  const remainder = totalStudents % totalSections;

  return Array.from({ length: totalSections }, (_, index) =>
    createSection(
      index + 1,
      base + (index < remainder ? 1 : 0),
      groupsEnabled,
      groupCount,
    ),
  );
};

export const createEmptyBatch = (courseId) => ({
  id: createId("batch"),
  name: "",
  admissionYear: new Date().getFullYear(),
  courseId,
  duration: "",
  currentSemester: 1,
  studentCount: 60,
  requiredTimetable: true,
  sectionCount: 1,
  groupsPerSection: 2,
  groupsEnabled: false,
  sections: createSections(60, 1, false, 2),
});

export const createEmptyCourse = () => ({
  id: createId("course"),
  name: "",
  duration: 3,
  totalSemesters: 6,
  campusId: "",
  buildingId: "",
  batches: [],
});

export const createEmptySubject = () => ({
  id: createId("subject"),
  name: "",
  code: "",
  courseId: "",
  semester: 1,
  type: "Lecture",
  weeklyPeriods: 3,
  durationMinutes: 60,
  batchIds: [],
  facultyIds: [],
  teachingScope: "section",
  requiredFacilities: [],
});

export const createEmptyFaculty = () => ({
  id: createId("faculty"),
  name: "",
  employeeId: "",
  department: "",
  subjectIds: [],
  maxClassesPerDay: DEFAULT_CONSTRAINTS.maxClassesPerDay,
  availableDays: DEFAULT_DAYS.slice(0, 5),
  leaveDates: [],
});

export const createInitialSetup = () => ({
  institution: {
    name: "",
    type: "",
    academicYearStart: new Date().getFullYear(),
  },
  campusMode: "single",
  campuses: [],
  rooms: [],
  courses: [],
  subjects: [],
  faculty: [],
  availability: {
    workingDays: DEFAULT_DAYS.slice(0, 5),
    dayStart: "09:00",
    dayEnd: "17:00",
    slotDuration: 60,
  },
  constraints: { ...DEFAULT_CONSTRAINTS },
  timetable: [],
});
