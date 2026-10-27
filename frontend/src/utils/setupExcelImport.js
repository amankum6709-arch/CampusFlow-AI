// ============================================================
// Naam: Setup Excel Import
// Kya karta hai: Excel/CSV setup data ko read, validate aur merge
//                karta hai CampusFlow ke existing setup ke saath.
//                Supports 11 sheets: Institution, Campus, Timetable,
//                Rooms, Courses, Batches, Subjects, Faculty, Availability,
//                Constraints, and Instructions.
// ============================================================

import {
  createId,
} from "./helpers.js";
import {
  CAMPUS_MODES,
  INSTITUTION_TYPES,
  ROOM_TYPES,
  SUBJECT_TYPES,
} from "./constants.js";
import { createSections } from "./setupDefaults.js";

// ============================================================
// Naam: normalizeHeader
// Kya karta hai: Column names ko lowercase, consistent format mein convert karta hai.
// ============================================================

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// ============================================================
// Naam: getValue
// Kya karta hai: Row mein possible column names mein se matching value nikalta hai.
// ============================================================

const getValue = (row, names) => {
  const entries = Object.entries(row);
  const targetNames = names.map(normalizeHeader);

  const entry = entries.find(([key]) =>
    targetNames.includes(normalizeHeader(key))
  );

  return entry ? entry[1] : "";
};

// ============================================================
// Naam: parseBool
// Kya karta hai: Yes/No, True/False, 1/0 values ko boolean mein convert karta hai.
// ============================================================

const parseBool = (value) => {
  const str = String(value || "")
    .trim()
    .toLowerCase();
  return (
    str === "yes" ||
    str === "true" ||
    str === "1" ||
    str === "y"
  );
};

// ============================================================
// Naam: parseNumeric
// Kya karta hai: Value ko number mein convert karta hai, default deta hai agar invalid ho.
// ============================================================

const parseNumeric = (value, defaultValue = 0) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : defaultValue;
};

// ============================================================
// Naam: parseList
// Kya karta hai: Comma, semicolon, pipe ya line-break values ko array mein convert karta hai.
// ============================================================

const parseList = (value) =>
  String(value || "")
    .split(/[,;|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const hasValue = (value) =>
  value !== "" && value !== undefined && value !== null;

const hasMergeValue = (value) => {
  if (!hasValue(value)) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

const normalizeKey = (value) =>
  String(value || "").trim().toLowerCase();

const normalizeCampusMode = (value) => {
  const mode = normalizeKey(value);
  if (mode === "multiple" || mode === "multi") return "multiple";
  if (mode === "single") return "single";
  return "";
};

const normalizeInstitutionType = (value) => {
  const type = normalizeKey(value);
  return INSTITUTION_TYPES.find((item) => normalizeKey(item) === type) || "";
};

const parseYear = (value, fallback) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const year = Number(raw);
  return Number.isInteger(year) ? year : NaN;
};

// ============================================================
// Naam: normalizeDay
// Kya karta hai: Short day names ko full day names mein convert karta hai.
// ============================================================

const normalizeDay = (day) => {
  const value = String(day || "").trim().toLowerCase();

  const dayMap = {
    mon: "Monday",
    monday: "Monday",
    tue: "Tuesday",
    tues: "Tuesday",
    tuesday: "Tuesday",
    wed: "Wednesday",
    wednesday: "Wednesday",
    thu: "Thursday",
    thur: "Thursday",
    thurs: "Thursday",
    thursday: "Thursday",
    fri: "Friday",
    friday: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
    sun: "Sunday",
    sunday: "Sunday",
  };

  return dayMap[value] || "";
};

// ============================================================
// Naam: parseDays
// Kya karta hai: Available days ko standard day names mein convert karta hai.
// ============================================================

const parseDays = (value) =>
  parseList(value)
    .map(normalizeDay)
    .filter(Boolean);

// ============================================================
// Naam: normalizeRoomType
// Kya karta hai: Room type ko valid ROOM_TYPES ke close match mein convert karta hai.
// ============================================================

const normalizeRoomType = (value) => {
  const str = String(value || "")
    .trim()
    .toLowerCase();

  const typeMap = {
    classroom: "Classroom",
    class: "Classroom",
    "computer lab": "Computer Lab",
    computerlab: "Computer Lab",
    lab: "Laboratory",
    laboratory: "Laboratory",
    "seminar hall": "Seminar Hall",
    seminarhall: "Seminar Hall",
    auditorium: "Auditorium",
    "conference room": "Conference Room",
    conferenceroom: "Conference Room",
    workshop: "Workshop",
    "hod room": "HOD Room",
    hodroom: "HOD Room",
    "staff room": "Staff Room",
    staffroom: "Staff Room",
  };

  return typeMap[str] || "Other";
};

// ============================================================
// Naam: normalizeSubjectType
// Kya karta hai: Subject type ko valid format mein convert karta hai.
// ============================================================

const normalizeSubjectType = (value) => {
  const str = String(value || "")
    .trim()
    .toLowerCase();

  const typeMap = {
    lecture: "Lecture",
    lab: "Lab",
    practical: "Practical",
    tutorial: "Tutorial",
    seminar: "Seminar",
  };

  return typeMap[str] || "Lecture";
};

// ============================================================
// Naam: parseFacilities
// Kya karta hai: Facilities string ko object mein convert karta hai.
// ============================================================

const parseFacilities = (value) => {
  const facilities = {
    projector: false,
    smartBoard: false,
    computers: false,
    ac: false,
  };

  const items = parseList(value);
  const lowerItems = items.map((item) =>
    item.toLowerCase()
  );

  if (
    lowerItems.some(
      (item) =>
        item.includes("projector") || item.includes("projector")
    )
  ) {
    facilities.projector = true;
  }

  if (
    lowerItems.some(
      (item) =>
        item.includes("smart") || item.includes("board") || item.includes("smartboard")
    )
  ) {
    facilities.smartBoard = true;
  }

  if (
    lowerItems.some(
      (item) =>
        item.includes("computer") || item.includes("pc") || item.includes("lab")
    )
  ) {
    facilities.computers = true;
  }

  if (
    lowerItems.some(
      (item) =>
        item.includes("ac") || item.includes("air") || item.includes("condition")
    )
  ) {
    facilities.ac = true;
  }

  return facilities;
};

// ============================================================
// Naam: readRows
// Kya karta hai: CSV aur Excel files ko read karke rows return karta hai.
// ============================================================

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !insideQuotes
    ) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);

      if (row.some((v) => String(v).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);

  if (row.some((v) => String(v).trim() !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];

  return rows.slice(1).map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        values[index] || "",
      ])
    )
  );
};

const readRowsFromFile = async (file) => {
  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "csv") {
    return parseCsv(await file.text());
  }

  if (extension === "xlsx" || extension === "xls") {
    try {
      const XLSX = await import("xlsx");

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const allRows = [];

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        rows.forEach((row) => {
          allRows.push({ _sheet: sheetName, ...row });
        });
      });

      return allRows;
    } catch (error) {
      throw new Error(
        "Excel import ke liye frontend folder mein 'npm install xlsx' run karo.",
        { cause: error }
      );
    }
  }

  throw new Error(
    "Please upload an .xlsx, .xls, or .csv file."
  );
};

// ============================================================
// Naam: importSetupFile
// Kya karta hai: Excel file se sabhi setup data ko structured
//                data mein convert karta hai — Institution, Campus,
//                Rooms, Courses, Batches, Subjects, Faculty,
//                Availability, Constraints.
// ============================================================

export const importSetupFile = async (file) => {
  const rows = await readRowsFromFile(file);

  if (!rows.length) {
    throw new Error(
      "The selected file does not contain any data."
    );
  }

  const institution = {};
  let campusMode = "";
  const campuses = [];
  const rooms = [];
  const courses = [];
  const batches = [];
  const subjects = [];
  const faculty = [];
  const timetableRows = [];
  const availability = {};
  const constraints = {};
  const errors = [];

  const sheetsSeen = new Set();

  const setInstitutionField = (key, value) => {
    if (!hasValue(value)) return;
    const text = String(value).trim();
    if (text) institution[key] = text;
  };

  rows.forEach((row, index) => {
    const sheetName = (row._sheet || "").toLowerCase();

    // ---- Institution Sheet ----
    if (sheetName.includes("institut")) {
      sheetsSeen.add("institution");

      setInstitutionField("name", getValue(row, ["Institution Name", "Name", "University Name", "InstitutionName"]));
      setInstitutionField("shortName", getValue(row, ["Short Name", "ShortName", "Abbreviation"]));
      setInstitutionField("type", getValue(row, ["Type", "Institution Type", "Category"]));
      setInstitutionField("city", getValue(row, ["City", "Town"]));
      setInstitutionField("state", getValue(row, ["State", "Province", "Region"]));
      setInstitutionField("country", getValue(row, ["Country"]));
      setInstitutionField("established", getValue(row, ["Established", "Established Year", "Founded"]));
      setInstitutionField("website", getValue(row, ["Website", "Web Site", "URL"]));

      const academicYearStartRaw = getValue(row, ["Academic Year Start", "AcademicYear", "Year Start"]);
      if (hasValue(academicYearStartRaw) && String(academicYearStartRaw).trim()) {
        institution.academicYearStart = parseYear(academicYearStartRaw, NaN);
      }

      const modeRaw = getValue(row, ["Campus Mode", "CampusMode", "Mode"]);
      if (hasValue(modeRaw) && String(modeRaw).trim()) {
        campusMode = String(modeRaw).trim();
      }
    }

    // ---- Campus Sheet ----
    else if (sheetName.includes("campus")) {
      sheetsSeen.add("campuses");
      const campusName = String(getValue(row, ["Campus Name", "Campus", "CampusName"])).trim();
      const buildingName = String(getValue(row, ["Building Name", "Building", "BuildingName", "Block"])).trim();
      const buildingCode = String(getValue(row, ["Building Code", "Code", "BuildingCode"])).trim();

      if (!campusName && !buildingName) return;

      const normalizedCampusName = campusName || "Main Campus";
      let campusEntry = campuses.find(
        (c) => normalizeKey(c.name) === normalizeKey(normalizedCampusName)
      );
      if (!campusEntry) {
        campusEntry = {
          id: createId("campus"),
          name: normalizedCampusName,
          buildings: [],
        };
        campuses.push(campusEntry);
      }

      if (buildingName) {
        const existingBuilding = campusEntry.buildings.find(
          (building) => normalizeKey(building.name) === normalizeKey(buildingName)
        );

        if (existingBuilding) {
          if (!existingBuilding.code && buildingCode) {
            existingBuilding.code = buildingCode;
          }
        } else {
          campusEntry.buildings.push({
            id: createId("building"),
            name: buildingName,
            code: buildingCode,
          });
        }
      }
    }

    // ---- Rooms Sheet ----
    else if (sheetName.includes("room")) {
      sheetsSeen.add("rooms");

      const roomNumber = String(
        getValue(row, [
          "Room Number", "Room No", "Room_No", "RoomNumber",
          "Room Num", "Room", "Number", "Name",
        ])
      ).trim();

      const roomType = normalizeRoomType(
        getValue(row, ["Room Type", "RoomType", "Type", "Room Category"])
      );

      const capacity = parseNumeric(
        getValue(row, ["Capacity", "Seating", "Seating Capacity", "Seat Count"]),
        30
      );

      const campus = String(
        getValue(row, ["Campus", "Campus Name", "CampusName"])
      ).trim();

      const building = String(
        getValue(row, ["Building", "Building Name", "BuildingName", "Block", "Block Name"])
      ).trim();

      const floor = parseNumeric(
        getValue(row, ["Floor", "Floor Number"]),
        1
      );

      const facilities = parseFacilities(
        getValue(row, ["Facilities", "Facility", "Amenities", "Features"])
      );

      const availableRaw = getValue(
        row,
        ["Available", "Available For Timetable", "Timetable Available", "Is Available", "Active"]
      );
      const timetableAvailable = hasValue(availableRaw) && String(availableRaw).trim()
        ? parseBool(availableRaw)
        : true;

      if (!roomNumber) {
        errors.push(`Row ${index + 2} (Rooms): Room number is missing.`);
        return;
      }

      rooms.push({
        id: createId("room"),
        roomNumber,
        name: roomNumber,
        roomType,
        capacity,
        campusName: campus,
        campusId: "",
        buildingName: building,
        buildingId: "",
        floor,
        facilities,
        timetableAvailable,
      });
    }

    // ---- Courses Sheet ----
    else if (sheetName.includes("course")) {
      sheetsSeen.add("courses");

      const name = String(
        getValue(row, ["Course Name", "Course", "Course_Name", "CourseName", "Name"])
      ).trim();

      const code = String(
        getValue(row, ["Code", "Course Code", "Course_Code", "CourseCode"])
      ).trim();

      const duration = parseNumeric(
        getValue(row, ["Duration (Years)", "Duration", "Years", "Course Duration", "Duration Years"]),
        3
      );

      const campus = String(
        getValue(row, ["Campus", "Campus Name", "CampusName"])
      ).trim();

      const building = String(
        getValue(row, ["Building", "Building Name", "BuildingName", "Block"])
      ).trim();

      if (!name) {
        errors.push(`Row ${index + 2} (Courses): Course name is missing.`);
        return;
      }

      courses.push({
        id: createId("course"),
        name,
        code,
        duration,
        totalSemesters: duration * 2,
        campusId: "",
        campusName: campus,
        buildingId: "",
        buildingName: building,
        batches: [],
      });
    }

    // ---- Batches Sheet ----
    else if (sheetName.includes("batch")) {
      sheetsSeen.add("batches");

      const courseName = String(
        getValue(row, ["Course Name", "Course", "CourseName"])
      ).trim();

      const batchName = String(
        getValue(row, ["Batch Name", "Batch", "BatchName", "Name"])
      ).trim();

      const admissionYearRaw = getValue(
        row,
        ["Admission Year", "Year", "Year Of Admission"]
      );
      const admissionYear = parseYear(admissionYearRaw, new Date().getFullYear());

      const admissionMonth = String(
        getValue(row, ["Admission Month", "Month"])
      ).trim();

      const sectionRaw = getValue(row, ["Section", "Section Number", "SectionNumber"]);
      const sectionNumber = parseNumeric(sectionRaw, 1);

      const studentCount = parseNumeric(
        getValue(row, ["Student Count", "Students", "Count", "Strength"]),
        60
      );

      if (!courseName && !batchName) {
        errors.push(`Row ${index + 2} (Batches): Either course name or batch name is required.`);
        return;
      }

      if (hasValue(admissionYearRaw) && String(admissionYearRaw).trim() && !Number.isInteger(admissionYear)) {
        errors.push(`Row ${index + 2} (Batches): Admission Year must be a four-digit year.`);
        return;
      }

      batches.push({
        courseName,
        batchName: batchName || `${courseName} ${admissionYear}`,
        admissionYear,
        admissionMonth,
        sectionNumber,
        studentCount,
      });
    }

    // ---- Subjects Sheet ----
    else if (sheetName.includes("subject")) {
      sheetsSeen.add("subjects");

      const name = String(
        getValue(row, ["Subject Name", "Subject", "Subject_Name", "SubjectName", "Name"])
      ).trim();

      const code = String(
        getValue(row, ["Subject Code", "Code", "Subject_Code", "SubjectCode"])
      ).trim();

      const courseName = String(
        getValue(row, ["Course Name", "Course", "Course_Name", "CourseName", "For Course"])
      ).trim();

      const type = normalizeSubjectType(
        getValue(row, ["Type", "Subject Type", "SubjectType", "Class Type"])
      );

      const weeklyPeriods = parseNumeric(
        getValue(row, ["Weekly Periods", "Periods", "Periods Per Week", "Weekly Classes", "Classes Per Week"]),
        3
      );

      const durationMinutes = parseNumeric(
        getValue(row, ["Duration (minutes)", "Duration", "Duration Minutes", "Class Duration", "Minutes"]),
        60
      );

      if (!name) {
        errors.push(`Row ${index + 2} (Subjects): Subject name is missing.`);
        return;
      }

      subjects.push({
        id: createId("subject"),
        name,
        code,
        courseName,
        courseId: "",
        semester: 1,
        type,
        weeklyPeriods,
        durationMinutes,
        batchIds: [],
        facultyIds: [],
        teachingScope: "section",
        requiredFacilities: [],
      });
    }

    // ---- Faculty Sheet ----
    else if (sheetName.includes("facult")) {
      sheetsSeen.add("faculty");

      const name = String(
        getValue(row, ["Faculty Name", "Name", "Full Name", "Teacher Name", "Faculty"])
      ).trim();

      const employeeId = String(
        getValue(row, ["Faculty ID", "Employee ID", "EmployeeId", "Employee Code", "Employee", "Emp ID"])
      ).trim();

      const department = String(
        getValue(row, ["Department", "Department Name", "DepartmentName", "Dept"])
      ).trim();

      const maxClassesPerDayRaw = getValue(
        row,
        ["Max Classes Per Day", "Max Classes", "Daily Limit", "Max Daily"]
      );
      const maxClassesPerDay = hasValue(maxClassesPerDayRaw) && String(maxClassesPerDayRaw).trim()
        ? parseNumeric(maxClassesPerDayRaw, 4)
        : null;

      const availableDaysRaw = getValue(
        row,
        ["Available Days", "Working Days", "Days", "Availability"]
      );
      const availableDays = parseDays(availableDaysRaw);

      const subjectCodes = parseList(
        getValue(row, ["Subject Codes", "Subject Code", "Subjects", "Subject", "Teaches"])
      );

      if (!name) {
        errors.push(`Row ${index + 2} (Faculty): Faculty name is missing.`);
        return;
      }

      faculty.push({
        id: createId("faculty"),
        name,
        employeeId,
        department,
        subjectIds: [],
        subjectCodes,
        maxClassesPerDay,
        availableDays: availableDays.length ? availableDays : null,
        leaveDates: [],
      });
    }

    // ---- Timetable Sheet ----
    else if (sheetName.includes("timetable")) {
      sheetsSeen.add("timetable");
      const day = String(getValue(row, ["Day", "Weekday"])).trim();
      const startTime = String(getValue(row, ["Start Time", "Start", "Begin"])).trim();
      const endTime = String(getValue(row, ["End Time", "End", "Finish"])).trim();
      const course = String(getValue(row, ["Course", "Course Name"])).trim();
      const batch = String(getValue(row, ["Batch", "Batch Name"])).trim();
      const section = String(getValue(row, ["Section"])).trim();
      const subject = String(getValue(row, ["Subject", "Subject Name"])).trim();
      const subjectCode = String(getValue(row, ["Subject Code", "Code"])).trim();
      const facultyName = String(getValue(row, ["Faculty", "Faculty Name", "Teacher"])).trim();
      const facultyId = String(getValue(row, ["Faculty ID", "Employee ID", "Emp ID"])).trim();
      const room = String(getValue(row, ["Room", "Room Number", "Room No"])).trim();
      if (day || startTime || subject) {
        timetableRows.push({ day, startTime, endTime, course, batch, section, subject, subjectCode, facultyName, facultyId, room });
      }
    }

    // ---- Availability Sheet ----
    else if (sheetName.includes("availab")) {
      sheetsSeen.add("availability");
      const workingDaysRaw = getValue(row, ["Working Days", "Days", "WorkingDays"]);
      if (workingDaysRaw) {
        const days = parseDays(workingDaysRaw);
        if (days.length) availability.workingDays = days;
      }
      const dayStart = String(getValue(row, ["Day Start", "Start Time", "DayStart"])).trim();
      if (dayStart) availability.dayStart = dayStart;
      const dayEnd = String(getValue(row, ["Day End", "End Time", "DayEnd"])).trim();
      if (dayEnd) availability.dayEnd = dayEnd;
      const slotDuration = parseNumeric(getValue(row, ["Slot Duration (minutes)", "Slot Duration", "SlotDuration", "Period Duration"]));
      if (slotDuration > 0) availability.slotDuration = slotDuration;
    }

    // ---- Constraints Sheet ----
    else if (sheetName.includes("constraint")) {
      sheetsSeen.add("constraints");
      const maxClasses = parseNumeric(getValue(row, ["Max Classes Per Day", "MaxClassesPerDay"]));
      if (maxClasses > 0) constraints.maxClassesPerDay = maxClasses;
      const maxSame = parseNumeric(getValue(row, ["Max Same Subject Per Day", "MaxSameSubjectPerDay"]));
      if (maxSame > 0) constraints.maxSameSubjectPerDay = maxSame;
      const minGap = parseNumeric(getValue(row, ["Min Gap Between Same Subject", "MinGapBetweenSameSubject"]));
      if (minGap > 0) constraints.minGapBetweenSameSubject = minGap;
      const lunchStart = String(getValue(row, ["Lunch Start", "LunchStart"])).trim();
      if (lunchStart) constraints.lunchStart = lunchStart;
      const lunchDuration = parseNumeric(getValue(row, ["Lunch Duration (minutes)", "LunchDuration"]));
      if (lunchDuration > 0) constraints.lunchDuration = lunchDuration;
      const breakAfter = parseNumeric(getValue(row, ["Break After Periods", "BreakAfterPeriods"]));
      if (breakAfter > 0) constraints.breakAfterPeriods = breakAfter;
      const breakDuration = parseNumeric(getValue(row, ["Break Duration (minutes)", "BreakDuration"]));
      if (breakDuration > 0) constraints.breakDuration = breakDuration;
      const allowSatRaw = getValue(row, ["Allow Saturday", "AllowSaturday", "Saturday"]);
      if (hasValue(allowSatRaw) && String(allowSatRaw).trim()) {
        constraints.allowSaturday = parseBool(allowSatRaw);
      }
    }
  });

  if (!sheetsSeen.size && rows.length > 0) {
    errors.push(
      "No recognized sheet names found. Use sheet names: Institution, Campus, Timetable, Rooms, Faculty, Subjects, Batches, Courses, Availability, Constraints."
    );
  }

  return {
    institution,
    campusMode,
    campuses,
    rooms,
    courses,
    batches,
    subjects,
    faculty,
    timetable: timetableRows,
    availability,
    constraints,
    errors,
  };
};

// ============================================================
// Naam: validateImportedSetup
// Kya karta hai: Imported data ko validate karta hai existing setup ke against.
// ============================================================

export const validateImportedSetup = (
  imported,
  existingSetup = {}
) => {
  const valid = [];
  const errors = [];

  const importedInstitution = imported.institution || {};
  const importedCampuses = imported.campuses || [];
  const importedRooms = imported.rooms || [];
  const importedCourses = imported.courses || [];
  const importedBatches = imported.batches || [];
  const importedSubjects = imported.subjects || [];
  const importedFaculty = imported.faculty || [];

  const existingCampuses = existingSetup.campuses || [];
  const existingCourses = existingSetup.courses || [];
  const existingSubjects = existingSetup.subjects || [];

  const allCampuses = [...existingCampuses, ...importedCampuses];
  const allCourses = [...existingCourses, ...importedCourses];
  const allSubjects = [...existingSubjects, ...importedSubjects];

  const campusNames = new Set(
    allCampuses.map((campus) => normalizeKey(campus.name)).filter(Boolean)
  );
  const buildingKeys = new Set();
  allCampuses.forEach((campus) => {
    const campusKey = normalizeKey(campus.name);
    (campus.buildings || []).forEach((building) => {
      const buildingKey = normalizeKey(building.name);
      if (!buildingKey) return;
      buildingKeys.add(buildingKey);
      if (campusKey) buildingKeys.add(`${campusKey}|${buildingKey}`);
    });
  });

  const courseNames = new Set(
    allCourses.map((course) => normalizeKey(course.name)).filter(Boolean)
  );
  const subjectCodes = new Set(
    allSubjects.map((subject) => normalizeKey(subject.code)).filter(Boolean)
  );

  const validateLocation = (label, campusName, buildingName) => {
    const campusKey = normalizeKey(campusName);
    const buildingKey = normalizeKey(buildingName);

    if (campusKey && !campusNames.has(campusKey)) {
      errors.push(`${label}: Campus "${campusName}" not found.`);
      return false;
    }

    if (buildingKey) {
      const found = campusKey
        ? buildingKeys.has(`${campusKey}|${buildingKey}`)
        : buildingKeys.has(buildingKey);
      if (!found) {
        errors.push(`${label}: Building "${buildingName}" not found.`);
        return false;
      }
    }

    return true;
  };

  // ---- Validate Institution ----
  if (Object.keys(importedInstitution).length > 0) {
    if (importedInstitution.type && !normalizeInstitutionType(importedInstitution.type)) {
      errors.push(
        `Institution: Invalid institution type "${importedInstitution.type}". Use ${INSTITUTION_TYPES.join(", ")}.`
      );
    }

    if (
      importedInstitution.academicYearStart !== undefined &&
      (!Number.isInteger(importedInstitution.academicYearStart) ||
        importedInstitution.academicYearStart < 1900 ||
        importedInstitution.academicYearStart > 2200)
    ) {
      errors.push("Institution: Academic Year Start must be a four-digit year.");
    }

    valid.push({ type: "institution", data: importedInstitution });
  }

  // ---- Validate Campus Mode ----
  if (imported.campusMode && !CAMPUS_MODES.includes(normalizeCampusMode(imported.campusMode))) {
    errors.push(
      `Institution: Invalid Campus Mode "${imported.campusMode}". Use Single or Multiple.`
    );
  } else {
    const uniqueCampusCount = new Set(
      allCampuses.map((campus) => normalizeKey(campus.name)).filter(Boolean)
    ).size;
    if (normalizeCampusMode(imported.campusMode) === "single" && uniqueCampusCount > 1) {
      errors.push(
        "Institution: Campus Mode is Single but more than one campus is present. Use Multiple."
      );
    }
  }

  // ---- Validate Campuses ----
  importedCampuses.forEach((campus, index) => {
    if (!campus.name) {
      errors.push(`Campus row ${index + 1}: Campus name is required.`);
      return;
    }
    valid.push({ type: "campus", data: campus });
  });

  // ---- Validate Rooms ----
  importedRooms.forEach((room, index) => {
    if (!room.roomNumber) {
      errors.push(`Rooms row ${index + 1}: Room number is required.`);
      return;
    }

    if (!Number.isFinite(room.capacity) || room.capacity < 1) {
      errors.push(
        `Rooms row ${index + 1} (${room.roomNumber}): Capacity must be greater than 0.`
      );
      return;
    }

    if (room.roomType && !ROOM_TYPES.includes(room.roomType) && room.roomType !== "Other") {
      errors.push(
        `Rooms row ${index + 1} (${room.roomNumber}): Invalid room type "${room.roomType}".`
      );
      return;
    }

    if (!validateLocation(`Rooms row ${index + 1} (${room.roomNumber})`, room.campusName, room.buildingName)) {
      return;
    }

    valid.push({ type: "room", data: room });
  });

  // ---- Validate Courses ----
  importedCourses.forEach((course, index) => {
    if (!course.name) {
      errors.push(`Courses row ${index + 1}: Course name is required.`);
      return;
    }

    if (!Number.isFinite(course.duration) || course.duration < 1) {
      errors.push(
        `Courses row ${index + 1} (${course.name}): Duration must be greater than 0.`
      );
      return;
    }

    if (!validateLocation(`Courses row ${index + 1} (${course.name})`, course.campusName, course.buildingName)) {
      return;
    }

    valid.push({ type: "course", data: course });
  });

  // ---- Validate Batches ----
  importedBatches.forEach((batch, index) => {
    if (!batch.courseName) {
      errors.push(`Batches row ${index + 1}: Course name is required.`);
      return;
    }

    if (!courseNames.has(normalizeKey(batch.courseName))) {
      errors.push(
        `Batches row ${index + 1}: Course "${batch.courseName}" not found in existing or imported courses.`
      );
      return;
    }

    if (
      !Number.isInteger(batch.admissionYear) ||
      batch.admissionYear < 1900 ||
      batch.admissionYear > 2200
    ) {
      errors.push(
        `Batches row ${index + 1} (${batch.batchName}): Admission Year must be a four-digit year.`
      );
      return;
    }

    valid.push({ type: "batch", data: batch });
  });

  // ---- Validate Subjects ----
  importedSubjects.forEach((subject, index) => {
    if (!subject.name) {
      errors.push(`Subjects row ${index + 1}: Subject name is required.`);
      return;
    }

    if (subject.courseName && !courseNames.has(normalizeKey(subject.courseName))) {
      errors.push(
        `Subjects row ${index + 1} (${subject.name}): Course "${subject.courseName}" not found in existing or imported courses.`
      );
      return;
    }

    if (subject.type && !SUBJECT_TYPES.includes(subject.type)) {
      errors.push(
        `Subjects row ${index + 1} (${subject.name}): Invalid subject type "${subject.type}".`
      );
      return;
    }

    valid.push({ type: "subject", data: subject });
  });

  // ---- Validate Faculty ----
  importedFaculty.forEach((person, index) => {
    if (!person.name) {
      errors.push(`Faculty row ${index + 1}: Faculty name is required.`);
      return;
    }

    const unknownCodes = (person.subjectCodes || []).filter(
      (code) => !subjectCodes.has(normalizeKey(code))
    );

    if (unknownCodes.length > 0) {
      errors.push(
        `Faculty row ${index + 1} (${person.name}): Unknown subject code(s): ${unknownCodes.join(", ")}.`
      );
      return;
    }

    valid.push({ type: "faculty", data: person });
  });

  return { valid, errors };
};

// ============================================================
// Naam: mergeImportedSetup
// Kya karta hai: Imported data ko existing setup mein merge karta hai,
//                duplicates ko skip karta hai aur naye IDs assign karta hai.
//                Supports: institution, campuses, rooms, courses,
//                batches, subjects, faculty, availability, constraints.
// ============================================================

export const mergeImportedSetup = (
  imported,
  existingSetup
) => {
  const existingCampuses = existingSetup.campuses || [];
  const existingRooms = existingSetup.rooms || [];
  const existingCourses = existingSetup.courses || [];
  const existingSubjects = existingSetup.subjects || [];
  const existingFaculty = existingSetup.faculty || [];

  // ---- Merge Institution (override non-empty fields only) ----
  const mergedInstitution = { ...(existingSetup.institution || {}) };
  Object.entries(imported.institution || {}).forEach(([key, value]) => {
    if (hasMergeValue(value)) {
      mergedInstitution[key] = typeof value === "string" ? value.trim() : value;
    }
  });

  if (mergedInstitution.type) {
    const normalizedType = normalizeInstitutionType(mergedInstitution.type);
    if (normalizedType) mergedInstitution.type = normalizedType;
  }

  // ---- Merge Campuses and buildings (deduplicate by name) ----
  const mergedCampuses = existingCampuses.map((campus) => ({
    ...campus,
    buildings: (campus.buildings || []).map((building) => ({ ...building })),
  }));

  const campusByName = new Map();
  mergedCampuses.forEach((campus) => {
    campusByName.set(normalizeKey(campus.name), campus);
  });

  let campusesAdded = 0;
  let buildingsAdded = 0;

  (imported.campuses || []).forEach((campus) => {
    const campusName = String(campus.name || "").trim();
    if (!campusName) return;

    let target = campusByName.get(normalizeKey(campusName));
    if (!target) {
      target = {
        ...campus,
        id: campus.id || createId("campus"),
        name: campusName,
        buildings: [],
      };
      mergedCampuses.push(target);
      campusByName.set(normalizeKey(campusName), target);
      campusesAdded += 1;
    }

    if (!target.buildings) target.buildings = [];

    (campus.buildings || []).forEach((building) => {
      const buildingName = String(building.name || "").trim();
      if (!buildingName) return;

      const existingBuilding = target.buildings.find(
        (item) => normalizeKey(item.name) === normalizeKey(buildingName)
      );

      if (existingBuilding) {
        if (!existingBuilding.code && building.code) {
          existingBuilding.code = building.code;
        }
        return;
      }

      target.buildings.push({
        ...building,
        id: building.id || createId("building"),
        name: buildingName,
      });
      buildingsAdded += 1;
    });
  });

  const campusIdByName = new Map();
  const campusNameById = new Map();
  const buildingIdByKey = new Map();
  const buildingNameById = new Map();

  mergedCampuses.forEach((campus) => {
    const campusKey = normalizeKey(campus.name);
    campusIdByName.set(campusKey, campus.id);
    campusNameById.set(String(campus.id), campus.name || "");

    (campus.buildings || []).forEach((building) => {
      const buildingKey = normalizeKey(building.name);
      if (!buildingKey) return;
      buildingIdByKey.set(`${campusKey}|${buildingKey}`, building.id);
      if (!buildingIdByKey.has(buildingKey)) {
        buildingIdByKey.set(buildingKey, building.id);
      }
      buildingNameById.set(String(building.id), building.name || "");
    });
  });

  const resolveCampusId = (campusName) =>
    campusIdByName.get(normalizeKey(campusName)) || "";

  const resolveBuildingId = (campusName, buildingName) => {
    const campusKey = normalizeKey(campusName);
    const buildingKey = normalizeKey(buildingName);
    if (!buildingKey) return "";
    return (
      buildingIdByKey.get(`${campusKey}|${buildingKey}`) ||
      buildingIdByKey.get(buildingKey) ||
      ""
    );
  };

  const totalCampusCount = new Set(
    mergedCampuses.map((campus) => normalizeKey(campus.name)).filter(Boolean)
  ).size;
  const importedMode = normalizeCampusMode(imported.campusMode);
  let mergedCampusMode = importedMode || normalizeCampusMode(existingSetup.campusMode) || "single";
  if (!importedMode && totalCampusCount > 1) {
    mergedCampusMode = "multiple";
  }

  // ---- Merge Rooms (deduplicate by room number + campus + building) ----
  const roomKey = (room) => {
    const campusName =
      room.campusName || campusNameById.get(String(room.campusId)) || "";
    const buildingName =
      room.buildingName || buildingNameById.get(String(room.buildingId)) || "";
    return `${normalizeKey(room.roomNumber || room.name)}|${normalizeKey(campusName)}|${normalizeKey(buildingName)}`;
  };

  const existingRoomKeys = new Set(existingRooms.map(roomKey));
  const mergedRooms = existingRooms.map((room) => ({ ...room }));
  let roomsAdded = 0;

  (imported.rooms || []).forEach((room) => {
    const roomNumber = String(room.roomNumber || "").trim();
    if (!roomNumber) return;

    const campusName = String(room.campusName || "").trim();
    const buildingName = String(room.buildingName || "").trim();
    const campusId = room.campusId || resolveCampusId(campusName);
    const buildingId = room.buildingId || resolveBuildingId(campusName, buildingName);

    const nextRoom = {
      ...room,
      id: room.id || createId("room"),
      roomNumber,
      name: roomNumber,
      campusName,
      campusId,
      buildingName,
      buildingId,
    };

    const key = roomKey(nextRoom);
    if (!normalizeKey(roomNumber) || existingRoomKeys.has(key)) return;

    existingRoomKeys.add(key);
    mergedRooms.push(nextRoom);
    roomsAdded += 1;
  });

  // ---- Merge Courses (deduplicate by name, fill missing location) ----
  const mergedCourses = existingCourses.map((course) => ({
    ...course,
    batches: (course.batches || []).map((batch) => ({ ...batch })),
  }));

  const courseByName = new Map();
  mergedCourses.forEach((course) => {
    courseByName.set(normalizeKey(course.name), course);
  });

  let coursesAdded = 0;
  (imported.courses || []).forEach((course) => {
    const courseName = String(course.name || "").trim();
    if (!courseName) return;

    const campusName = String(course.campusName || "").trim();
    const buildingName = String(course.buildingName || "").trim();
    const campusId = course.campusId || resolveCampusId(campusName);
    const buildingId = course.buildingId || resolveBuildingId(campusName, buildingName);

    const existingCourse = courseByName.get(normalizeKey(courseName));
    if (existingCourse) {
      if (!existingCourse.code && course.code) existingCourse.code = course.code;
      if (!existingCourse.campusId && campusId) existingCourse.campusId = campusId;
      if (!existingCourse.buildingId && buildingId) existingCourse.buildingId = buildingId;
      if (!existingCourse.campusName && campusName) existingCourse.campusName = campusName;
      if (!existingCourse.buildingName && buildingName) existingCourse.buildingName = buildingName;
      return;
    }

    const nextCourse = {
      ...course,
      id: course.id || createId("course"),
      name: courseName,
      campusId,
      buildingId,
      campusName,
      buildingName,
      batches: [],
    };

    mergedCourses.push(nextCourse);
    courseByName.set(normalizeKey(courseName), nextCourse);
    coursesAdded += 1;
  });

  // ---- Merge Batches (deduplicate by course + batch name + admission year) ----
  const batchKey = (batch) =>
    `${normalizeKey(batch.name || batch.batchName)}|${Number(batch.admissionYear) || new Date().getFullYear()}`;

  let batchesAdded = 0;
  (imported.batches || []).forEach((batch) => {
    const courseName = String(batch.courseName || "").trim();
    const course = courseByName.get(normalizeKey(courseName));
    if (!course) return;

    const admissionYear = Number(batch.admissionYear) || new Date().getFullYear();
    const batchName = String(batch.batchName || `${courseName} ${admissionYear}`).trim();

    if (!course.batches) course.batches = [];

    const exists = course.batches.some(
      (item) =>
        batchKey(item) ===
        `${normalizeKey(batchName)}|${admissionYear}`
    );
    if (exists) return;

    const studentCount = Number(batch.studentCount) || 60;
    const sections = createSections(studentCount, 1, false, 2);
    if (batch.sectionNumber) {
      sections[0].number = Number(batch.sectionNumber) || 1;
    }

    course.batches.push({
      id: batch.id || createId("batch"),
      name: batchName,
      admissionYear,
      admissionMonth: batch.admissionMonth || "",
      courseId: course.id,
      duration: "",
      currentSemester: 1,
      studentCount,
      requiredTimetable: true,
      sectionCount: 1,
      groupsPerSection: 2,
      groupsEnabled: false,
      sections,
    });
    batchesAdded += 1;
  });

  // ---- Merge Subjects (deduplicate by code if present, else by name) ----
  const mergedSubjects = existingSubjects.map((subject) => ({
    ...subject,
    batchIds: [...(subject.batchIds || [])],
    facultyIds: [...(subject.facultyIds || [])],
  }));

  const subjectByCode = new Map();
  const subjectByName = new Map();
  mergedSubjects.forEach((subject) => {
    const code = normalizeKey(subject.code);
    const name = normalizeKey(subject.name);
    if (code) subjectByCode.set(code, subject);
    if (name) subjectByName.set(name, subject);
  });

  let subjectsAdded = 0;
  (imported.subjects || []).forEach((subject) => {
    const code = normalizeKey(subject.code);
    const name = normalizeKey(subject.name);
    if (!code && !name) return;

    const courseId = courseByName.get(normalizeKey(subject.courseName))?.id || "";
    const existingSubject =
      (code && subjectByCode.get(code)) || subjectByName.get(name);

    if (existingSubject) {
      if (!existingSubject.code && subject.code) existingSubject.code = subject.code;
      if (!existingSubject.name && subject.name) existingSubject.name = subject.name;
      if (!existingSubject.courseId && courseId) existingSubject.courseId = courseId;
      if (code) subjectByCode.set(code, existingSubject);
      return;
    }

    const nextSubject = {
      ...subject,
      id: subject.id || createId("subject"),
      courseId,
      batchIds: [...(subject.batchIds || [])],
      facultyIds: [...(subject.facultyIds || [])],
    };

    mergedSubjects.push(nextSubject);
    if (code) subjectByCode.set(code, nextSubject);
    if (name) subjectByName.set(name, nextSubject);
    subjectsAdded += 1;
  });

  // ---- Map subject codes to subject IDs ----
  const subjectIdByCode = new Map();
  mergedSubjects.forEach((subject) => {
    const code = normalizeKey(subject.code);
    if (code) subjectIdByCode.set(code, subject.id);
  });

  // ---- Merge Faculty (deduplicate by employeeId, else by name) ----
  const mergedFaculty = existingFaculty.map((person) => ({
    ...person,
    subjectIds: [...(person.subjectIds || [])],
  }));

  const facultyByEmployeeId = new Map();
  const facultyByName = new Map();
  mergedFaculty.forEach((person) => {
    const employeeId = normalizeKey(person.employeeId);
    const name = normalizeKey(person.name);
    if (employeeId) facultyByEmployeeId.set(employeeId, person);
    if (name) facultyByName.set(name, person);
  });

  let facultyAdded = 0;
  (imported.faculty || []).forEach((person) => {
    const name = String(person.name || "").trim();
    if (!name) return;

    const employeeId = String(person.employeeId || "").trim();
    const existingPerson =
      (employeeId && facultyByEmployeeId.get(normalizeKey(employeeId))) ||
      facultyByName.get(normalizeKey(name));

    const subjectIds = (person.subjectCodes || [])
      .map((code) => subjectIdByCode.get(normalizeKey(code)))
      .filter(Boolean);

    if (existingPerson) {
      if (!existingPerson.employeeId && employeeId) existingPerson.employeeId = employeeId;
      if (!existingPerson.department && person.department) existingPerson.department = person.department;
      if (!existingPerson.maxClassesPerDay && person.maxClassesPerDay != null) {
        existingPerson.maxClassesPerDay = person.maxClassesPerDay;
      }
      if (
        (!existingPerson.availableDays || existingPerson.availableDays.length === 0) &&
        person.availableDays?.length
      ) {
        existingPerson.availableDays = person.availableDays;
      }
      existingPerson.subjectIds = [
        ...new Set([...(existingPerson.subjectIds || []), ...subjectIds]),
      ];
      return;
    }

    const nextPerson = {
      ...person,
      id: person.id || createId("faculty"),
      name,
      employeeId,
      department: person.department || "",
      subjectIds: [
        ...new Set([...(person.subjectIds || []), ...subjectIds]),
      ],
      maxClassesPerDay: person.maxClassesPerDay ?? 4,
      availableDays: person.availableDays?.length
        ? person.availableDays
        : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    };

    mergedFaculty.push(nextPerson);
    const employeeKey = normalizeKey(employeeId);
    if (employeeKey) facultyByEmployeeId.set(employeeKey, nextPerson);
    facultyByName.set(normalizeKey(name), nextPerson);
    facultyAdded += 1;
  });

  // ---- Keep subject.facultyIds and faculty.subjectIds in sync ----
  const facultyById = new Map(mergedFaculty.map((person) => [person.id, person]));

  mergedSubjects.forEach((subject) => {
    (subject.facultyIds || []).forEach((facultyId) => {
      const person = facultyById.get(facultyId);
      if (!person) return;
      person.subjectIds = [
        ...new Set([...(person.subjectIds || []), subject.id]),
      ];
    });
  });

  const facultyIdsBySubject = new Map();
  mergedFaculty.forEach((person) => {
    (person.subjectIds || []).forEach((subjectId) => {
      const ids = facultyIdsBySubject.get(subjectId) || new Set();
      ids.add(person.id);
      facultyIdsBySubject.set(subjectId, ids);
    });
  });

  mergedSubjects.forEach((subject) => {
    const ids = facultyIdsBySubject.get(subject.id) || new Set();
    subject.facultyIds = [...new Set([...(subject.facultyIds || []), ...ids])];
  });

  // ---- Merge Availability (override non-empty fields) ----
  const mergedAvailability = { ...(existingSetup.availability || {}) };
  Object.entries(imported.availability || {}).forEach(([key, value]) => {
    if (hasMergeValue(value)) mergedAvailability[key] = value;
  });

  // ---- Merge Constraints (override non-empty fields) ----
  const mergedConstraints = { ...(existingSetup.constraints || {}) };
  Object.entries(imported.constraints || {}).forEach(([key, value]) => {
    if (hasMergeValue(value)) mergedConstraints[key] = value;
  });

  return {
    ...existingSetup,
    institution: mergedInstitution,
    campusMode: mergedCampusMode,
    campuses: mergedCampuses,
    rooms: mergedRooms,
    courses: mergedCourses,
    subjects: mergedSubjects,
    faculty: mergedFaculty,
    availability: mergedAvailability,
    constraints: mergedConstraints,
    mergeStats: {
      campusesAdded,
      buildingsAdded,
      roomsAdded,
      coursesAdded,
      batchesAdded,
      subjectsAdded,
      facultyAdded,
    },
  };
};
