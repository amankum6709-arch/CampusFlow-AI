// ============================================================
// Naam: Setup Excel Export
// Kya karta hai: Professional Excel template download karta hai
//                with 11 sheets: Instructions, Institution, Campus,
//                Timetable, Rooms, Faculty, Subjects, Batches, Courses,
//                Availability, Constraints. Blank template with headers,
//                formatting, data validation, and freeze panes - no fake data.
// ============================================================

import { CAMPUS_MODES, INSTITUTION_TYPES } from "./constants.js";

// ── Reusable style definitions ──
const BRAND = "1e3a5f";
const WHITE = "ffffff";
const BORDER_COLOR = "c0c0c0";

const thinBorder = () => ({
  top: { style: "thin", color: { rgb: BORDER_COLOR } },
  bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
  left: { style: "thin", color: { rgb: BORDER_COLOR } },
  right: { style: "thin", color: { rgb: BORDER_COLOR } },
});

const headerStyle = () => ({
  font: { bold: true, sz: 11, color: { rgb: WHITE }, name: "Calibri" },
  fill: { fgColor: { rgb: BRAND }, patternType: "solid" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder(),
});

const createDataValidation = (sqref, type, formula1) => ({
  sqref,
  type,
  formula1,
  showErrorMessage: true,
  errorTitle: "Invalid Entry",
  error: "Please select a value from the dropdown list.",
});

// ============================================================
// Naam: buildDataSheet
// Kya karta hai: Ek professional data sheet banata hai with
//                styled headers, column widths, freeze, autofilter.
// ============================================================

const buildDataSheet = (XLSX, headers, options = {}) => {
  const { colWidths, validation, timeColumns = [], freezeRow = true, autoFilter = true } = options;

  // Build sheet with just headers first
  const sheet = XLSX.utils.aoa_to_sheet([headers]);

  // Apply header styles to row 1
  const lastColLetter = String.fromCharCode(64 + headers.length);
  for (let col = 0; col < headers.length; col++) {
    const cellRef = `${String.fromCharCode(64 + col + 1)}1`;
    sheet[cellRef] = sheet[cellRef] || {};
    sheet[cellRef].s = headerStyle();
  }

  // Set column widths
  sheet["!cols"] = colWidths || headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));

  // Set header row height
  sheet["!rows"] = [{ hpt: 28 }];

  // Freeze header row
  if (freezeRow) {
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  }

  // Auto-filter
  if (autoFilter && headers.length > 0) {
    sheet["!autofilter"] = { ref: `A1:${lastColLetter}1` };
  }

  // Data validation dropdowns
  if (validation && validation.length > 0) {
    sheet["!dataValidation"] = validation;
  }

  // Pre-apply time number format to time columns (rows 2-1000)
  if (timeColumns.length > 0) {
    for (const colIdx of timeColumns) {
      const colLetter = String.fromCharCode(65 + colIdx);
      for (let row = 2; row <= 1000; row++) {
        const cellRef = `${colLetter}${row}`;
        sheet[cellRef] = sheet[cellRef] || {};
        sheet[cellRef].z = "HH:MM";
      }
    }
  }

  return sheet;
};

// ============================================================
// Naam: buildInstructionsSheet
// Kya karta hai: Professional Instructions sheet banata hai
//                with title, sections, wrapped text, styling.
// ============================================================

const buildInstructionsSheet = (XLSX) => {
  const rows = [];
  const rowStyles = [];

  const addRow = (values, style = {}) => {
    rows.push(values);
    rowStyles.push(style);
  };

  const addBlank = () => addRow([""], {});
  const addSection = (title) => addRow([title], {
    font: { bold: true, sz: 13, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: BRAND } } },
  });
  const addText = (label, text) => addRow([label, text], {
    font: { sz: 11, name: "Calibri" },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  });

  addRow(["CampusFlow Excel Template"], {
    font: { bold: true, sz: 20, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  addRow(["Use this workbook to enter your university timetable and supporting data, then upload the completed workbook back into CampusFlow."], {
    font: { italic: true, sz: 11, name: "Calibri", color: { rgb: "555555" } },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  });
  addBlank();

  addSection("HOW TO USE");
  addText("1.", "Fill in the Institution and Campus sheets with your institution details, campuses, and buildings.");
  addText("2.", "Fill in the supporting sheets (Rooms, Faculty, Subjects, Batches, Courses).");
  addText("3.", "Enter timetable records in the Timetable sheet.");
  addText("4.", "Set faculty availability and scheduling constraints.");
  addText("5.", "Keep all required fields completed.");
  addText("6.", "Save the workbook as .xlsx format.");
  addText("7.", "Upload it back into CampusFlow via the Excel Import panel.");
  addText("8.", "CampusFlow will validate the uploaded data and check for conflicts.");
  addBlank();

  addSection("SHEETS IN THIS WORKBOOK");
  addText("Institution", "Enter institution name, type, academic year, contact location, website, and campus mode.");
  addText("Campus", "Enter each campus and its buildings/blocks. Add one row per building.");
  addText("Timetable", "Main sheet. Enter scheduled classes with day, time, course, subject, faculty, and room.");
  addText("Rooms", "Enter rooms with campus, building, floor, room type, and capacity.");
  addText("Faculty", "Enter faculty members with employee ID, department, and subject codes they teach.");
  addText("Subjects", "Enter subjects with subject codes and the course they belong to.");
  addText("Batches", "Enter batches with course, section, student count, and admission year.");
  addText("Courses", "Enter courses with course codes, duration in years, campus, and building.");
  addText("Availability", "Enter faculty availability by day and time range.");
  addText("Constraints", "Enter scheduling rules like max classes per day and lunch break.");
  addBlank();

  addSection("IMPORTANT RULES");
  addText("", "Blank means blank. Do not invent placeholder values.");
  addText("", "Days must use full names: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.");
  addText("", "Time should use HH:MM 24-hour format (e.g., 09:00, 14:30).");
  addText("", "Campus Mode must be Single or Multiple. Use Multiple when you add more than one campus.");
  addText("", "Faculty subject codes may be comma-separated. The same subject can have multiple faculty members.");
  addText("", "Admission Year is required per batch and must be a four-digit year.");
  addText("", "Conflicts are checked after upload, not in this workbook.");
  addText("", "Do not delete or rename required headers.");
  addBlank();

  addSection("FIELD REFERENCE");
  addText("Institution", "Institution Name, Short Name, Institution Type, Academic Year Start, City, State, Country, Established, Website, Campus Mode");
  addText("Campus", "Campus Name, Building Name, Building Code");
  addText("Timetable", "Day, Start Time, End Time, Course, Batch, Section, Subject, Subject Code, Faculty, Faculty ID, Room");
  addText("Rooms", "Room, Campus, Building, Floor, Room Type, Capacity");
  addText("Faculty", "Faculty Name, Faculty ID, Department, Subject Codes");
  addText("Subjects", "Subject, Subject Code, Course");
  addText("Batches", "Batch, Course, Section, Students, Admission Year, Admission Month");
  addText("Courses", "Course, Course Code, Duration, Campus, Building");
  addText("Availability", "Faculty, Day, Start Time, End Time, Available");
  addText("Constraints", "Constraint Type, Description, Enabled");

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  sheet["!cols"] = [
    { wch: 22 },
    { wch: 95 },
  ];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const style = rowStyles[rowIdx] || {};
    const cellA = sheet[`A${rowIdx + 1}`];
    if (cellA) cellA.s = { ...style };

    const cellB = sheet[`B${rowIdx + 1}`];
    if (cellB) {
      cellB.s = style.font?.sz === 13
        ? {
            font: { sz: 11, name: "Calibri" },
            alignment: { horizontal: "left", vertical: "center", wrapText: true },
          }
        : { ...style };
    }
  }

  sheet["!rows"] = rows.map((row, idx) => {
    const content = row.join(" ");
    if (idx === 0) return { hpt: 36 };
    if (idx === 1) return { hpt: 30 };
    if (row[0] && typeof row[0] === "string" && row[0] === row[0].toUpperCase() && row[0].length > 3) return { hpt: 28 };
    if (content.trim() === "") return { hpt: 10 };
    return { hpt: 22 };
  });

  sheet["!freeze"] = { xSplit: 0, ySplit: 3 };

  return sheet;
};

// ============================================================
// Naam: downloadSetupTemplate
// Kya karta hai: Workbook build karke download karta hai.
// ============================================================

export const buildSetupTemplateWorkbook = async () => {
  const XLSX = await import("xlsx");

  const workbook = XLSX.utils.book_new();

  // ── Sheet 1: Instructions ──
  XLSX.utils.book_append_sheet(
    workbook,
    buildInstructionsSheet(XLSX),
    "Instructions"
  );

  // ── Sheet 2: Institution ──
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

  const institutionTypeValidation = createDataValidation(
    "C2:C1000",
    "list",
    `"${INSTITUTION_TYPES.join(",")}"`
  );

  const campusModeValidation = createDataValidation(
    "J2:J1000",
    "list",
    `"${CAMPUS_MODES.map((mode) => mode.charAt(0).toUpperCase() + mode.slice(1)).join(",")}"`
  );

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, institutionHeaders, {
      colWidths: [
        { wch: 32 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 26 },
        { wch: 16 },
      ],
      validation: [institutionTypeValidation, campusModeValidation],
    }),
    "Institution"
  );

  // ── Sheet 3: Campus ──
  const campusHeaders = [
    "Campus Name",
    "Building Name",
    "Building Code",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, campusHeaders, {
      colWidths: [
        { wch: 28 },
        { wch: 28 },
        { wch: 18 },
      ],
    }),
    "Campus"
  );

  // ── Sheet 4: Timetable ──
  const timetableHeaders = [
    "Day",
    "Start Time",
    "End Time",
    "Course",
    "Batch",
    "Section",
    "Subject",
    "Subject Code",
    "Faculty",
    "Faculty ID",
    "Room",
  ];

  const timetableDayValidation = createDataValidation(
    "A2:A1000",
    "list",
    `"Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday"`
  );

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, timetableHeaders, {
      colWidths: [
        { wch: 14 }, // Day
        { wch: 14 }, // Start Time
        { wch: 14 }, // End Time
        { wch: 24 }, // Course
        { wch: 16 }, // Batch
        { wch: 12 }, // Section
        { wch: 26 }, // Subject
        { wch: 16 }, // Subject Code
        { wch: 22 }, // Faculty
        { wch: 14 }, // Faculty ID
        { wch: 16 }, // Room
      ],
      validation: [timetableDayValidation],
      timeColumns: [1, 2], // Start Time (col B=1), End Time (col C=2)
    }),
    "Timetable"
  );

  // ── Sheet 5: Rooms ──
  const roomHeaders = [
    "Room",
    "Campus",
    "Building",
    "Floor",
    "Room Type",
    "Capacity",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, roomHeaders, {
      colWidths: [
        { wch: 16 }, // Room
        { wch: 22 }, // Campus
        { wch: 20 }, // Building
        { wch: 10 }, // Floor
        { wch: 18 }, // Room Type
        { wch: 12 }, // Capacity
      ],
    }),
    "Rooms"
  );

  // ── Sheet 6: Faculty ──
  const facultyHeaders = [
    "Faculty Name",
    "Faculty ID",
    "Department",
    "Subject Codes",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, facultyHeaders, {
      colWidths: [
        { wch: 26 }, // Faculty Name
        { wch: 16 }, // Faculty ID
        { wch: 26 }, // Department
        { wch: 30 }, // Subject Codes
      ],
    }),
    "Faculty"
  );

  // ── Sheet 5: Subjects ──
  const subjectHeaders = [
    "Subject",
    "Subject Code",
    "Course",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, subjectHeaders, {
      colWidths: [
        { wch: 28 }, // Subject
        { wch: 16 }, // Subject Code
        { wch: 28 }, // Course
      ],
    }),
    "Subjects"
  );

  // ── Sheet 8: Batches ──
  const batchHeaders = [
    "Batch",
    "Course",
    "Section",
    "Students",
    "Admission Year",
    "Admission Month",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, batchHeaders, {
      colWidths: [
        { wch: 20 }, // Batch
        { wch: 28 }, // Course
        { wch: 12 }, // Section
        { wch: 12 }, // Students
        { wch: 16 }, // Admission Year
        { wch: 18 }, // Admission Month
      ],
    }),
    "Batches"
  );

  // ── Sheet 9: Courses ──
  const courseHeaders = [
    "Course",
    "Course Code",
    "Duration",
    "Campus",
    "Building",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, courseHeaders, {
      colWidths: [
        { wch: 30 }, // Course
        { wch: 18 }, // Course Code
        { wch: 12 }, // Duration
        { wch: 22 }, // Campus
        { wch: 22 }, // Building
      ],
    }),
    "Courses"
  );

  // ── Sheet 8: Availability ──
  const availabilityHeaders = [
    "Faculty",
    "Day",
    "Start Time",
    "End Time",
    "Available",
  ];

  const availDayValidation = createDataValidation(
    "B2:B1000",
    "list",
    `"Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday"`
  );

  const availBoolValidation = createDataValidation(
    "E2:E1000",
    "list",
    `"Yes,No"`
  );

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, availabilityHeaders, {
      colWidths: [
        { wch: 22 }, // Faculty
        { wch: 14 }, // Day
        { wch: 14 }, // Start Time
        { wch: 14 }, // End Time
        { wch: 12 }, // Available
      ],
      validation: [availDayValidation, availBoolValidation],
      timeColumns: [2, 3], // Start Time (col C=2), End Time (col D=3)
    }),
    "Availability"
  );

  // ── Sheet 9: Constraints ──
  const constraintHeaders = [
    "Constraint Type",
    "Description",
    "Enabled",
  ];

  const constraintBoolValidation = createDataValidation(
    "C2:C1000",
    "list",
    `"Yes,No"`
  );

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, constraintHeaders, {
      colWidths: [
        { wch: 28 }, // Constraint Type
        { wch: 48 }, // Description
        { wch: 10 }, // Enabled
      ],
      validation: [constraintBoolValidation],
    }),
    "Constraints"
  );

  return { XLSX, workbook };
};

export const downloadSetupTemplate = async () => {
  const { XLSX, workbook } = await buildSetupTemplateWorkbook();
  XLSX.writeFile(workbook, "CampusFlow_Excel_Template.xlsx");
};
