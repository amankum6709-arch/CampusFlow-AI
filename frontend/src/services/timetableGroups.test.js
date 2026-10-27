import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCourseOptions,
  buildTimetableGroups,
  enrichEntries,
  formatTimetableHeading,
  formatTimetableMeta,
} from "./timetableGroups.js";

const setup = {
  courses: [
    {
      id: "course-1",
      name: "BCA",
      code: "BCA",
      batches: [
        {
          id: "batch-1",
          name: "A",
          admissionYear: 2025,
          currentSemester: 3,
          sections: [
            { id: "section-1", number: 1 },
            { id: "section-2", number: 2 },
          ],
        },
        {
          id: "batch-2",
          name: "B",
          admissionYear: 2025,
          currentSemester: 3,
          sections: [{ id: "section-3", number: 1 }],
        },
        {
          id: "batch-4",
          name: "A",
          admissionYear: 2024,
          currentSemester: 1,
          sections: [{ id: "section-5", number: 1 }],
        },
      ],
    },
    {
      id: "course-2",
      name: "MCA",
      code: "MCA",
      batches: [
        {
          id: "batch-3",
          name: "A",
          admissionYear: 2025,
          currentSemester: 1,
          sections: [{ id: "section-4", number: 1 }],
        },
      ],
    },
  ],
  subjects: [
    { id: "subject-1", name: "Mathematics", code: "MATH101", courseId: "course-1", semester: 3 },
    { id: "subject-2", name: "Computer Networks", code: "CS201", courseId: "course-2", semester: 1 },
  ],
};

const makeEntry = (overrides) => ({
  id: "entry-1",
  course_id: "course-1",
  course_name: "BCA",
  batch_id: "batch-1",
  section_name: "A-1",
  day: "Monday",
  period: 1,
  locked: false,
  ...overrides,
});

test("separates batches in the same course and merges sections of one batch", () => {
  const groups = buildTimetableGroups(
    [
      makeEntry({ id: "entry-1", section_name: "A-1", period: 1 }),
      makeEntry({ id: "entry-2", section_name: "A-2", period: 2 }),
      makeEntry({ id: "entry-3", batch_id: "batch-2", section_name: "B-1", day: "Tuesday" }),
    ],
    { setup },
  );

  assert.equal(groups.length, 2);

  const batchA = groups.find((group) => group.batchId === "batch-1");
  assert.equal(batchA.entries.length, 2);
  assert.deepEqual(batchA.sections, ["A-1", "A-2"]);
  assert.equal(batchA.batchName, "A");
  assert.equal(batchA.batchYear, 2025);
});

test("keeps batches separate when display names match but batch IDs differ", () => {
  const groups = buildTimetableGroups(
    [
      makeEntry({ id: "entry-1", batch_id: "batch-1", section_name: "BCA-A MATH101-1" }),
      makeEntry({ id: "entry-2", batch_id: "batch-4", section_name: "BCA-A NET101-1", period: 2 }),
    ],
    { setup },
  );

  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.map((group) => group.key)).size, 2);

  const currentBatch = groups.find((group) => group.batchId === "batch-1");
  const previousBatch = groups.find((group) => group.batchId === "batch-4");
  assert.equal(currentBatch.entryCount, 1);
  assert.equal(previousBatch.entryCount, 1);
  assert.equal(currentBatch.batchName, "A");
  assert.equal(previousBatch.batchName, "A");
  assert.equal(currentBatch.batchYear, 2025);
  assert.equal(previousBatch.batchYear, 2024);
  assert.deepEqual(currentBatch.entries.map((entry) => entry.subjectName), ["MATH101"]);
  assert.deepEqual(previousBatch.entries.map((entry) => entry.subjectName), ["NET101"]);
  assert.equal(formatTimetableHeading(currentBatch), "BCA | 2025 | Batch A Timetable");
  assert.equal(formatTimetableHeading(previousBatch), "BCA | 2024 | Batch A Timetable");

  const options = buildCourseOptions(groups);
  assert.equal(options.length, 1);
  assert.equal(options[0].groupCount, 2);
  assert.equal(options[0].entryCount, 2);
});

test("keeps identically named batches in different courses separate", () => {
  const groups = buildTimetableGroups(
    [
      makeEntry({ id: "entry-1", section_name: "Section A" }),
      makeEntry({
        id: "entry-2",
        course_id: "course-2",
        course_name: "MCA",
        batch_id: "batch-3",
        section_name: "Section A",
      }),
    ],
    { setup },
  );

  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.map((group) => group.key)).size, 2);

  const options = buildCourseOptions(groups);
  assert.equal(options.length, 2);
  assert.deepEqual(options.map((option) => option.name), ["BCA", "MCA"]);
});

test("falls back to section names when legacy entries have no batch ID", () => {
  const groups = buildTimetableGroups(
    [
      makeEntry({ id: "entry-1", batch_id: null, section_name: "Section A" }),
      makeEntry({ id: "entry-2", batch_id: null, section_name: "Section B", period: 2 }),
    ],
    { setup },
  );

  assert.equal(groups.length, 2);
  assert.equal(groups[0].batchId, null);
  assert.deepEqual(groups.map((group) => group.batchName), ["Section A", "Section B"]);
  assert.equal(new Set(groups.map((group) => group.key)).size, 2);
});

test("does not treat a year-prefixed batch name as a course", () => {
  const configuration = {
    sessions: [
      {
        id: "session-bca",
        courseId: "course-bca",
        courseName: "BCA",
        batchId: "batch-bca",
        sectionName: "2025-A-1",
      },
      {
        id: "session-mca",
        courseId: "course-mca",
        courseName: "MCA",
        batchId: "batch-mca",
        sectionName: "2025-B-1",
      },
    ],
  };

  const groups = buildTimetableGroups(
    [
      makeEntry({
        id: "entry-1",
        course_id: null,
        course_name: null,
        batch_id: null,
        session_id: "session-bca",
        section_name: "2025-A-1",
      }),
      makeEntry({
        id: "entry-2",
        course_id: null,
        course_name: null,
        batch_id: null,
        session_id: "session-mca",
        section_name: "2025-B-1",
        period: 2,
      }),
    ],
    { configuration },
  );

  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.map((group) => group.key)).size, 2);

  const options = buildCourseOptions(groups);
  assert.equal(options.length, 2);
  assert.deepEqual(options.map((option) => option.name), ["BCA", "MCA"]);
  assert.equal(formatTimetableHeading(groups.find((group) => group.courseName === "BCA")), "BCA | 2025-A Timetable");
});

test("derives course and batch from section names when legacy IDs are subject-specific", () => {
  const configuration = {
    sessions: [
      {
        id: "subject-1:batch-a:batch-a",
        subjectId: "subject-1",
        courseId: "subject-course-1",
        batchId: "subject-batch-1",
        sectionName: "BCA-A MATH101-1",
      },
      {
        id: "subject-2:batch-a:batch-a",
        subjectId: "subject-2",
        courseId: "subject-course-2",
        batchId: "subject-batch-2",
        sectionName: "BCA-A NET101-1",
      },
      {
        id: "subject-1:batch-b:batch-b",
        subjectId: "subject-1",
        courseId: "subject-course-1",
        batchId: "subject-batch-3",
        sectionName: "BCA-B MATH101-2",
      },
    ],
  };

  const groups = buildTimetableGroups(
    [
      makeEntry({
        id: "entry-1",
        course_id: null,
        course_name: null,
        batch_id: "subject-batch-1",
        section_name: "BCA-A MATH101-1",
        session_id: "subject-1:batch-a:batch-a",
      }),
      makeEntry({
        id: "entry-2",
        course_id: null,
        course_name: null,
        batch_id: "subject-batch-2",
        section_name: "BCA-A NET101-1",
        session_id: "subject-2:batch-a:batch-a",
        period: 2,
      }),
      makeEntry({
        id: "entry-3",
        course_id: null,
        course_name: null,
        batch_id: "subject-batch-3",
        section_name: "BCA-B MATH101-2",
        session_id: "subject-1:batch-b:batch-b",
      }),
    ],
    { configuration },
  );

  assert.equal(groups.length, 2);

  const batchA = groups.find((group) => group.batchName === "A");
  const batchB = groups.find((group) => group.batchName === "B");
  assert.equal(batchA.courseName, "BCA");
  assert.equal(batchA.entryCount, 2);
  assert.deepEqual(batchA.sections, ["BCA-A MATH101-1", "BCA-A NET101-1"]);
  assert.deepEqual(
    batchA.entries.map((entry) => entry.subjectName),
    ["MATH101", "NET101"],
  );
  assert.equal(batchB.courseName, "BCA");
  assert.equal(batchB.entryCount, 1);

  const options = buildCourseOptions(groups);
  assert.equal(options.length, 1);
  assert.equal(options[0].name, "BCA");
  assert.equal(options[0].groupCount, 2);
  assert.equal(options[0].entryCount, 3);
  assert.equal(formatTimetableHeading(batchA), "BCA | Batch A Timetable");
});

test("uses scheduler configuration metadata when database subject lookup is unavailable", () => {
  const rawEntry = makeEntry({
    course_id: "db-course",
    course_name: "BCA (DB)",
    session_id: "subject-1:batch-1:section-1:1",
    unit_id: "subject-1:batch-1:section-1-unit",
  });
  const configuration = {
    days: ["Monday", "Tuesday"],
    sessions: [
      {
        id: "subject-1:batch-1:section-1",
        subjectId: "subject-1",
        courseId: "db-course",
        batchId: "batch-1",
        subjectName: "Advanced Mathematics",
        subjectCode: "MATH201",
        batchName: "A",
        batchYear: 2025,
        batchSemester: 3,
      },
    ],
  };

  const [entry] = enrichEntries([rawEntry], { configuration, setup });

  assert.equal(entry.subjectName, "Advanced Mathematics");
  assert.equal(entry.subjectCode, "MATH201");
  assert.equal(entry.batchName, "A");
  assert.equal(entry.batchYear, 2025);
  assert.equal(entry.batchSemester, 3);
  assert.equal(rawEntry.subjectName, undefined);
});

test("enriches subject and batch details from the organization setup", () => {
  const [entry] = enrichEntries(
    [
      makeEntry({
        session_id: "subject-1:batch-1:section-1:1",
        section_name: "A-1",
      }),
    ],
    { setup },
  );

  assert.equal(entry.courseName, "BCA");
  assert.equal(entry.subjectName, "Mathematics");
  assert.equal(entry.subjectCode, "MATH101");
  assert.equal(entry.batchName, "A");
  assert.equal(entry.batchYear, 2025);
  assert.equal(entry.batchSemester, 3);
});

test("formats a course and batch heading with timetable metadata", () => {
  const [group] = buildTimetableGroups(
    [
      makeEntry({ id: "entry-1", section_name: "A-1" }),
      makeEntry({ id: "entry-2", section_name: "A-2", period: 2 }),
    ],
    { setup },
  );

  assert.equal(formatTimetableHeading(group), "BCA | 2025 | Batch A Timetable");

  const meta = formatTimetableMeta(group);
  assert.match(meta, /BCA/);
  assert.match(meta, /Academic Year 2025/);
  assert.match(meta, /Semester 3/);
  assert.match(meta, /2 sections/);
  assert.match(meta, /2 classes/);
});
