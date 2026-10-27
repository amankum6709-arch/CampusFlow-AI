import test from "node:test";
import assert from "node:assert/strict";

import { remapSchedulerConfiguration } from "./idMapping.js";

const configuration = {
  rooms: [{ id: "client-room", name: "101", capacity: 40 }],
  faculty: [{ id: "client-faculty", name: "Dr Rao" }],
  sessions: [
    {
      id: "client-session",
      courseId: "client-course",
      facultyId: "client-faculty",
      facultyIds: ["client-faculty"],
      sectionName: "A",
    },
  ],
};

const idMap = {
  courses: { "client-course": "db-course" },
  faculty: { "client-faculty": "db-faculty" },
  rooms: { "client-room": "db-room" },
};

test("remaps scheduler FK IDs without mutating the source configuration", () => {
  const result = remapSchedulerConfiguration(configuration, idMap);

  assert.equal(result.rooms[0].id, "db-room");
  assert.equal(result.faculty[0].id, "db-faculty");
  assert.equal(result.sessions[0].courseId, "db-course");
  assert.equal(result.sessions[0].facultyId, "db-faculty");
  assert.deepEqual(result.sessions[0].facultyIds, ["db-faculty"]);
  assert.equal(result.sessions[0].id, "client-session");
  assert.equal(configuration.rooms[0].id, "client-room");
});

test("rejects unmapped room, faculty, and course IDs", () => {
  assert.throws(
    () => remapSchedulerConfiguration(configuration, { ...idMap, rooms: {} }),
    /room "client-room"/,
  );
  assert.throws(
    () => remapSchedulerConfiguration(configuration, { ...idMap, faculty: {} }),
    /faculty "client-faculty"/,
  );
  assert.throws(
    () => remapSchedulerConfiguration(configuration, { ...idMap, courses: {} }),
    /course "client-course"/,
  );
});
