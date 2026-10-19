// ============================================================
// Naam: Setup Excel Import
// Kya karta hai: Excel/CSV setup data ko read, validate aur merge
//                karta hai CampusFlow ke existing setup ke saath.
//                Supports 9 sheets: Institution, Campus, Rooms,
//                Courses, Batches, Subjects, Faculty, Availability,
//                Constraints.
// ============================================================

import {
  createId,
} from "./helpers";
import {
  ROOM_TYPES,
  SUBJECT_TYPES,
} from "./constants";

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
        "Excel import ke liye frontend folder mein 'npm install xlsx' run karo."
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

  rows.forEach((row, index) => {
    const sheetName = (row._sheet || "").toLowerCase();

    // ---- Institution Sheet ----
    if (sheetName.includes("institut")) {
      sheetsSeen.add("institution");
      institution.name = String(getValue(row, ["Institution Name", "Name", "University Name", "InstitutionName"])).trim();
      institution.shortName = String(getValue(row, ["Short Name", "ShortName", "Abbreviation"])).trim();
      institution.type = String(getValue(row, ["Type", "Institution Type", "Category"])).trim();
      institution.academicYearStart = parseNumeric(getValue(row, ["Academic Year Start", "AcademicYear", "Year Start"]), new Date().getFullYear());
      institution.city = String(getValue(row, ["City", "Town"])).trim();
      institution.state = String(getValue(row, ["State", "Province", "Region"])).trim();
      institution.country = String(getValue(row, ["Country"])).trim();
    }

    // ---- Campus Sheet ----
    else if (sheetName.includes("campus")) {
      sheetsSeen.add("campuses");
      const campusName = String(getValue(row, ["Campus Name", "Campus", "CampusName"])).trim();
      const buildingName = String(getValue(row, ["Building Name", "Building", "BuildingName", "Block"])).trim();
      const buildingCode = String(getValue(row, ["Building Code", "Code", "BuildingCode"])).trim();

      let campusEntry = campuses.find(
        (c) => c.name.toLowerCase() === campusName.toLowerCase()
      );
      if (!campusEntry) {
        campusEntry = { id: createId("campus"), name: campusName || "Main Campus", buildings: [] };
        campuses.push(campusEntry);
      }
      if (buildingName) {
        campusEntry.buildings.push({
          id: createId("building"),
          name: buildingName,
          code: buildingCode,
        });
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

      const available = parseBool(
        getValue(row, ["Available", "Available For Timetable", "Timetable Available", "Is Available", "Active"])
      );

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
        timetableAvailable: available || true,
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

      const admissionYear = parseNumeric(
        getValue(row, ["Admission Year", "Year", "Year Of Admission"]),
        new Date().getFullYear()
      );

      const admissionMonth = String(
        getValue(row, ["Admission Month", "Month"])
      ).trim() || "August";

      const studentCount = parseNumeric(
        getValue(row, ["Student Count", "Students", "Count", "Strength"]),
        60
      );

      if (!courseName && !batchName) {
        errors.push(`Row ${index + 2} (Batches): Either course name or batch name is required.`);
        return;
      }

      batches.push({
        courseName,
        batchName: batchName || `${courseName} ${admissionYear}`,
        admissionYear,
        admissionMonth,
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
        getValue(row, ["Employee ID", "EmployeeId", "Employee Code", "Employee", "Emp ID"])
      ).trim();

      const department = String(
        getValue(row, ["Department", "Department Name", "DepartmentName", "Dept"])
      ).trim();

      const maxClassesPerDay = parseNumeric(
        getValue(row, ["Max Classes Per Day", "Max Classes", "Daily Limit", "Max Daily"]),
        4
      );

      const availableDays = parseDays(
        getValue(row, ["Available Days", "Working Days", "Days", "Availability"])
      );

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
        availableDays: availableDays.length
          ? availableDays
          : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
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
      const allowSat = parseBool(getValue(row, ["Allow Saturday", "AllowSaturday", "Saturday"]));
      constraints.allowSaturday = allowSat;
    }
  });

  if (!sheetsSeen.size && rows.length > 0) {
    errors.push(
      "No recognized sheet names found. Use sheet names: Timetable, Rooms, Faculty, Subjects, Batches, Courses, Availability, Constraints."
    );
  }

  return {
    institution,
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

  const existingRooms =
    existingSetup.rooms || [];
  const existingCourses =
    existingSetup.courses || [];
  const existingSubjects =
    existingSetup.subjects || [];
  const existingFaculty =
    existingSetup.faculty || [];

  // ---- Validate Institution (optional, just check structure) ----
  if (imported.institution && Object.keys(imported.institution).length > 0) {
    valid.push({ type: "institution", data: imported.institution });
  }

  // ---- Validate Campuses ----
  if (imported.campuses && imported.campuses.length > 0) {
    imported.campuses.forEach((campus, index) => {
      if (!campus.name) {
        errors.push(`Campus row ${index + 1}: Campus name is required.`);
        return;
      }
      valid.push({ type: "campus", data: campus });
    });
  }

  // ---- Validate Rooms ----
  imported.rooms.forEach((room, index) => {
    if (!room.roomNumber) {
      errors.push(`Rooms row ${index + 1}: Room number is required.`);
      return;
    }

    if (
      !Number.isFinite(room.capacity) ||
      room.capacity < 1
    ) {
      errors.push(
        `Rooms row ${index + 1} (${room.roomNumber}): Capacity must be greater than 0.`
      );
      return;
    }

    if (
      room.roomType &&
      !ROOM_TYPES.includes(room.roomType) &&
      room.roomType !== "Other"
    ) {
      errors.push(
        `Rooms row ${index + 1} (${room.roomNumber}): Invalid room type "${room.roomType}".`
      );
      return;
    }

    valid.push({ type: "room", data: room });
  });

  // ---- Validate Courses ----
  imported.courses.forEach((course, index) => {
    if (!course.name) {
      errors.push(`Courses row ${index + 1}: Course name is required.`);
      return;
    }

    if (
      !Number.isFinite(course.duration) ||
      course.duration < 1
    ) {
      errors.push(
        `Courses row ${index + 1} (${course.name}): Duration must be greater than 0.`
      );
      return;
    }

    valid.push({ type: "course", data: course });
  });

  // ---- Validate Batches ----
  if (imported.batches && imported.batches.length > 0) {
    imported.batches.forEach((batch, index) => {
      if (!batch.courseName && !batch.batchName) {
        errors.push(`Batches row ${index + 1}: Course name or batch name is required.`);
        return;
      }
      valid.push({ type: "batch", data: batch });
    });
  }

  // ---- Validate Subjects ----
  imported.subjects.forEach((subject, index) => {
    if (!subject.name) {
      errors.push(`Subjects row ${index + 1}: Subject name is required.`);
      return;
    }

    const courseExists =
      subject.courseName &&
      (existingCourses.some(
        (c) =>
          c.name.toLowerCase() ===
          subject.courseName.toLowerCase()
      ) ||
        imported.courses.some(
          (c) =>
            c.name.toLowerCase() ===
            subject.courseName.toLowerCase()
        ));

    if (subject.courseName && !courseExists) {
      errors.push(
        `Subjects row ${index + 1} (${subject.name}): Course "${subject.courseName}" not found in existing or imported courses.`
      );
      return;
    }

    if (
      subject.type &&
      !SUBJECT_TYPES.includes(subject.type)
    ) {
      errors.push(
        `Subjects row ${index + 1} (${subject.name}): Invalid subject type "${subject.type}".`
      );
      return;
    }

    valid.push({ type: "subject", data: subject });
  });

  // ---- Validate Faculty ----
  imported.faculty.forEach((person, index) => {
    if (!person.name) {
      errors.push(`Faculty row ${index + 1}: Faculty name is required.`);
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
  const existingRooms =
    existingSetup.rooms || [];
  const existingCourses =
    existingSetup.courses || [];
  const existingSubjects =
    existingSetup.subjects || [];
  const existingFaculty =
    existingSetup.faculty || [];

  // ---- Merge Institution (override non-empty fields) ----
  const mergedInstitution = { ...existingSetup.institution };
  if (imported.institution) {
    Object.entries(imported.institution).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) {
        mergedInstitution[key] = value;
      }
    });
  }

  // ---- Merge Campuses (deduplicate by name) ----
  const existingCampusNames = new Set(
    (existingSetup.campuses || []).map((c) =>
      String(c.name || "").trim().toLowerCase()
    )
  );

  const newCampuses = (imported.campuses || []).filter((campus) => {
    const key = String(campus.name || "").trim().toLowerCase();
    return key && !existingCampusNames.has(key);
  });

  const mergedCampuses = [
    ...(existingSetup.campuses || []),
    ...newCampuses.map((campus) => ({
      ...campus,
      id: campus.id || createId("campus"),
      buildings: (campus.buildings || []).map((b) => ({
        ...b,
        id: b.id || createId("building"),
      })),
    })),
  ];

  // ---- Merge Rooms (deduplicate by roomNumber) ----
  const existingRoomNumbers = new Set(
    existingRooms.map((r) =>
      String(r.roomNumber || r.name || "")
        .trim()
        .toLowerCase()
    )
  );

  const newRooms = imported.rooms.filter((room) => {
    const key = String(room.roomNumber || "")
      .trim()
      .toLowerCase();
    return key && !existingRoomNumbers.has(key);
  });

  const mergedRooms = [
    ...existingRooms,
    ...newRooms.map((room) => ({
      ...room,
      id: room.id || createId("room"),
    })),
  ];

  // ---- Merge Courses (deduplicate by name) ----
  const existingCourseNames = new Set(
    existingCourses.map((c) =>
      String(c.name || "")
        .trim()
        .toLowerCase()
    )
  );

  const newCourses = imported.courses.filter((course) => {
    const key = String(course.name || "")
      .trim()
      .toLowerCase();
    return key && !existingCourseNames.has(key);
  });

  const mergedCourses = [
    ...existingCourses,
    ...newCourses.map((course) => ({
      ...course,
      id: course.id || createId("course"),
    })),
  ];

  // ---- Build courseId lookup by course name ----
  const courseIdByName = new Map();
  mergedCourses.forEach((course) => {
    courseIdByName.set(
      String(course.name || "")
        .trim()
        .toLowerCase(),
      course.id
    );
  });

  // ---- Merge Batches into courses (deduplicate by courseName + batchName) ----
  if (imported.batches && imported.batches.length > 0) {
    imported.batches.forEach((batch) => {
      const courseId = courseIdByName.get(
        (batch.courseName || "").toLowerCase()
      );
      if (!courseId) return;

      const course = mergedCourses.find((c) => c.id === courseId);
      if (!course) return;

      if (!course.batches) course.batches = [];

      const exists = course.batches.some(
        (b) =>
          (b.name || "").toLowerCase() === (batch.batchName || "").toLowerCase()
      );
      if (!exists) {
        course.batches.push({
          id: createId("batch"),
          name: batch.batchName,
          admissionYear: batch.admissionYear,
          courseId,
          duration: "",
          currentSemester: 1,
          studentCount: batch.studentCount || 60,
          requiredTimetable: true,
          sectionCount: 1,
          groupsPerSection: 2,
          groupsEnabled: false,
          sections: [],
        });
      }
    });
  }

  // ---- Merge Subjects (deduplicate by code if present, else by name) ----
  const existingSubjectKeys = new Set(
    existingSubjects.map((s) => {
      const code = String(s.code || "")
        .trim()
        .toLowerCase();
      const name = String(s.name || "")
        .trim()
        .toLowerCase();
      return code || name;
    })
  );

  const newSubjects = imported.subjects.filter(
    (subject) => {
      const code = String(subject.code || "")
        .trim()
        .toLowerCase();
      const name = String(subject.name || "")
        .trim()
        .toLowerCase();
      const key = code || name;
      return key && !existingSubjectKeys.has(key);
    }
  );

  const mergedSubjects = [
    ...existingSubjects,
    ...newSubjects.map((subject) => {
      const courseId =
        courseIdByName.get(
          (subject.courseName || "").toLowerCase()
        ) || "";

      return {
        ...subject,
        id: subject.id || createId("subject"),
        courseId,
      };
    }),
  ];

  // ---- Merge Faculty (deduplicate by employeeId, else by name) ----
  const existingFacultyKeys = new Set();
  existingFaculty.forEach((f) => {
    const empId = String(f.employeeId || "")
      .trim()
      .toLowerCase();
    const name = String(f.name || "")
      .trim()
      .toLowerCase();
    if (empId) existingFacultyKeys.add(`emp:${empId}`);
    if (name) existingFacultyKeys.add(`name:${name}`);
  });

  const newFaculty = imported.faculty.filter((person) => {
    const empId = String(person.employeeId || "")
      .trim()
      .toLowerCase();
    const name = String(person.name || "")
      .trim()
      .toLowerCase();

    if (empId && existingFacultyKeys.has(`emp:${empId}`)) {
      return false;
    }

    if (name && existingFacultyKeys.has(`name:${name}`)) {
      return false;
    }

    return true;
  });

  // ---- Map subject codes to subject IDs ----
  const subjectIdByCode = new Map();
  mergedSubjects.forEach((s) => {
    const code = String(s.code || "")
      .trim()
      .toLowerCase();
    if (code) {
      subjectIdByCode.set(code, s.id);
    }
  });

  const mergedFaculty = [
    ...existingFaculty,
    ...newFaculty.map((person) => {
      const subjectIds = (person.subjectCodes || [])
        .map((code) =>
          subjectIdByCode.get(code.toLowerCase())
        )
        .filter(Boolean);

      return {
        ...person,
        id: person.id || createId("faculty"),
        subjectIds: [
          ...new Set([...(person.subjectIds || []), ...subjectIds]),
        ],
      };
    }),
  ];

  // ---- Merge Availability (override non-empty fields) ----
  const mergedAvailability = { ...existingSetup.availability };
  if (imported.availability) {
    Object.entries(imported.availability).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) {
        mergedAvailability[key] = value;
      }
    });
  }

  // ---- Merge Constraints (override non-empty fields) ----
  const mergedConstraints = { ...existingSetup.constraints };
  if (imported.constraints) {
    Object.entries(imported.constraints).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) {
        mergedConstraints[key] = value;
      }
    });
  }

  return {
    ...existingSetup,
    institution: mergedInstitution,
    campuses: mergedCampuses,
    rooms: mergedRooms,
    courses: mergedCourses,
    subjects: mergedSubjects,
    faculty: mergedFaculty,
    availability: mergedAvailability,
    constraints: mergedConstraints,
    mergeStats: {
      roomsAdded: newRooms.length,
      coursesAdded: newCourses.length,
      subjectsAdded: newSubjects.length,
      facultyAdded: newFaculty.length,
    },
  };
};
