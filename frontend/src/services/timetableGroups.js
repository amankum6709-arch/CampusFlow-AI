const DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const asText = (value) => String(value ?? "").trim();

const shortId = (value) => asText(value).slice(0, 8);

const extractYear = (value) => {
  const match = asText(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const SUBJECT_CODE_PATTERN = /^[A-Z]{2,}\d+[A-Z0-9]*$/i;

const isCourseHint = (value) => {
  const text = asText(value);
  return Boolean(text) && /^(?=.*[A-Za-z])[A-Za-z0-9&.]+$/.test(text) && !/^(batch|section)$/i.test(text);
};

const deriveBatchName = (sectionName) => {
  const section = asText(sectionName);
  if (!section) return "";
  const stripped = section
    .replace(/\s+section\s+\d+\s*$/i, "")
    .replace(/-\d+\s*$/, "")
    .trim();
  return stripped || section;
};

const parseSectionName = (sectionName) => {
  const raw = asText(sectionName);
  if (!raw) return { courseHint: "", batchHint: "", subjectLabel: "" };

  if (/^section\s+\d+$/i.test(raw)) {
    return { courseHint: "", batchHint: raw, subjectLabel: "" };
  }

  let base = raw
    .replace(/\s+section\s+\d+\s*$/i, "")
    .replace(/-\d+\s*$/, "")
    .trim();
  if (!base) base = raw;

  let subjectLabel = "";
  let courseBatchPart = base;

  if (/\s/.test(base)) {
    const tokens = base.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    if (SUBJECT_CODE_PATTERN.test(lastToken)) {
      subjectLabel = lastToken;
      courseBatchPart = tokens.slice(0, -1).join(" ");
    }
  }

  const parts = courseBatchPart.split("-").map(asText).filter(Boolean);
  const courseHint = parts.length === 2 && isCourseHint(parts[0]) && !/^\d{4}$/.test(parts[1]) ? parts[0] : "";
  const batchHint = parts.length === 2 && courseHint ? parts[1] : courseBatchPart;

  return {
    courseHint,
    batchHint: batchHint || base,
    subjectLabel,
  };
};

export const formatBatchLabel = (batchName) => {
  const name = asText(batchName);
  if (!name) return "Unassigned Batch";
  if (/^(batch|section)\b/i.test(name)) return name;
  if (/\d/.test(name) || name.includes("-")) return name;
  return `Batch ${name}`;
};

function buildLookupContext(configuration, setup) {
  const configSessions = (configuration?.sessions || []).filter((session) => session?.id);
  const sessionById = new Map(configSessions.map((session) => [asText(session.id), session]));
  const sessionsByLength = [...configSessions].sort((a, b) => asText(b.id).length - asText(a.id).length);

  const setupSubjects = (setup?.subjects || []).filter((subject) => subject?.id);
  const subjectById = new Map(setupSubjects.map((subject) => [asText(subject.id), subject]));
  const subjectsByLength = [...setupSubjects].sort((a, b) => asText(b.id).length - asText(a.id).length);

  const setupCourses = (setup?.courses || []).filter((course) => course?.id);
  const courseById = new Map(setupCourses.map((course) => [asText(course.id), course]));
  const batchById = new Map();
  const courseByBatchId = new Map();

  setupCourses.forEach((course) => {
    (course.batches || []).forEach((batch) => {
      if (!batch?.id) return;
      batchById.set(asText(batch.id), batch);
      courseByBatchId.set(asText(batch.id), course);
    });
  });

  return {
    sessionById,
    sessionsByLength,
    subjectById,
    subjectsByLength,
    courseById,
    batchById,
    courseByBatchId,
  };
}

function findConfigSession(context, entry) {
  const candidates = [entry.session_id, entry.unit_id].map(asText).filter(Boolean);

  for (const candidate of candidates) {
    const exact = context.sessionById.get(candidate);
    if (exact) return exact;

    const withoutUnitSuffix = candidate.replace(/-unit$/, "");
    if (withoutUnitSuffix !== candidate && context.sessionById.has(withoutUnitSuffix)) {
      return context.sessionById.get(withoutUnitSuffix);
    }

    const withoutOccurrence = candidate.replace(/:\d+$/, "");
    if (withoutOccurrence !== candidate && context.sessionById.has(withoutOccurrence)) {
      return context.sessionById.get(withoutOccurrence);
    }

    for (const session of context.sessionsByLength) {
      const sessionId = asText(session.id);
      if (candidate === sessionId || candidate.startsWith(`${sessionId}:`) || withoutUnitSuffix.startsWith(`${sessionId}:`)) {
        return session;
      }
    }
  }

  return null;
}

function findSetupSubject(context, configSession, entry) {
  const subjectId = asText(configSession?.subjectId ?? configSession?.subject_id);
  if (subjectId && context.subjectById.has(subjectId)) {
    return context.subjectById.get(subjectId);
  }

  const candidates = [entry.session_id, entry.unit_id].map(asText).filter(Boolean);
  for (const candidate of candidates) {
    for (const subject of context.subjectsByLength) {
      const id = asText(subject.id);
      if (candidate === id || candidate.startsWith(`${id}:`) || candidate.startsWith(`${id}-`)) {
        return subject;
      }
    }
  }

  return null;
}

export function enrichEntries(entries = [], { configuration = {}, setup = null } = {}) {
  const context = buildLookupContext(configuration, setup);

  return (entries || []).map((entry) => {
    const configSession = findConfigSession(context, entry);
    const setupSubject = findSetupSubject(context, configSession, entry);

    const sectionName =
      asText(entry.section_name) ||
      asText(configSession?.sectionName) ||
      asText(configSession?.section_name);
    const sectionHints = parseSectionName(sectionName);

    const entryCourseId = asText(entry.course_id);
    const rawCourseId = entry.course_id ?? configSession?.courseId ?? configSession?.course_id ?? setupSubject?.courseId ?? null;
    const resolvedCourseId = asText(rawCourseId) ? rawCourseId : null;
    const rawBatchId = entry.batch_id ?? configSession?.batchId ?? configSession?.batch_id ?? null;
    const resolvedBatchId = asText(rawBatchId) ? rawBatchId : null;

    const useSectionCourse = !entryCourseId && Boolean(sectionHints.courseHint);
    const useSectionBatch =
      Boolean(sectionHints.batchHint) && (!entryCourseId || !resolvedBatchId);

    const courseId = useSectionCourse ? null : resolvedCourseId;
    const batchId = useSectionBatch ? null : resolvedBatchId;

    const setupCourse =
      context.courseById.get(asText(resolvedCourseId)) ||
      context.courseById.get(asText(configSession?.courseId ?? configSession?.course_id)) ||
      (setupSubject?.courseId ? context.courseById.get(asText(setupSubject.courseId)) : null) ||
      (resolvedBatchId ? context.courseByBatchId.get(asText(resolvedBatchId)) : null) ||
      null;

    const setupBatch = resolvedBatchId
      ? (setupCourse?.batches || []).find((batch) => asText(batch.id) === asText(resolvedBatchId)) ||
        context.batchById.get(asText(resolvedBatchId)) ||
        null
      : null;

    const courseName =
      asText(entry.course_name) ||
      asText(setupCourse?.name) ||
      asText(configSession?.courseName) ||
      asText(configSession?.course_name) ||
      sectionHints.courseHint;
    const courseCode =
      asText(entry.course_code) ||
      asText(setupCourse?.code) ||
      asText(configSession?.courseCode) ||
      asText(configSession?.course_code);
    const subjectName =
      asText(entry.subject_name) ||
      asText(configSession?.subjectName) ||
      asText(configSession?.subject_name) ||
      asText(setupSubject?.name) ||
      sectionHints.subjectLabel;
    const subjectCode =
      asText(entry.subject_code) ||
      asText(configSession?.subjectCode) ||
      asText(configSession?.subject_code) ||
      asText(setupSubject?.code) ||
      sectionHints.subjectLabel;
    const batchName =
      (useSectionBatch ? sectionHints.batchHint : "") ||
      asText(configSession?.batchName) ||
      asText(configSession?.batch_name) ||
      asText(setupBatch?.name) ||
      sectionHints.batchHint ||
      deriveBatchName(sectionName) ||
      (batchId ? `Batch ${shortId(batchId)}` : "General");
    const batchYear =
      configSession?.batchYear ??
      configSession?.batch_year ??
      setupBatch?.admissionYear ??
      extractYear(batchName) ??
      extractYear(sectionName);
    const batchSemester =
      configSession?.batchSemester ??
      configSession?.batch_semester ??
      setupBatch?.currentSemester ??
      setupSubject?.semester ??
      null;

    const courseKey = useSectionCourse
      ? `course-name:${asText(sectionHints.courseHint).toLowerCase()}`
      : courseId
        ? `course:${asText(courseId)}`
        : `course-name:${asText(courseName).toLowerCase() || "unassigned"}`;
    const batchKey = useSectionBatch
      ? `batch-name:${asText(sectionHints.batchHint).toLowerCase()}`
      : batchId
        ? `batch:${asText(batchId)}`
        : `section:${sectionName.toLowerCase() || "unassigned"}`;
    const groupKey = `${courseKey}::${batchKey}`;

    return {
      ...entry,
      courseId,
      courseKey,
      groupKey,
      courseName,
      courseCode,
      subjectName,
      subjectCode,
      batchId,
      batchName,
      batchYear: batchYear ?? null,
      batchSemester: batchSemester ?? null,
      sectionName,
    };
  });
}

function compareGroups(a, b) {
  const courseOrder = asText(a.courseName).localeCompare(asText(b.courseName));
  if (courseOrder) return courseOrder;

  const yearOrder = (Number(b.batchYear) || 0) - (Number(a.batchYear) || 0);
  if (yearOrder) return yearOrder;

  return asText(a.batchName).localeCompare(asText(b.batchName), undefined, { numeric: true });
}

export function buildTimetableGroups(entries = [], options = {}) {
  const enrichedEntries = enrichEntries(entries, options);
  const groupsByKey = new Map();

  enrichedEntries.forEach((entry) => {
    let group = groupsByKey.get(entry.groupKey);
    if (!group) {
      group = {
        key: entry.groupKey,
        courseKey: entry.courseKey,
        courseId: entry.courseId,
        courseName: entry.courseName,
        courseCode: entry.courseCode,
        batchId: entry.batchId,
        batchName: entry.batchName,
        batchYear: entry.batchYear,
        batchSemester: entry.batchSemester,
        sections: [],
        entries: [],
        entryCount: 0,
      };
      groupsByKey.set(entry.groupKey, group);
    }

    if (!group.courseName && entry.courseName) group.courseName = entry.courseName;
    if (!group.courseCode && entry.courseCode) group.courseCode = entry.courseCode;
    if (!group.batchName && entry.batchName) group.batchName = entry.batchName;
    if (group.batchYear == null && entry.batchYear != null) group.batchYear = entry.batchYear;
    if (group.batchSemester == null && entry.batchSemester != null) group.batchSemester = entry.batchSemester;
    if (entry.sectionName && !group.sections.includes(entry.sectionName)) {
      group.sections.push(entry.sectionName);
    }

    group.entries.push(entry);
  });

  const configuredDays = options.configuration?.days;
  const dayOrder = new Map(
    (configuredDays?.length ? configuredDays : DEFAULT_DAYS).map((day, index) => [day, index]),
  );

  const groups = [...groupsByKey.values()];

  groups.forEach((group) => {
    group.sections.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    group.entries.sort((a, b) => {
      const dayDifference = (dayOrder.get(a.day) ?? 99) - (dayOrder.get(b.day) ?? 99);
      if (dayDifference) return dayDifference;
      const periodDifference = Number(a.period) - Number(b.period);
      if (periodDifference) return periodDifference;
      return asText(a.id).localeCompare(asText(b.id));
    });
    group.entryCount = group.entries.length;
  });

  return groups.sort(compareGroups);
}

export function buildCourseOptions(groups = []) {
  const options = new Map();

  groups.forEach((group) => {
    const id = group.courseKey || (group.courseId ? `course:${asText(group.courseId)}` : `course-name:${asText(group.courseName).toLowerCase()}`);
    let option = options.get(id);

    if (!option) {
      option = {
        id,
        name: group.courseName || "Unassigned Course",
        code: group.courseCode || "",
        groupCount: 0,
        entryCount: 0,
      };
      options.set(id, option);
    }

    if (!option.code && group.courseCode) option.code = group.courseCode;
    option.groupCount += 1;
    option.entryCount += Number(group.entryCount ?? group.entries?.length ?? 0);
  });

  return [...options.values()].sort(
    (a, b) => asText(a.name).localeCompare(asText(b.name)) || asText(a.id).localeCompare(asText(b.id)),
  );
}

export function formatTimetableHeading(group) {
  if (!group) return "Timetable";

  const course = asText(group.courseName) || "Course";
  const batch = formatBatchLabel(group.batchName);
  const year = group.batchYear ? String(group.batchYear) : "";
  const parts = [course];

  if (year && !batch.includes(year)) parts.push(year);
  parts.push(batch);

  return `${parts.join(" | ")} Timetable`;
}

export function formatTimetableMeta(group) {
  if (!group) return "";

  const parts = [];
  if (group.courseCode) parts.push(group.courseCode);
  if (group.batchYear) parts.push(`Academic Year ${group.batchYear}`);
  if (group.batchSemester) parts.push(`Semester ${group.batchSemester}`);

  const sectionCount = group.sections?.length || 0;
  if (sectionCount) {
    parts.push(`${sectionCount} section${sectionCount === 1 ? "" : "s"}`);
  }

  const entryCount = Number(group.entryCount ?? group.entries?.length ?? 0);
  parts.push(`${entryCount} class${entryCount === 1 ? "" : "es"}`);

  return parts.join(" · ");
}
