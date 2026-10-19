// ============================================================
// Naam: Faculty Import Utility
// Kya karta hai: Excel/CSV faculty master ko CampusFlow ke faculty aur subject mapping format mein convert karta hai.
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
// Naam: parseList
// Kya karta hai: Comma, semicolon, pipe ya line-break values ko array mein convert karta hai.
// ============================================================

const parseList = (value) =>
  String(value || "")
    .split(/[,;|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

// ============================================================
// Naam: parseDays
// Kya karta hai: Faculty ke available days ko standard day names mein convert karta hai.
// ============================================================

const parseDays = (value) =>
  parseList(value)
    .map(normalizeDay)
    .filter(Boolean);

// ============================================================
// Naam: createImportedId
// Kya karta hai: Imported faculty ko unique ID deta hai.
// ============================================================

const createImportedId = (prefix, value) => {
  const cleanValue = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  return `${prefix}-${cleanValue || Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
};

// ============================================================
// Naam: parseCsv
// Kya karta hai: CSV file ko rows aur columns mein convert karta hai.
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

      if (row.some((value) => String(value).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);

  if (row.some((value) => String(value).trim() !== "")) {
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

// ============================================================
// Naam: readRows
// Kya karta hai: CSV aur Excel files ko read karke rows return karta hai.
// ============================================================

const readRows = async (file) => {
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

      const firstSheet =
        workbook.Sheets[workbook.SheetNames[0]];

      return XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
      });
    } catch (error) {
      throw new Error(
        "Excel import ke liye frontend folder mein 'npm install xlsx' run karo. CSV import directly supported hai."
      );
    }
  }

  throw new Error(
    "Please upload an .xlsx, .xls, or .csv file."
  );
};

// ============================================================
// Naam: findSubjectMatches
// Kya karta hai: Excel ke subject code/name ko existing subjects se match karta hai.
// ============================================================

const findSubjectMatches = (values, subjects) => {
  const matches = [];

  values.forEach((value) => {
    const normalizedValue = normalizeHeader(value);

    if (!normalizedValue) {
      return;
    }

    subjects.forEach((subject) => {
      const codeMatch =
        normalizeHeader(subject.code) === normalizedValue;

      const nameMatch =
        normalizeHeader(subject.name) === normalizedValue;

      if (
        (codeMatch || nameMatch) &&
        !matches.some((item) => item.id === subject.id)
      ) {
        matches.push(subject);
      }
    });
  });

  return matches;
};

// ============================================================
// Naam: importFacultyFile
// Kya karta hai: Excel/CSV se faculty import karke subject mapping sync karta hai.
// ============================================================

export const importFacultyFile = async (
  file,
  existingSubjects = [],
  existingFaculty = []
) => {
  const rows = await readRows(file);

  if (!rows.length) {
    throw new Error(
      "The selected file does not contain any faculty records."
    );
  }

  const facultyByKey = new Map();

  const subjectsCopy = existingSubjects.map((subject) => ({
    ...subject,
    facultyIds: [...(subject.facultyIds || [])],
  }));

  let createdCount = 0;
  let mappedCount = 0;

  rows.forEach((row) => {
    const facultyIdFromFile = String(
      getValue(row, [
        "Faculty ID",
        "FacultyId",
        "ID",
        "Faculty Code",
      ])
    ).trim();

    const name = String(
      getValue(row, [
        "Faculty Name",
        "Name",
        "Full Name",
        "Teacher Name",
      ])
    ).trim();

    const employeeId = String(
      getValue(row, [
        "Employee ID",
        "EmployeeId",
        "Employee Code",
        "Employee",
      ])
    ).trim();

    const department = String(
      getValue(row, [
        "Department",
        "Department Name",
        "Dept",
      ])
    ).trim();

    const maxClassesValue = Number(
      getValue(row, [
        "Max Classes Per Day",
        "Max Classes",
        "Daily Limit",
      ])
    );

    const availableDays = parseDays(
      getValue(row, [
        "Available Days",
        "Working Days",
        "Days",
        "Availability",
      ])
    );

    const leaveDates = parseList(
      getValue(row, [
        "Leave Dates",
        "Leaves",
        "Leave",
      ])
    );

    if (!name) {
      return;
    }

    const key =
      employeeId ||
      facultyIdFromFile ||
      normalizeHeader(name);

    let member = facultyByKey.get(key);

    if (!member) {
      const existing = existingFaculty.find(
        (item) =>
          (employeeId &&
            String(item.employeeId || "").trim() ===
              employeeId) ||
          (!employeeId &&
            normalizeHeader(item.name) ===
              normalizeHeader(name))
      );

      member = existing
        ? {
            ...existing,
            subjectIds: [...(existing.subjectIds || [])],
            availableDays: [
              ...(existing.availableDays || []),
            ],
            leaveDates: [
              ...(existing.leaveDates || []),
            ],
          }
        : {
            id: facultyIdFromFile
              ? createImportedId(
                  "faculty",
                  facultyIdFromFile
                )
              : createImportedId(
                  "faculty",
                  name
                ),

            name,

            employeeId:
              employeeId || facultyIdFromFile,

            department,

            subjectIds: [],

            maxClassesPerDay:
              Number.isFinite(maxClassesValue) &&
              maxClassesValue > 0
                ? maxClassesValue
                : 4,

            availableDays:
              availableDays.length
                ? availableDays
                : [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                  ],

            leaveDates,
          };

      member.name = name || member.name;

      member.employeeId =
        employeeId ||
        member.employeeId ||
        facultyIdFromFile;

      member.department =
        department ||
        member.department ||
        "";

      if (
        Number.isFinite(maxClassesValue) &&
        maxClassesValue > 0
      ) {
        member.maxClassesPerDay =
          maxClassesValue;
      }

      if (availableDays.length) {
        member.availableDays = [
          ...new Set([
            ...(member.availableDays || []),
            ...availableDays,
          ]),
        ];
      }

      if (leaveDates.length) {
        member.leaveDates = [
          ...new Set([
            ...(member.leaveDates || []),
            ...leaveDates,
          ]),
        ];
      }

      if (
        !facultyByKey.has(key) &&
        !existing
      ) {
        createdCount += 1;
      }

      facultyByKey.set(key, member);
    }

    const subjectValues = parseList(
      getValue(row, [
        "Subject Code",
        "Subject Codes",
        "SubjectCode",
        "Subject",
        "Subjects",
        "Subject Name",
        "Subject Names",
        "Course Subject",
      ])
    );

    const matchedSubjects =
      findSubjectMatches(
        subjectValues,
        subjectsCopy
      );

    matchedSubjects.forEach((subject) => {
      if (
        !(member.subjectIds || []).includes(
          subject.id
        )
      ) {
        member.subjectIds.push(subject.id);
      }

      if (
        !(subject.facultyIds || []).includes(
          member.id
        )
      ) {
        subject.facultyIds.push(
          member.id
        );

        mappedCount += 1;
      }
    });
  });

  const importedFaculty =
    [...facultyByKey.values()];

  if (!importedFaculty.length) {
    throw new Error(
      "No valid faculty names were found. Check the Faculty Name column."
    );
  }

  const importedIds = new Set(
    importedFaculty.map(
      (item) => item.id
    )
  );

  const remainingFaculty =
    existingFaculty.filter(
      (item) =>
        !importedIds.has(item.id)
    );

  return {
    faculty: [
      ...remainingFaculty,
      ...importedFaculty,
    ],

    subjects: subjectsCopy,

    message:
      `${importedFaculty.length} faculty records imported. ` +
      `${mappedCount} subject-faculty mappings matched by subject code/name.`,

    createdCount,

    mappedCount,
  };
};

// ============================================================
// Naam: downloadFacultyTemplate
// Kya karta hai: Faculty Excel-compatible CSV template download karta hai.
// ============================================================

export const downloadFacultyTemplate = () => {
  const headers = [
    "Faculty ID",
    "Faculty Name",
    "Employee ID",
    "Department",
    "Max Classes Per Day",
    "Available Days",
    "Leave Dates",
    "Subject Code",
  ];

  const example = [
    "FAC001",
    "Dr. Rajesh Kumar",
    "EMP101",
    "Computer Science",
    "4",
    "Monday,Tuesday,Wednesday,Thursday,Friday",
    "",
    "24CAT,24PY",
  ];

  const csv =
    `${headers.join(",")}\n` +
    `${example
      .map(
        (value) =>
          `"${String(value).replace(
            /"/g,
            '""'
          )}"`
      )
      .join(",")}\n`;

  const blob = new Blob(
    [csv],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;

  anchor.download =
    "CampusFlow_Faculty_Template.csv";

  anchor.click();

  URL.revokeObjectURL(url);
};