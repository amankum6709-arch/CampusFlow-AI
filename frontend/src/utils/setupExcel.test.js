import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import { buildSetupTemplateWorkbook } from "./setupExcelExport.js";
import {
  importSetupFile,
  mergeImportedSetup,
  validateImportedSetup,
} from "./setupExcelImport.js";

const institutionHeaders = [
  "Institution Name",
  "Short Name",
  "Institution Type",
  "Academic Year Start",
  "City",
  "State",
  "Country",
  "Established",
  "Website",
  "Campus Mode",
];

const campusHeaders = ["Campus Name", "Building Name", "Building Code"];
const roomHeaders = ["Room", "Campus", "Building", "Floor", "Room Type", "Capacity"];
const facultyHeaders = ["Faculty Name", "Faculty ID", "Department", "Subject Codes"];
const subjectHeaders = ["Subject", "Subject Code", "Course"];
const batchHeaders = ["Batch", "Course", "Section", "Students", "Admission Year", "Admission Month"];
const courseHeaders = ["Course", "Course Code", "Duration", "Campus", "Building"];

function addSheet(workbook, name, rows) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

function buildImportWorkbook() {
  const workbook = XLSX.utils.book_new();

  addSheet(workbook, "Institution", [
    institutionHeaders,
    ["Test University", "TU", "University", "2024", "Pune", "MH", "India", "1990", "https://tu.test", "Multiple"],
  ]);
  addSheet(workbook, "Campus", [
    campusHeaders,
    ["Main Campus", "Block A", "A"],
    ["North Campus", "Block B", "B"],
  ]);
  addSheet(workbook, "Rooms", [
    roomHeaders,
    ["101", "Main Campus", "Block A", "1", "Classroom", "40"],
    ["201", "North Campus", "Block B", "2", "Laboratory", "30"],
  ]);
  addSheet(workbook, "Faculty", [
    facultyHeaders,
    ["Dr Rao", "E1", "CS", "CS101, MA101"],
    ["Dr Shah", "E2", "CS", "CS201"],
  ]);
  addSheet(workbook, "Subjects", [
    subjectHeaders,
    ["Programming", "CS101", "BCA"],
    ["Maths", "MA101", "BCA"],
    ["Networks", "CS201", "MCA"],
  ]);
  addSheet(workbook, "Batches", [
    batchHeaders,
    ["BCA 2024", "BCA", "1", "60", "2024", "August"],
    ["BCA 2025", "BCA", "1", "60", "2025", "August"],
  ]);
  addSheet(workbook, "Courses", [
    courseHeaders,
    ["BCA", "BCA", "3", "Main Campus", "Block A"],
    ["MCA", "MCA", "2", "North Campus", "Block B"],
  ]);

  return workbook;
}

function fakeFile(workbook, name = "setup.xlsx") {
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    name,
    arrayBuffer: async () => buffer,
  };
}

function existingSetup() {
  return {
    institution: {
      name: "Existing University",
      city: "Mumbai",
      type: "College",
    },
    campusMode: "single",
    campuses: [
      {
        id: "c-main",
        name: "Main Campus",
        buildings: [{ id: "b-a", name: "Block A" }],
      },
    ],
    rooms: [],
    courses: [
      {
        id: "course-bca",
        name: "BCA",
        code: "",
        duration: 3,
        totalSemesters: 6,
        campusId: "",
        buildingId: "",
        batches: [],
      },
    ],
    subjects: [
      {
        id: "sub-cs101",
        name: "Programming",
        code: "CS101",
        courseId: "course-bca",
        batchIds: [],
        facultyIds: [],
      },
      {
        id: "sub-ma101",
        name: "Maths",
        code: "MA101",
        courseId: "course-bca",
        batchIds: [],
        facultyIds: [],
      },
    ],
    faculty: [
      {
        id: "fac-rao",
        name: "Dr Rao",
        employeeId: "E1",
        department: "",
        subjectIds: [],
        maxClassesPerDay: null,
        availableDays: [],
      },
    ],
    availability: {
      workingDays: ["Monday"],
      dayStart: "09:00",
      dayEnd: "17:00",
      slotDuration: 60,
    },
    constraints: {
      maxClassesPerDay: 6,
      allowSaturday: false,
    },
    timetable: [],
  };
}

test("exports the extended 11-sheet setup template", async () => {
  const { workbook } = await buildSetupTemplateWorkbook();

  assert.deepEqual(workbook.SheetNames, [
    "Instructions",
    "Institution",
    "Campus",
    "Timetable",
    "Rooms",
    "Faculty",
    "Subjects",
    "Batches",
    "Courses",
    "Availability",
    "Constraints",
  ]);

  const headers = (sheetName) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })[0];

  assert.deepEqual(headers("Institution"), institutionHeaders);
  assert.deepEqual(headers("Campus"), campusHeaders);
  assert.deepEqual(headers("Rooms"), roomHeaders);
  assert.deepEqual(headers("Faculty"), facultyHeaders);
  assert.deepEqual(headers("Batches"), batchHeaders);
  assert.deepEqual(headers("Courses"), courseHeaders);
});

test("imports, validates, and merges setup data without duplicates", async () => {
  const imported = await importSetupFile(fakeFile(buildImportWorkbook()));
  const existing = existingSetup();

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.campusMode, "Multiple");
  assert.equal(imported.campuses.length, 2);
  assert.equal(imported.rooms[0].timetableAvailable, true);

  const validation = validateImportedSetup(imported, existing);
  assert.deepEqual(validation.errors, []);

  const merged = mergeImportedSetup(imported, existing);

  assert.equal(merged.institution.name, "Test University");
  assert.equal(merged.institution.city, "Pune");
  assert.equal(merged.institution.type, "University");
  assert.equal(merged.campusMode, "multiple");

  assert.equal(merged.campuses.length, 2);
  assert.equal(merged.campuses[0].buildings.length, 1);
  assert.equal(merged.campuses[0].buildings[0].code, "A");

  assert.equal(merged.rooms.length, 2);
  assert.equal(merged.rooms[0].campusId, "c-main");
  assert.equal(merged.rooms[0].buildingId, "b-a");
  assert.equal(merged.rooms[1].campusId, merged.campuses[1].id);
  assert.equal(merged.rooms[1].buildingId, merged.campuses[1].buildings[0].id);

  assert.equal(merged.courses.length, 2);
  assert.equal(merged.courses[0].id, "course-bca");
  assert.equal(merged.courses[0].campusId, "c-main");
  assert.equal(merged.courses[0].buildingId, "b-a");

  const bca = merged.courses.find((course) => course.name === "BCA");
  assert.equal(bca.batches.length, 2);
  assert.deepEqual(
    bca.batches.map((batch) => batch.admissionYear).sort(),
    [2024, 2025],
  );
  assert.ok(bca.batches.every((batch) => batch.admissionMonth === "August"));
  assert.equal(new Set(bca.batches.map((batch) => batch.id)).size, 2);

  assert.equal(merged.faculty.length, 2);
  const rao = merged.faculty.find((person) => person.employeeId === "E1");
  const shah = merged.faculty.find((person) => person.employeeId === "E2");
  assert.deepEqual(rao.subjectIds.sort(), ["sub-cs101", "sub-ma101"]);
  assert.equal(shah.subjectIds.length, 1);

  const networks = merged.subjects.find((subject) => subject.code === "CS201");
  assert.deepEqual(networks.facultyIds, [shah.id]);
  assert.ok(merged.subjects.find((subject) => subject.code === "CS101").facultyIds.includes("fac-rao"));

  assert.equal(existing.campuses[0].buildings[0].code, undefined);
  assert.deepEqual(existing.faculty[0].subjectIds, []);

  const mergedAgain = mergeImportedSetup(imported, merged);
  assert.equal(mergedAgain.campuses.length, 2);
  assert.equal(mergedAgain.rooms.length, 2);
  assert.equal(mergedAgain.courses.length, 2);
  assert.equal(mergedAgain.courses.find((course) => course.name === "BCA").batches.length, 2);
  assert.equal(mergedAgain.subjects.length, 3);
  assert.equal(mergedAgain.faculty.length, 2);
});

test("syncs existing subject faculty assignments back to faculty", () => {
  const existing = existingSetup();
  existing.faculty.push({
    id: "fac-extra",
    name: "Dr Extra",
    employeeId: "E3",
    department: "",
    subjectIds: [],
    maxClassesPerDay: null,
    availableDays: [],
  });
  existing.subjects[0].facultyIds = ["fac-extra"];

  const merged = mergeImportedSetup(
    {
      campuses: [],
      rooms: [],
      courses: [],
      subjects: [],
      faculty: [],
      availability: {},
      constraints: {},
      timetable: [],
    },
    existing,
  );

  const extra = merged.faculty.find((person) => person.id === "fac-extra");
  assert.deepEqual(extra.subjectIds, ["sub-cs101"]);
  assert.deepEqual(
    merged.subjects.find((subject) => subject.id === "sub-cs101").facultyIds,
    ["fac-extra"],
  );
});

test("rejects single campus mode when multiple campuses are present", async () => {
  const imported = await importSetupFile(fakeFile(buildImportWorkbook()));
  imported.campusMode = "Single";

  const validation = validateImportedSetup(imported, existingSetup());
  assert.ok(validation.errors.some((error) => /Campus Mode is Single/.test(error)));
});

test("rejects unknown faculty subject codes", async () => {
  const imported = await importSetupFile(fakeFile(buildImportWorkbook()));
  imported.faculty[0].subjectCodes = ["UNKNOWN"];

  const validation = validateImportedSetup(imported, existingSetup());
  assert.ok(validation.errors.some((error) => /Unknown subject code/.test(error)));
});

test("blank imported fields do not overwrite existing values", () => {
  const merged = mergeImportedSetup(
    {
      institution: { name: "", city: "", type: "" },
      campusMode: "",
      campuses: [],
      rooms: [],
      courses: [],
      subjects: [],
      faculty: [],
      availability: {},
      constraints: {},
    },
    existingSetup(),
  );

  assert.equal(merged.institution.name, "Existing University");
  assert.equal(merged.institution.city, "Mumbai");
  assert.equal(merged.institution.type, "College");
  assert.equal(merged.campusMode, "single");
  assert.deepEqual(merged.availability, existingSetup().availability);
  assert.deepEqual(merged.constraints, existingSetup().constraints);
});
