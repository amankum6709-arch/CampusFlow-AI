// ============================================================
// Naam: Setup Constants
// Kya karta hai: University setup aur timetable generator ke common options ko ek jagah rakhta hai.
// ============================================================

export const ROOM_TYPES = [
  "Classroom",
  "Computer Lab",
  "Laboratory",
  "Seminar Hall",
  "Auditorium",
  "Conference Room",
  "Workshop",
  "HOD Room",
  "Staff Room",
  "Other",
];

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DEFAULT_DAYS = DAYS.slice(0, 5);

export const COURSE_DURATIONS = [3, 4, 5];

export const SUBJECT_TYPES = [
  "Lecture",
  "Lab",
  "Tutorial",
  "Practical",
  "Seminar",
];

export const INSTITUTION_TYPES = [
  "University",
  "College",
  "Institute",
  "School",
];

export const CAMPUS_MODES = ["single", "multiple"];

export const TEACHING_SCOPES = [
  "section",
  "group",
];

export const SETUP_STORAGE_KEY = "campusflow-university-setup-v2";

export const DEFAULT_CONSTRAINTS = {
  workingDays: DEFAULT_DAYS,
  dayStart: "09:00",
  dayEnd: "17:00",
  slotDuration: 60,
  breakAfterPeriods: 2,
  breakDuration: 15,
  lunchStart: "12:55",
  lunchDuration: 90,
  maxSameSubjectPerDay: 1,
  maxClassesPerDay: 6,
  minGapBetweenSameSubject: 1,
  avoidFloorJump: true,
  maxFloorJump: 1,
  allowSaturday: false,
};
