// ============================================================
// CampusFlow Scheduling Engine
// Hard rules first, optimization second.
// Theory: whole section together in one room with one faculty member.
// Lab/Practical: all groups of a section run together, each group gets
// a different physical room and a different faculty member.
// ============================================================

import { getMinutes } from "../utils/helpers";

const TEACHING_ROOM_TYPES = new Set([
  "Classroom",
  "Computer Lab",
  "Laboratory",
  "Seminar Hall",
  "Auditorium",
  "Conference Room",
  "Workshop",
  "Other",
]);

const LAB_TYPES = new Set(["Lab", "Practical"]);

const overlaps = (a, b) =>
  a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;

const hashString = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed) => {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (items, random) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
};

const roomHasFacilities = (room, requiredFacilities = []) =>
  requiredFacilities.every((facility) => room.facilities?.[facility] === true);

const facultyCanTeach = (person, subject) => {
  if (Array.isArray(subject.facultyIds) && subject.facultyIds.length) {
    return subject.facultyIds.includes(person.id);
  }
  return (person.subjectIds || []).includes(subject.id);
};

const getCourseBatches = (courses) =>
  courses.flatMap((course) =>
    (course.batches || []).map((batch) => ({
      ...batch,
      courseId: course.id,
      courseName: course.name,
      campusId: batch.campusId || course.campusId,
      buildingId: batch.buildingId || course.buildingId,
    })),
  );

const createGroups = (section) => {
  if (Array.isArray(section.groups) && section.groups.length) return section.groups;

  const count = Math.max(2, Number(section.groupsPerSection || 2));
  const students = Number(section.studentCount || 0);
  const base = Math.floor(students / count);
  const remainder = students % count;

  return Array.from({ length: count }, (_, index) => ({
    id: `${section.id}-group-${index + 1}`,
    name: String.fromCharCode(65 + index),
    studentCount: base + (index < remainder ? 1 : 0),
  }));
};

const normalizeSections = (batch) => {
  if (Array.isArray(batch.sections) && batch.sections.length) {
    return batch.sections.map((section, index) => {
      if (typeof section === "string") {
        return {
          id: `${batch.id}-section-${index + 1}`,
          number: index + 1,
          studentCount: Math.ceil(Number(batch.studentCount || 0) / batch.sections.length),
          groupsEnabled: false,
          groups: [],
        };
      }

      return {
        ...section,
        id: section.id || `${batch.id}-section-${index + 1}`,
        number: Number(section.number || index + 1),
        studentCount: Number(section.studentCount || 0),
        groupsEnabled: Boolean(section.groupsEnabled),
        groups: Array.isArray(section.groups) ? section.groups : [],
      };
    });
  }

  const count = Math.max(1, Number(batch.sectionCount || 1));
  const total = Number(batch.studentCount || 0);
  const base = Math.floor(total / count);
  const remainder = total % count;

  return Array.from({ length: count }, (_, index) => {
    const studentCount = base + (index < remainder ? 1 : 0);
    return {
      id: `${batch.id}-section-${index + 1}`,
      number: index + 1,
      studentCount,
      groupsEnabled: Boolean(batch.groupsEnabled),
      groups: batch.groupsEnabled
        ? createGroups({
            id: `${batch.id}-section-${index + 1}`,
            studentCount,
            groupsPerSection: batch.groupsPerSection || 2,
          })
        : [],
    };
  });
};

const isLabSubject = (subject) => LAB_TYPES.has(subject.type);

const buildTeachingUnits = (subject, batches) => {
  const units = [];
  const labSubject = isLabSubject(subject);

  batches.forEach((batch) => {
    normalizeSections(batch).forEach((section) => {
      if (!labSubject || !section.groupsEnabled || !section.groups?.length) {
        units.push({
          id: `${subject.id}-${batch.id}-${section.id}`,
          batchId: batch.id,
          batchName: batch.name,
          sectionId: section.id,
          sectionNumber: section.number,
          groupId: null,
          groupName: null,
          studentCount: Number(section.studentCount || batch.studentCount || 0),
          courseId: batch.courseId,
          courseName: batch.courseName,
          campusId: batch.campusId,
          buildingId: batch.buildingId,
          mode: labSubject ? "section" : "theory",
        });
        return;
      }

      section.groups.forEach((group) => {
        units.push({
          id: `${subject.id}-${batch.id}-${section.id}-${group.id}`,
          batchId: batch.id,
          batchName: batch.name,
          sectionId: section.id,
          sectionNumber: section.number,
          groupId: group.id,
          groupName: group.name,
          studentCount: Number(group.studentCount || 0),
          courseId: batch.courseId,
          courseName: batch.courseName,
          campusId: batch.campusId,
          buildingId: batch.buildingId,
          mode: "lab-group",
        });
      });
    });
  });

  return units;
};

const createSlots = (start, end, duration, lunchStart, lunchDuration, breakAfterPeriods = 0, breakDuration = 0) => {
  const startMinutes = getMinutes(start);
  const endMinutes = getMinutes(end);
  const lunchStartMinutes = lunchStart ? getMinutes(lunchStart) : null;
  const lunchEndMinutes =
    lunchStartMinutes == null ? null : lunchStartMinutes + Number(lunchDuration || 0);
  const slots = [];
  const step = Math.max(1, Number(duration || 60));
  const periodsBeforeBreak = Math.max(0, Number(breakAfterPeriods || 0));
  const breakMinutes = Math.max(0, Number(breakDuration || 0));
  let minute = startMinutes;
  let periodsSinceBreak = 0;

  while (minute + step <= endMinutes) {
    // Never create a class that crosses the lunch window. Jump directly to
    // the end of lunch when the next slot would overlap it.
    if (lunchStartMinutes != null && lunchEndMinutes != null) {
      if (minute >= lunchStartMinutes && minute < lunchEndMinutes) {
        minute = lunchEndMinutes;
        periodsSinceBreak = 0;
        continue;
      }
      if (minute < lunchStartMinutes && minute + step > lunchStartMinutes) {
        minute = lunchEndMinutes;
        periodsSinceBreak = 0;
        continue;
      }
    }

    const slotEnd = minute + step;
    const hours = Math.floor(minute / 60).toString().padStart(2, "0");
    const minutes = (minute % 60).toString().padStart(2, "0");
    const endHours = Math.floor(slotEnd / 60).toString().padStart(2, "0");
    const endMins = (slotEnd % 60).toString().padStart(2, "0");

    slots.push({
      index: slots.length,
      start: `${hours}:${minutes}`,
      end: `${endHours}:${endMins}`,
      startMinutes: minute,
      endMinutes: slotEnd,
    });

    minute = slotEnd;
    periodsSinceBreak += 1;
    if (periodsBeforeBreak > 0 && periodsSinceBreak >= periodsBeforeBreak) {
      minute += breakMinutes;
      periodsSinceBreak = 0;
    }
  }

  return slots;
};

const describeUnit = (unit) => {
  const section = unit.sectionNumber ? `Section ${unit.sectionNumber}` : "Batch";
  const group = unit.groupName ? ` • Group ${unit.groupName}` : "";
  return `${unit.courseName || "Course"} • ${unit.batchName || "Batch"} • ${section}${group}`;
};

const conflict = (type, message, solution, meta = {}) => ({
  type,
  message,
  solution,
  ...meta,
});

const getRoomCandidates = (rooms, unit, subject) =>
  rooms
    .filter((room) => {
      if (!room.timetableAvailable) return false;
      if (!TEACHING_ROOM_TYPES.has(room.roomType || "Classroom")) return false;
      if (Number(room.capacity || 0) < Number(unit.studentCount || 0)) return false;
      if (!roomHasFacilities(room, subject.requiredFacilities || [])) return false;

      if (unit.campusId && room.campusId && String(unit.campusId) !== String(room.campusId)) return false;
      if (unit.buildingId && room.buildingId && String(unit.buildingId) !== String(room.buildingId)) return false;
      return true;
    })
    .sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0));

const buildSessions = (setup, subjects, batchMap) => {
  const sessions = [];

  subjects.forEach((subject) => {
    const eligibleBatches = (subject.batchIds || [])
      .map((id) => batchMap.get(id))
      .filter(Boolean)
      .filter((batch) => batch.requiredTimetable !== false);

    const units = buildTeachingUnits(subject, eligibleBatches);
    const periods = Math.max(1, Number(subject.weeklyPeriods || 1));
    const groupsBySection = new Map();

    units.forEach((unit) => {
      const key = `${unit.batchId}-${unit.sectionId}`;
      if (!groupsBySection.has(key)) groupsBySection.set(key, []);
      groupsBySection.get(key).push(unit);
    });

    groupsBySection.forEach((sectionUnits) => {
      const first = sectionUnits[0];
      const isLab = sectionUnits.some((unit) => unit.mode === "lab-group");
      for (let periodIndex = 0; periodIndex < periods; periodIndex += 1) {
        sessions.push({
          id: `session-${subject.id}-${first.batchId}-${first.sectionId}-${periodIndex + 1}`,
          subject,
          units: sectionUnits,
          isLab,
          periodIndex,
          sectionKey: `${first.courseId}-${first.batchId}-${first.sectionId}`,
          label: `${subject.name || "Subject"} • ${describeUnit(first)}`,
        });
      }
    });
  });

  return sessions;
};

const getWorkingDays = (setup) => {
  const configured = setup.constraints?.workingDays?.length
    ? setup.constraints.workingDays
    : setup.availability?.workingDays || [];

  return setup.constraints?.allowSaturday
    ? configured
    : configured.filter((day) => day !== "Saturday");
};

const countDayLoad = (map, id, day) =>
  (map.get(id) || []).filter((item) => item.day === day).length;

const isBusy = (map, id, day, slot) =>
  (map.get(id) || []).some((item) => item.day === day && overlaps(item, slot));

const maxClassesFor = (person, setup) => {
  // Constraints > Maximum Classes / Faculty / Day is the single source of truth.
  // Faculty records may contain an older/imported value, but generation must use
  // the current global limit so the Faculty page and scheduler never disagree.
  const global = Number(setup.constraints?.maxClassesPerDay);
  if (Number.isFinite(global) && global > 0) return global;

  const personal = Number(person.maxClassesPerDay);
  return Number.isFinite(personal) && personal > 0 ? personal : 99;
};

const facultyAvailable = (person, day) => (person.availableDays || []).includes(day);

const facultyCanTake = (person, day, slot, facultyAssignments, setup) => {
  if (!facultyAvailable(person, day)) return false;
  if (countDayLoad(facultyAssignments, person.id, day) >= maxClassesFor(person, setup)) return false;
  if (Array.isArray(person.leaveDates) && person.leaveDates.includes(day)) return false;
  return !isBusy(facultyAssignments, person.id, day, slot);
};

const roomCanTake = (room, day, slot, roomAssignments) =>
  !isBusy(roomAssignments, room.id, day, slot);

const addAssignment = (state, assignment) => {
  state.result.push(assignment);
  const push = (map, key) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(assignment);
  };
  push(state.facultyAssignments, assignment.facultyId);
  push(state.roomAssignments, assignment.roomId);
  push(state.batchAssignments, assignment.batchId);
  push(state.sectionAssignments, assignment.sectionKey);
  push(state.subjectAssignments, assignment.subjectId);
  push(state.subjectSectionAssignments, `${assignment.subjectId}|${assignment.sectionKey}`);
};

const removeAssignment = (state, assignment) => {
  state.result = state.result.filter((item) => item.id !== assignment.id);
  [
    [state.facultyAssignments, assignment.facultyId],
    [state.roomAssignments, assignment.roomId],
    [state.batchAssignments, assignment.batchId],
    [state.sectionAssignments, assignment.sectionKey],
    [state.subjectAssignments, assignment.subjectId],
    [state.subjectSectionAssignments, `${assignment.subjectId}|${assignment.sectionKey}`],
  ].forEach(([map, key]) => {
    const next = (map.get(key) || []).filter((item) => item.id !== assignment.id);
    if (next.length) map.set(key, next);
    else map.delete(key);
  });
};

const makeAssignment = (session, unit, faculty, room, day, slot) => ({
  id: `${session.id}-${unit.id}-${day}-${slot.index}-${faculty.id}-${room.id}`,
  sessionId: session.id,
  subjectId: session.subject.id,
  subjectName: session.subject.name,
  subjectCode: session.subject.code,
  subjectType: session.subject.type,
  teachingScope: session.isLab ? "group" : "section",
  day,
  start: slot.start,
  end: slot.end,
  startMinutes: slot.startMinutes,
  endMinutes: slot.endMinutes,
  facultyId: faculty.id,
  facultyName: faculty.name,
  roomId: room.id,
  roomName: room.roomNumber,
  roomType: room.roomType,
  floor: Number(room.floor || 0),
  unitId: unit.id,
  sectionKey: session.sectionKey,
  batchId: unit.batchId,
  batchName: unit.batchName,
  sectionId: unit.sectionId,
  sectionNumber: unit.sectionNumber,
  groupId: unit.groupId,
  groupName: unit.groupName,
  studentCount: unit.studentCount,
  courseId: unit.courseId,
  courseName: unit.courseName,
});

const createState = () => ({
  result: [],
  facultyAssignments: new Map(),
  roomAssignments: new Map(),
  batchAssignments: new Map(),
  sectionAssignments: new Map(),
  subjectAssignments: new Map(),
  subjectSectionAssignments: new Map(),
});

const getSectionDayGapScore = (state, sectionKey, day, slot) => {
  const assignments = (state.sectionAssignments.get(sectionKey) || []).filter((item) => item.day === day);
  if (!assignments.length) return 0;

  const occupied = new Set(assignments.map((item) => item.startMinutes));
  let score = 0;
  const slotMinutes = slot.endMinutes - slot.startMinutes;

  assignments.forEach((item) => {
    const distance = Math.abs(item.startMinutes - slot.startMinutes) / Math.max(1, slotMinutes);
    if (distance === 1) score -= 20;
    else if (distance === 2) score -= 8;
    else score += distance * 4;
  });

  const min = Math.min(...[...occupied, slot.startMinutes]);
  const max = Math.max(...[...occupied, slot.startMinutes]);
  const occupiedCount = occupied.size + (occupied.has(slot.startMinutes) ? 0 : 1);
  score -= Math.max(0, (max - min) / Math.max(1, slotMinutes) + 1 - occupiedCount) * 30;
  return score;
};

const getSameSubjectScore = (state, session, day, slot, setup) => {
  const gap = Number(setup.constraints?.minGapBetweenSameSubject || 1);
  const key = `${session.subject.id}|${session.sectionKey}`;
  const assignments = state.subjectSectionAssignments.get(key) || [];
  const sameDay = assignments.filter((item) => item.day === day);
  const slotSize = Math.max(1, slot.endMinutes - slot.startMinutes);

  // Strongly prefer spreading a subject across different days. A theory subject
  // should not consume an entire day just because open rooms are available.
  let score = sameDay.length * 500;

  sameDay.forEach((item) => {
    const periodDistance = Math.abs(item.startMinutes - slot.startMinutes) / slotSize;
    if (periodDistance <= gap) score += 250;
    if (periodDistance <= 1) score += 180;
    else if (periodDistance <= 2) score += 60;
  });

  // Mild preference for a new day when this subject already has sessions elsewhere.
  const existingDays = new Set(assignments.map((item) => item.day));
  if (existingDays.size > 0 && !existingDays.has(day)) score -= 120;

  return score;
};

const getFloorScore = (state, facultyId, day, slot, room, setup) => {
  if (!setup.constraints?.avoidFloorJump) return 0;
  const previous = (state.facultyAssignments.get(facultyId) || [])
    .filter((item) => item.day === day && item.startMinutes < slot.startMinutes)
    .sort((a, b) => b.startMinutes - a.startMinutes)[0];

  if (!previous) return 0;
  const jump = Math.abs(Number(previous.floor || 0) - Number(room.floor || 0));
  return jump * 18;
};

const getOptionScore = (state, session, day, slot, faculty, room, setup, random) => {
  const sectionGap = getSectionDayGapScore(state, session.sectionKey, day, slot);
  const sameSubject = getSameSubjectScore(state, session, day, slot, setup);
  const floor = getFloorScore(state, faculty.id, day, slot, room, setup);
  const facultyLoad = countDayLoad(state.facultyAssignments, faculty.id, day) * 6;
  const roomLoad = countDayLoad(state.roomAssignments, room.id, day) * 2;
  const sectionDayLoad = countDayLoad(state.sectionAssignments, session.sectionKey, day);
  // Keep student schedules compact, but do not stack the same subject.
  const sameSectionDayPenalty = sectionDayLoad * 12;
  const activeDays = new Set((state.sectionAssignments.get(session.sectionKey) || []).map((item) => item.day));
  // Once a section already has a teaching day, strongly prefer filling an
  // existing day before opening another day. This prevents the classic
  // "one class on Monday, one on Tuesday" timetable shape.
  const newDayPenalty = activeDays.size > 0 && !activeDays.has(day) ? 260 : 0;
  const secondClassRepair = sectionDayLoad === 1 ? -220 : 0;
  const randomTie = random() * 3;
  return sectionGap + sameSubject + floor + facultyLoad + roomLoad + sameSectionDayPenalty + newDayPenalty + secondClassRepair + randomTie;
};

const findLabAllocation = (state, session, day, slot, facultyCandidates, roomCandidatesByUnit, setup, random) => {
  const chosen = [];
  const usedFaculty = new Set();
  const usedRooms = new Set();

  const orderedUnits = [...session.units].sort((a, b) => b.studentCount - a.studentCount);

  for (const unit of orderedUnits) {
    const faculties = shuffle(facultyCandidates.filter((person) => !usedFaculty.has(person.id)), random)
      .filter((person) => facultyCanTake(person, day, slot, state.facultyAssignments, setup))
      .sort((a, b) => countDayLoad(state.facultyAssignments, a.id, day) - countDayLoad(state.facultyAssignments, b.id, day));

    const suitableRooms = roomCandidatesByUnit.get(unit.id) || [];
    const rooms = shuffle(suitableRooms.filter((room) => !usedRooms.has(room.id)), random)
      .filter((room) => roomCanTake(room, day, slot, state.roomAssignments))
      .sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0));

    if (!faculties.length || !rooms.length) return null;

    const faculty = faculties[0];
    const room = rooms[0];
    chosen.push({ unit, faculty, room });
    usedFaculty.add(faculty.id);
    usedRooms.add(room.id);
  }

  return chosen;
};


const cloneState = (state) => ({
  result: [...state.result],
  facultyAssignments: new Map([...state.facultyAssignments].map(([key, value]) => [key, [...value]])),
  roomAssignments: new Map([...state.roomAssignments].map(([key, value]) => [key, [...value]])),
  sectionAssignments: new Map([...state.sectionAssignments].map(([key, value]) => [key, [...value]])),
  batchAssignments: new Map([...state.batchAssignments].map(([key, value]) => [key, [...value]])),
  subjectAssignments: new Map([...state.subjectAssignments].map(([key, value]) => [key, [...value]])),
  subjectSectionAssignments: new Map([...state.subjectSectionAssignments].map(([key, value]) => [key, [...value]])),
});

const restoreState = (target, source) => {
  target.result = source.result;
  target.facultyAssignments = source.facultyAssignments;
  target.roomAssignments = source.roomAssignments;
  target.sectionAssignments = source.sectionAssignments;
  target.batchAssignments = source.batchAssignments;
  target.subjectAssignments = source.subjectAssignments;
  target.subjectSectionAssignments = source.subjectSectionAssignments;
};

const conflictingAssignments = (state, session, day, slot, allocation) => {
  const ids = new Set();
  allocation.forEach(({ unit, faculty, room }) => {
    (state.sectionAssignments.get(session.sectionKey) || []).forEach((item) => {
      if (item.day === day && overlaps(item, slot)) ids.add(item.id);
    });
    (state.facultyAssignments.get(faculty.id) || []).forEach((item) => {
      if (item.day === day && overlaps(item, slot)) ids.add(item.id);
    });
    (state.roomAssignments.get(room.id) || []).forEach((item) => {
      if (item.day === day && overlaps(item, slot)) ids.add(item.id);
    });
    (state.batchAssignments.get(unit.batchId) || []).forEach((item) => {
      if (item.day === day && overlaps(item, slot)) ids.add(item.id);
    });
  });
  return state.result.filter((item) => ids.has(item.id));
};

const getSessionFromAssignment = (assignment, sessions) =>
  sessions.find((item) => item.id === assignment.sessionId);

const makeCandidateAllocations = (state, session, day, slot, setup, random, allowOccupied = false) => {
  const eligibleFaculty = (setup.faculty || []).filter((person) => facultyCanTeach(person, session.subject));
  const roomCandidates = session.units.map((unit) => getRoomCandidates(setup.rooms || [], unit, session.subject));
  if (!eligibleFaculty.length || roomCandidates.some((items) => !items.length)) return [];

  if (session.isLab) {
    const roomCandidatesByUnit = new Map(session.units.map((unit, index) => [unit.id, roomCandidates[index]]));
    const chosen = [];
    const usedFaculty = new Set();
    const usedRooms = new Set();
    const orderedUnits = [...session.units].sort((a, b) => b.studentCount - a.studentCount);

    for (const unit of orderedUnits) {
      const faculties = shuffle(eligibleFaculty.filter((person) => !usedFaculty.has(person.id)), random)
        .filter((person) => allowOccupied || facultyCanTake(person, day, slot, state.facultyAssignments, setup))
        .sort((a, b) => countDayLoad(state.facultyAssignments, a.id, day) - countDayLoad(state.facultyAssignments, b.id, day));
      const rooms = shuffle((roomCandidatesByUnit.get(unit.id) || []).filter((room) => !usedRooms.has(room.id)), random)
        .filter((room) => allowOccupied || roomCanTake(room, day, slot, state.roomAssignments))
        .sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0));
      if (!faculties.length || !rooms.length) return [];
      chosen.push({ unit, faculty: faculties[0], room: rooms[0] });
      usedFaculty.add(faculties[0].id);
      usedRooms.add(rooms[0].id);
    }
    return [chosen];
  }

  const rooms = shuffle(roomCandidates[0], random).filter((room) => allowOccupied || roomCanTake(room, day, slot, state.roomAssignments));
  const faculties = shuffle(eligibleFaculty, random).filter((person) => allowOccupied || facultyCanTake(person, day, slot, state.facultyAssignments, setup));
  if (!rooms.length || !faculties.length) return [];
  const options = [];
  rooms.slice(0, 6).forEach((room) => faculties.slice(0, 8).forEach((faculty) => {
    options.push([{ unit: session.units[0], faculty, room }]);
  }));
  return options;
};

const placeSessionWithRepair = (state, session, setup, slots, days, random, sessions, depth = 0, visiting = new Set()) => {
  const direct = placeSession(state, session, setup, slots, days, random);
  if (direct.placed) return direct;
  if (depth >= 2 || visiting.has(session.id)) return { placed: false, reason: "no-valid-slot" };

  const nextVisiting = new Set(visiting);
  nextVisiting.add(session.id);
  const rawMaxSame = Number(setup.constraints?.maxSameSubjectPerDay ?? 1);
  const maxSameSubjectPerDay = rawMaxSame <= 0 ? Infinity : rawMaxSame;
  const subjectSectionKey = `${session.subject.id}|${session.sectionKey}`;
  const candidates = [];

  for (const day of shuffle(days, random)) {
    for (const slot of shuffle(slots, random)) {
      const sameSubjectDay = (state.subjectSectionAssignments.get(subjectSectionKey) || []).filter((item) => item.day === day);
      if (sameSubjectDay.length >= maxSameSubjectPerDay) continue;
      if (!session.isLab && sameSubjectDay.some((item) => {
        const distance = Math.abs(item.startMinutes - slot.startMinutes);
        const slotSize = Math.max(1, slot.endMinutes - slot.startMinutes);
        const requiredGap = Math.max(0, Number(setup.constraints?.minGapBetweenSameSubject || 0));
        return distance <= slotSize * (requiredGap + 1);
      })) continue;

      const allocations = makeCandidateAllocations(state, session, day, slot, setup, random, true);
      allocations.forEach((allocation) => {
        const conflicts = conflictingAssignments(state, session, day, slot, allocation);
        // A move should stay bounded. If a slot needs many relocations, prefer another slot.
        if (conflicts.length <= (session.isLab ? 3 : 2)) {
          candidates.push({ day, slot, allocation, conflicts, score: conflicts.length * 1000 + getOptionScore(state, session, day, slot, allocation[0].faculty, allocation[0].room, setup, random) });
        }
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  for (const candidate of candidates.slice(0, 20)) {
    const snapshot = cloneState(state);
    const conflictSessions = [...new Map(candidate.conflicts.map((item) => [item.sessionId, getSessionFromAssignment(item, sessions)]))].map(([, value]) => value).filter(Boolean);
    candidate.conflicts.forEach((item) => removeAssignment(state, item));
    candidate.allocation.forEach(({ unit, faculty, room }) => addAssignment(state, makeAssignment(session, unit, faculty, room, candidate.day, candidate.slot)));

    let moved = true;
    for (const displaced of conflictSessions) {
      if (!displaced || displaced.id === session.id) continue;
      const result = placeSessionWithRepair(state, displaced, setup, slots, days, random, sessions, depth + 1, nextVisiting);
      if (!result.placed) {
        moved = false;
        break;
      }
    }
    if (moved) return { placed: true, day: candidate.day, slot: candidate.slot, repaired: true };
    restoreState(state, snapshot);
  }

  return { placed: false, reason: "no-valid-slot" };
};

const placeSession = (state, session, setup, slots, days, random) => {
  const faculty = setup.faculty || [];
  const rooms = setup.rooms || [];
  const eligibleFaculty = faculty.filter((person) => facultyCanTeach(person, session.subject));

  if (!eligibleFaculty.length) {
    return { placed: false, reason: "no-faculty" };
  }

  const roomCandidates = session.units.map((unit) => getRoomCandidates(rooms, unit, session.subject));
  if (roomCandidates.some((items) => !items.length)) {
    return { placed: false, reason: "no-room" };
  }

  const candidates = [];
  const dayOrder = shuffle(days, random);
  const slotOrder = shuffle(slots, random);

  const rawMaxSame = Number(setup.constraints?.maxSameSubjectPerDay ?? 1);
  const maxSameSubjectPerDay = rawMaxSame <= 0 ? Infinity : rawMaxSame;
  const subjectSectionKey = `${session.subject.id}|${session.sectionKey}`;

  for (const day of dayOrder) {
    for (const slot of slotOrder) {
      if (state.sectionAssignments.has(session.sectionKey) && isBusy(state.sectionAssignments, session.sectionKey, day, slot)) continue;
      if (state.batchAssignments.has(session.units[0]?.batchId) && isBusy(state.batchAssignments, session.units[0].batchId, day, slot)) continue;

      const sameSubjectDay = (state.subjectSectionAssignments.get(subjectSectionKey) || [])
        .filter((item) => item.day === day);
      if (sameSubjectDay.length >= maxSameSubjectPerDay) continue;

      // For theory, avoid placing the same subject in back-to-back periods.
      // Labs are allowed to use consecutive periods because their duration can be multi-slot.
      if (!session.isLab && sameSubjectDay.some((item) => {
        const distance = Math.abs(item.startMinutes - slot.startMinutes);
        const slotSize = Math.max(1, slot.endMinutes - slot.startMinutes);
        const requiredGap = Math.max(0, Number(setup.constraints?.minGapBetweenSameSubject || 0));
        return distance <= slotSize * (requiredGap + 1);
      })) continue;

      if (session.isLab) {
        const roomCandidatesByUnit = new Map(
          session.units.map((unit, index) => [unit.id, roomCandidates[index]]),
        );
        const uniqueRoomPool = [...new Map(roomCandidates.flat().map((room) => [room.id, room])).values()];
        if (uniqueRoomPool.length < session.units.length) continue;

        const allocation = findLabAllocation(
          state,
          session,
          day,
          slot,
          eligibleFaculty,
          roomCandidatesByUnit,
          setup,
          random,
        );
        if (!allocation) continue;

        const score = allocation.reduce(
          (total, item) => total + getOptionScore(state, session, day, slot, item.faculty, item.room, setup, random),
          0,
        );
        candidates.push({ day, slot, allocation, score });
      } else {
        const availableRooms = roomCandidates[0].filter((room) => roomCanTake(room, day, slot, state.roomAssignments));
        const availableFaculty = shuffle(eligibleFaculty, random).filter((person) =>
          facultyCanTake(person, day, slot, state.facultyAssignments, setup),
        );

        if (!availableRooms.length || !availableFaculty.length) continue;

        const pairs = [];
        const roomSample = availableRooms.slice(0, Math.min(5, availableRooms.length));
        const facultySample = availableFaculty.slice(0, Math.min(6, availableFaculty.length));
        roomSample.forEach((room) => {
          facultySample.forEach((person) => {
            pairs.push({
              room,
              faculty: person,
              score: getOptionScore(state, session, day, slot, person, room, setup, random),
            });
          });
        });
        pairs.sort((a, b) => a.score - b.score);
        if (pairs[0]) candidates.push({ day, slot, allocation: [{ unit: session.units[0], ...pairs[0] }], score: pairs[0].score });
      }
    }
  }

  if (!candidates.length) return { placed: false, reason: "no-valid-slot" };
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];

  best.allocation.forEach(({ unit, faculty: person, room }) => {
    addAssignment(
      state,
      makeAssignment(session, unit, person, room, best.day, best.slot),
    );
  });

  return { placed: true, day: best.day, slot: best.slot };
};

const scheduleAttempt = (setup, sessions, seed) => {
  const random = seededRandom(seed);
  const state = createState();
  const days = getWorkingDays(setup);
  const baseSlot = Number(setup.availability?.slotDuration || setup.constraints?.slotDuration || 60);
  const slots = createSlots(
    setup.availability?.dayStart || "09:00",
    setup.availability?.dayEnd || "17:00",
    baseSlot,
    setup.constraints?.lunchStart,
    setup.constraints?.lunchDuration,
    setup.constraints?.breakAfterPeriods,
    setup.constraints?.breakDuration,
  );

  const ordered = shuffle(sessions, random).sort((a, b) => {
    const aFaculty = setup.faculty.filter((person) => facultyCanTeach(person, a.subject)).length;
    const bFaculty = setup.faculty.filter((person) => facultyCanTeach(person, b.subject)).length;
    const aRooms = a.units.reduce((min, unit) => Math.min(min, getRoomCandidates(setup.rooms, unit, a.subject).length), Infinity);
    const bRooms = b.units.reduce((min, unit) => Math.min(min, getRoomCandidates(setup.rooms, unit, b.subject).length), Infinity);
    const difficultyA = aFaculty * 2 + aRooms + (a.isLab ? 0 : 2);
    const difficultyB = bFaculty * 2 + bRooms + (b.isLab ? 0 : 2);
    return difficultyA - difficultyB || (b.units.length - a.units.length) || random() - 0.5;
  });

  const unscheduled = [];
  ordered.forEach((session) => {
    const placement = placeSessionWithRepair(state, session, setup, slots, days, random, sessions);
    if (!placement.placed) unscheduled.push({ session, reason: placement.reason });
  });

  // Final repair sweep. Try the hardest remaining sessions first and allow a
  // bounded chain of relocations so a locally-full slot does not permanently
  // strand a required weekly class.
  for (let round = 0; round < 3 && unscheduled.length; round += 1) {
    const pending = [...unscheduled];
    unscheduled.length = 0;
    pending.sort((a, b) => b.session.units.length - a.session.units.length);
    pending.forEach((item) => {
      const placement = placeSessionWithRepair(state, item.session, setup, slots, days, random, sessions, 0, new Set());
      if (!placement.placed) unscheduled.push(item);
    });
  }

  return { state, unscheduled, slots, days };
};

const calculateMetrics = (timetable, sessions, setup, previousTimetable = []) => {
  const requiredSessions = sessions.length;
  const scheduledSessionIds = new Set(timetable.map((item) => item.sessionId));
  const scheduledSessions = scheduledSessionIds.size;
  const unscheduledSessions = requiredSessions - scheduledSessions;
  const hardViolations = [];

  const checkMap = (items, keyName, label) => {
    const grouped = new Map();
    items.forEach((item) => {
      const key = `${item[keyName]}|${item.day}|${item.startMinutes}|${item.endMinutes}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    grouped.forEach((group) => {
      const distinctSessions = new Set(group.map((item) => item.sessionId));
      if (distinctSessions.size > 1) {
        hardViolations.push(`${label}: ${group.map((item) => item.id).join(", ")}`);
      }
    });
  };

  checkMap(timetable, "facultyId", "Faculty clash");
  checkMap(timetable, "roomId", "Room clash");
  checkMap(timetable, "sectionKey", "Section clash");
  checkMap(timetable, "batchId", "Batch clash");

  const labGroups = new Map();
  timetable.forEach((item) => {
    if (item.teachingScope !== "group") return;
    const key = `${item.sessionId}|${item.day}|${item.startMinutes}`;
    if (!labGroups.has(key)) labGroups.set(key, []);
    labGroups.get(key).push(item);
  });

  labGroups.forEach((group) => {
    const rooms = new Set(group.map((item) => item.roomId));
    const faculty = new Set(group.map((item) => item.facultyId));
    if (rooms.size !== group.length) hardViolations.push("Lab groups share a physical room");
    if (faculty.size !== group.length) hardViolations.push("Lab groups share a faculty member");
  });

  const sectionDay = new Map();
  const sectionRequiredSessions = new Map();
  sessions.forEach((session) => {
    sectionRequiredSessions.set(session.sectionKey, (sectionRequiredSessions.get(session.sectionKey) || 0) + 1);
  });
  timetable.forEach((item) => {
    const key = `${item.sectionKey}|${item.day}`;
    if (!sectionDay.has(key)) sectionDay.set(key, []);
    sectionDay.get(key).push(item);
  });

  let studentGapScore = 0;
  let singleClassDayCount = 0;
  sectionDay.forEach((items, key) => {
    const sectionKey = key.slice(0, key.lastIndexOf("|"));
    const uniqueStarts = [...new Set(items.map((item) => item.startMinutes))].sort((a, b) => a - b);

    // A single-class day is a real optimization problem only when that
    // section actually needs two or more weekly sessions. A subject with only
    // one weekly session cannot magically have two classes on the same day.
    if ((sectionRequiredSessions.get(sectionKey) || 0) >= 2 && uniqueStarts.length === 1) {
      singleClassDayCount += 1;
    }

    for (let index = 1; index < uniqueStarts.length; index += 1) {
      const distance = uniqueStarts[index] - uniqueStarts[index - 1];
      const slotSize = Number(setup.availability?.slotDuration || 60);
      const gapPeriods = Math.max(0, Math.round(distance / slotSize) - 1);
      studentGapScore += gapPeriods;
    }
  });

  let floorJumpScore = 0;
  const facultyDay = new Map();
  timetable.forEach((item) => {
    const key = `${item.facultyId}|${item.day}`;
    if (!facultyDay.has(key)) facultyDay.set(key, []);
    facultyDay.get(key).push(item);
  });
  facultyDay.forEach((items) => {
    items.sort((a, b) => a.startMinutes - b.startMinutes);
    for (let index = 1; index < items.length; index += 1) {
      floorJumpScore += Math.abs(Number(items[index].floor || 0) - Number(items[index - 1].floor || 0));
    }
  });

  let diversity = 0;
  if (previousTimetable.length) {
    const previous = new Set(
      previousTimetable.map((item) => `${item.sessionId}|${item.day}|${item.start}|${item.roomId}|${item.facultyId}`),
    );
    timetable.forEach((item) => {
      if (!previous.has(`${item.sessionId}|${item.day}|${item.start}|${item.roomId}|${item.facultyId}`)) diversity += 1;
    });
  }

  const score =
    unscheduledSessions * 1_000_000_000 +
    hardViolations.length * 500_000_000 +
    singleClassDayCount * 100_000_000 +
    studentGapScore * 1_000 +
    floorJumpScore * 30 -
    diversity * 0.05;

  return {
    requiredSessions,
    scheduledSessions,
    unscheduledSessions,
    hardViolations,
    studentGapScore,
    singleClassDayCount,
    floorJumpScore,
    diversity,
    score,
  };
};

const groupDiagnostics = (unscheduled, setup) => {
  const grouped = new Map();

  unscheduled.forEach(({ session, reason }) => {
    const subject = session.subject;
    const key = subject.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        subjectId: key,
        subjectName: subject.name || "Unnamed Subject",
        pending: 0,
        affectedUnits: new Set(),
        reasons: new Set(),
      });
    }
    const item = grouped.get(key);
    item.pending += 1;
    item.affectedUnits.add(session.units[0]?.sectionKey || session.units[0]?.id);

    if (reason === "no-faculty") item.reasons.add("No assigned faculty can teach this subject.");
    else if (reason === "no-room") item.reasons.add("No suitable room has enough capacity or the required facilities.");
    else item.reasons.add("All valid faculty, room and section slots were occupied or unavailable.");
  });

  return [...grouped.values()].map((item) => {
    const facultyNeed = (setup.faculty || []).filter((person) =>
      facultyCanTeach(person, setup.subjects.find((subject) => subject.id === item.subjectId) || {}),
    ).length;
    const reasons = [...item.reasons];
    let action = "The generator automatically rearranged existing classes; if this remains, review availability or resources.";
    if (!facultyNeed) action = "Assign at least one faculty member to this subject. The timetable cannot invent a faculty member.";
    else if (reasons.some((reason) => reason.includes("room"))) action = "Add another suitable room or increase the room's timetable availability.";

    return {
      ...item,
      affectedUnits: item.affectedUnits.size,
      reasons,
      action,
    };
  });
};

export const generateTimetable = (setup, options = {}) => {
  const courses = setup.courses || [];
  const batches = getCourseBatches(courses);
  const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
  const subjects = [...(setup.subjects || [])].filter((subject) => {
    const assigned = (subject.batchIds || []).some((id) => batchMap.has(id));
    return assigned;
  });
  const sessions = buildSessions(setup, subjects, batchMap);
  const attempts = Math.max(8, Number(options.attempts || 8));
  const previousTimetable = options.previousTimetable || [];

  let best = null;

  if (previousTimetable.length) {
    const previousMetrics = calculateMetrics(previousTimetable, sessions, setup);
    best = {
      state: { result: previousTimetable },
      unscheduled: [],
      slots: [],
      days: getWorkingDays(setup),
      metrics: previousMetrics,
      keptPrevious: true,
    };
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = scheduleAttempt(
      setup,
      sessions,
      `${options.seed || Date.now()}-${attempt}-${Math.random()}`,
    );
    const metrics = calculateMetrics(candidate.state.result, sessions, setup, previousTimetable);
    if (!best || metrics.score < best.metrics.score) {
      best = { ...candidate, metrics, keptPrevious: false };
      if (metrics.unscheduledSessions === 0 && metrics.hardViolations.length === 0 && metrics.singleClassDayCount === 0 && metrics.studentGapScore <= 1) break;
    }
  }

  const timetable = best?.state.result || [];
  const diagnostics = groupDiagnostics(best?.unscheduled || [], setup);
  const conflicts = [];

  if (best?.metrics.hardViolations.length) {
    best.metrics.hardViolations.forEach((message) => {
      conflicts.push(conflict("hard", message, "The scheduler will not accept a timetable containing this conflict."));
    });
  }

  diagnostics.forEach((item) => {
    conflicts.push(
      conflict(
        "unscheduled",
        `${item.subjectName}: ${item.pending} class slot(s) remain unscheduled across ${item.affectedUnits} section(s).`,
        `${item.reasons.join(" ")} ${item.action}`,
        { subjectId: item.subjectId },
      ),
    );
  });

  const success =
    Boolean(best) &&
    best.metrics.unscheduledSessions === 0 &&
    best.metrics.hardViolations.length === 0;

  return {
    timetable,
    conflicts,
    success,
    diagnostics,
    optimization: {
      attempts,
      automaticallyRearranged: attempts > 1 && !best?.keptPrevious,
      keptPrevious: Boolean(best?.keptPrevious),
      ...best?.metrics,
    },
  };
};

export const getScheduleSummary = (generated) => {
  const timetable = generated?.timetable || [];
  const optimization = generated?.optimization || {};
  const subjects = new Set(timetable.map((item) => item.subjectId));
  const sessions = new Set(timetable.map((item) => item.sessionId));

  return {
    totalClasses: timetable.length,
    conflicts: generated?.conflicts?.length || 0,
    scheduledSubjects: subjects.size,
    scheduledUnits: new Set(timetable.map((item) => item.unitId)).size,
    requiredSessions: optimization.requiredSessions || sessions.size,
    scheduledSessions: optimization.scheduledSessions || sessions.size,
    unscheduledSessions: optimization.unscheduledSessions || 0,
    studentGapScore: optimization.studentGapScore || 0,
    singleClassDayCount: optimization.singleClassDayCount || 0,
    floorJumpScore: optimization.floorJumpScore || 0,
  };
};
