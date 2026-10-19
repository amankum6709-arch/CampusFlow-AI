// ============================================================
// Naam: Setup Validators
// Kya karta hai: Har setup step ke minimum required fields validate karta hai.
// ============================================================

export const validateInstitution = (institution) => {
  if (!institution.name.trim()) {
    return "Institution name is required.";
  }

  if (!institution.type) {
    return "Institution type is required.";
  }

  if (!institution.academicYearStart) {
    return "Academic year is required.";
  }

  if (Number(institution.academicYearStart) < new Date().getFullYear()) {
    return "Past academic year select nahi kar sakte.";
  }

  return "";
};

export const validateCampuses = (campuses) => {
  if (!campuses.length) {
    return "At least one campus is required.";
  }

  for (const campus of campuses) {
    if (!campus.name.trim()) {
      return "Har campus ka naam required hai.";
    }

    if (!campus.buildings.length) {
      return `${campus.name} mein kam se kam ek building/block hona chahiye.`;
    }

    for (const building of campus.buildings) {
      if (!building.name.trim()) {
        return `${campus.name} ke har building/block ka naam required hai.`;
      }
    }
  }

  return "";
};

export const validateRooms = (rooms) => {
  if (!rooms.length) {
    return "At least one room generate/add karo.";
  }

  const invalid = rooms.find(
    (room) => !room.roomNumber || Number(room.capacity) < 1
  );

  if (invalid) {
    return "Room number aur valid capacity required hai.";
  }

  return "";
};

export const validateCourses = (courses) => {
  if (!courses.length) {
    return "At least one course add karo.";
  }

  for (const course of courses) {
    if (!course.name.trim()) {
      return "Course name required hai.";
    }

    if (!course.totalSemesters) {
      return `${course.name}: total semesters required hai.`;
    }

    if (!course.batches.length) {
      return `${course.name}: at least one batch required hai.`;
    }
  }

  return "";
};

export const validateSubjects = (subjects, availability = null) => {
  if (!subjects.length) {
    return "At least one subject add karo.";
  }

  const slotDuration = availability?.slotDuration || 60;

  for (const subject of subjects) {
    if (!subject.name.trim()) {
      return "Subject name required hai.";
    }

    if (!subject.courseId) {
      return `${subject.name}: course select karo.`;
    }

    if (!subject.batchIds?.length) {
      return `${subject.name}: at least one batch assign karo. Semester selected batch se automatically set hota hai.`;
    }

    if (!subject.weeklyPeriods || Number(subject.weeklyPeriods) < 1) {
      return `${subject.name}: weekly periods valid hone chahiye.`;
    }

    // Item 7: Subject duration must not exceed global class slot duration
    const subjectDuration = Number(subject.durationMinutes || 60);
    if (subjectDuration > slotDuration) {
      return `${subject.name} ka duration (${subjectDuration} min) global class slot duration (${slotDuration} min) se zyada hai. Duration kam karo ya slot duration badhao.`;
    }
  }

  return "";
};

// ============================================================
// Naam: Availability Validator
// Kya karta hai: Working days, timing, slot duration aur break
// settings validate karta hai.
// ============================================================

const _toMin = (v) => {
  if (!v || typeof v !== "string") return 0;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

export const validateAvailability = (availability, constraints = null) => {
  const { dayStart, dayEnd, workingDays, slotDuration } = availability || {};

  if (!dayStart) return "Start time is required.";
  if (!dayEnd) return "End time is required.";

  if (dayStart && dayEnd && _toMin(dayEnd) <= _toMin(dayStart)) {
    return "End time must be later than start time.";
  }

  if (!workingDays || workingDays.length === 0) {
    return "Select at least one working day.";
  }

  if (!slotDuration || slotDuration < 1) {
    return "Class duration must be at least 1 minute.";
  }

  if (dayStart && dayEnd && slotDuration > _toMin(dayEnd) - _toMin(dayStart)) {
    return "Working hours are shorter than the selected class duration.";
  }

  const lunchDur = constraints?.lunchDuration || 0;
  if (lunchDur > 0) {
    const lunchStart = constraints?.lunchStart;
    if (!lunchStart) return "Lunch start time is required.";

    if (lunchStart && dayStart && _toMin(lunchStart) < _toMin(dayStart)) {
      return "Lunch break must be inside working hours.";
    }
    if (lunchStart && dayEnd && _toMin(lunchStart) + lunchDur > _toMin(dayEnd)) {
      return "Lunch break must be inside working hours.";
    }
  }

  return "";
};

// ============================================================
// Naam: Faculty Validator
// Kya karta hai: Faculty ka basic data validate karta hai.
// Faculty-specific max classes/day ko global constraint ke against check karta hai.
// ============================================================

export const validateFaculty = (faculty, constraints = null) => {
  if (!faculty.length) {
    return "At least one faculty member add karo.";
  }

  for (const person of faculty) {
    if (!person.name || !person.name.trim()) {
      return "Faculty name required hai.";
    }
  }

  // Item 5: Check faculty-specific limits against global constraint
  if (constraints?.maxClassesPerDay) {
    const globalMax = Number(constraints.maxClassesPerDay);
    const violating = [];
    for (const person of faculty) {
      const facultyMax = Number(person.maxClassesPerDay || 0);
      if (facultyMax > 0 && facultyMax > globalMax) {
        violating.push(`${person.name} (${facultyMax})`);
      }
    }
    if (violating.length > 0) {
      return `Ye faculty members ka max classes/day global limit (${globalMax}) se zyada hai: ${violating.join(", ")}. Pehle global limit badhao ya faculty ka limit kam karo.`;
    }
  }

  return "";
};