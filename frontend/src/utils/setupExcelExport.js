// ============================================================
// Naam: Setup Excel Export
// Kya karta hai: Professional Excel template download karta hai
//                with 9 sheets: Instructions, Timetable, Rooms,
//                Faculty, Subjects, Batches, Courses, Availability,
//                Constraints. Blank template with headers, formatting,
//                data validation, and freeze panes — no fake data.
// ============================================================

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── Reusable style definitions ──
const BRAND = "1e3a5f";
const BRAND_LIGHT = "e8f0fe";
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

const dataCellFormat = (isTime) => ({
  font: { sz: 11, name: "Calibri" },
  alignment: { horizontal: "left", vertical: "center", wrapText: false },
  border: thinBorder(),
  numFmt: isTime ? "HH:MM" : undefined,
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
  const { colWidths, validation, timeColumns = [], freezeRow = true, autoFilter = true, rowHeight = 22 } = options;

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
  // Build the content as array-of-arrays
  const rows = [
    // Row 1: Title (spanning conceptually across columns)
    ["CampusFlow Excel Template"],
    // Row 2: Subtitle
    ["Use this workbook to enter your university timetable and supporting data, then upload the completed workbook back into CampusFlow."],
    // Row 3: blank
    [""],
    // Row 4: Section — HOW TO USE
    ["HOW TO USE"],
    // Row 5-10: Steps
    ["1.", "Fill in the supporting sheets (Rooms, Faculty, Subjects, Batches, Courses)."],
    ["2.", "Enter timetable records in the Timetable sheet."],
    ["3.", "Set faculty availability and scheduling constraints."],
    ["4.", "Keep all required fields completed."],
    ["5.", "Save the workbook as .xlsx format."],
    ["6.", "Upload it back into CampusFlow via the Excel Import panel."],
    ["7.", "CampusFlow will validate the uploaded data and check for conflicts."],
    // Row 11: blank
    [""],
    // Row 12: Section — SHEETS
    ["SHEETS IN THIS WORKBOOK"],
    // Row 13-20: Sheet descriptions
    ["Timetable", "Main sheet. Enter scheduled classes with day, time, course, subject, faculty, and room."],
    ["Rooms", "Enter rooms with building, floor, room type, and capacity."],
    ["Faculty", "Enter faculty members with employee ID and department."],
    ["Subjects", "Enter subjects with subject codes and the course they belong to."],
    ["Batches", "Enter batches with course, section, and student counts."],
    ["Courses", "Enter courses with course codes and duration in years."],
    ["Availability", "Enter faculty availability by day and time range."],
    ["Constraints", "Enter scheduling rules like max classes per day and lunch break."],
    // Row 21: blank
    [""],
    // Row 22: Section — IMPORTANT RULES
    ["IMPORTANT RULES"],
    // Row 23-28: Rules
    ["", "Blank means blank. Do not invent placeholder values."],
    ["", "Days must use full names: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday."],
    ["", "Time should use HH:MM 24-hour format (e.g., 09:00, 14:30)."],
    ["", "The same subject can have multiple faculty members."],
    ["", "Conflicts are checked after upload, not in this workbook."],
    ["", "Do not delete or rename required headers."],
    // Row 29: blank
    [""],
    // Row 30: Section — FIELD REFERENCE
    ["FIELD REFERENCE"],
    // Row 31-38: Headers for each sheet
    ["Timetable", "Day, Start Time, End Time, Course, Batch, Section, Subject, Subject Code, Faculty, Faculty ID, Room"],
    ["Rooms", "Room, Building, Floor, Room Type, Capacity"],
    ["Faculty", "Faculty Name, Faculty ID, Department"],
    ["Subjects", "Subject, Subject Code, Course"],
    ["Batches", "Batch, Course, Section, Students"],
    ["Courses", "Course, Course Code, Duration"],
    ["Availability", "Faculty, Day, Start Time, End Time, Available"],
    ["Constraints", "Constraint Type, Description, Enabled"],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Column widths: A is narrow label column, B is wide content column
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 95 },
  ];

  // Row styles
  const rowStyles = [];

  // Row 1: Title — large bold
  rowStyles.push({
    font: { bold: true, sz: 20, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  // Row 2: Subtitle — italic, muted
  rowStyles.push({
    font: { italic: true, sz: 11, name: "Calibri", color: { rgb: "555555" } },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  });

  // Row 3: blank
  rowStyles.push({});

  // Row 4: Section heading "HOW TO USE"
  rowStyles.push({
    font: { bold: true, sz: 13, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: BRAND } } },
  });

  // Rows 5-11: Steps + blank
  for (let i = 5; i <= 11; i++) {
    if (i === 11) {
      rowStyles.push({});
    } else {
      rowStyles.push({
        font: { sz: 11, name: "Calibri" },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      });
    }
  }

  // Row 12: Section heading "SHEETS IN THIS WORKBOOK"
  rowStyles.push({
    font: { bold: true, sz: 13, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: BRAND } } },
  });

  // Rows 13-20: Sheet descriptions
  for (let i = 13; i <= 20; i++) {
    rowStyles.push({
      font: { sz: 11, name: "Calibri" },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
  }

  // Row 21: blank
  rowStyles.push({});

  // Row 22: Section heading "IMPORTANT RULES"
  rowStyles.push({
    font: { bold: true, sz: 13, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: BRAND } } },
  });

  // Rows 23-28: Rules
  for (let i = 23; i <= 28; i++) {
    rowStyles.push({
      font: { sz: 11, name: "Calibri" },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
  }

  // Row 29: blank
  rowStyles.push({});

  // Row 30: Section heading "FIELD REFERENCE"
  rowStyles.push({
    font: { bold: true, sz: 13, name: "Calibri", color: { rgb: BRAND } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: BRAND } } },
  });

  // Rows 31-38: Field reference
  for (let i = 31; i <= 38; i++) {
    rowStyles.push({
      font: { sz: 11, name: "Calibri" },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
  }

  // Apply styles to cells in column A and B
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const style = rowStyles[rowIdx] || {};

    // Style cell A{rowIdx+1}
    const cellA = sheet[`A${rowIdx + 1}`];
    if (cellA) {
      cellA.s = { ...style };
      // For section headings, apply to column A only with bold
      if (style.font && style.font.bold && style.font.sz === 13) {
        cellA.s.font = { ...style.font };
      }
    }

    // Style cell B{rowIdx+1}
    const cellB = sheet[`B${rowIdx + 1}`];
    if (cellB) {
      cellB.s = { ...style };
      // For section headings in B, don't apply heading style
      if (style.font && style.font.bold && style.font.sz === 13) {
        cellB.s = {
          font: { sz: 11, name: "Calibri" },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
        };
      }
    }
  }

  // Set row heights for better spacing
  sheet["!rows"] = rows.map((row, idx) => {
    const content = row.join(" ");
    if (idx === 0) return { hpt: 36 }; // Title
    if (idx === 1) return { hpt: 30 }; // Subtitle
    if (row[0] && typeof row[0] === "string" && row[0] === row[0].toUpperCase() && row[0].length > 3) return { hpt: 28 }; // Section headings
    if (content.trim() === "") return { hpt: 10 }; // Blank rows
    return { hpt: 22 }; // Normal rows
  });

  // Freeze at row 4 (below title + subtitle + blank)
  sheet["!freeze"] = { xSplit: 0, ySplit: 3 };

  return sheet;
};

// ============================================================
// Naam: downloadSetupTemplate
// Kya karta hai: Workbook build karke download karta hai.
// ============================================================

export const downloadSetupTemplate = async () => {
  const XLSX = await import("xlsx");

  const workbook = XLSX.utils.book_new();

  // ── Sheet 1: Instructions ──
  XLSX.utils.book_append_sheet(
    workbook,
    buildInstructionsSheet(XLSX),
    "Instructions"
  );

  // ── Sheet 2: Timetable ──
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

  // ── Sheet 3: Rooms ──
  const roomHeaders = [
    "Room",
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
        { wch: 20 }, // Building
        { wch: 10 }, // Floor
        { wch: 18 }, // Room Type
        { wch: 12 }, // Capacity
      ],
    }),
    "Rooms"
  );

  // ── Sheet 4: Faculty ──
  const facultyHeaders = [
    "Faculty Name",
    "Faculty ID",
    "Department",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, facultyHeaders, {
      colWidths: [
        { wch: 26 }, // Faculty Name
        { wch: 16 }, // Faculty ID
        { wch: 26 }, // Department
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

  // ── Sheet 6: Batches ──
  const batchHeaders = [
    "Batch",
    "Course",
    "Section",
    "Students",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, batchHeaders, {
      colWidths: [
        { wch: 20 }, // Batch
        { wch: 28 }, // Course
        { wch: 12 }, // Section
        { wch: 12 }, // Students
      ],
    }),
    "Batches"
  );

  // ── Sheet 7: Courses ──
  const courseHeaders = [
    "Course",
    "Course Code",
    "Duration",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    buildDataSheet(XLSX, courseHeaders, {
      colWidths: [
        { wch: 30 }, // Course
        { wch: 18 }, // Course Code
        { wch: 12 }, // Duration
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

  XLSX.writeFile(workbook, "CampusFlow_Excel_Template.xlsx");
};
