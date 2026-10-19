// ============================================================
// Naam: Setup Helpers
// Kya karta hai: Setup data ke liye reusable ID, academic year, room number aur time helpers deta hai.
// ============================================================

export const createId = (prefix = "id") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getCurrentAcademicYearStart = () => new Date().getFullYear();

export const formatAcademicYear = (startYear) => {
  const year = Number(startYear);

  if (!Number.isInteger(year)) {
    return "";
  }

  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
};

export const getFloorRoomNumber = (startingRoomNumber, floor, roomIndex) => {
  const start = Number(startingRoomNumber);
  return start + (floor - 1) * 100 + roomIndex;
};

export const getMinutes = (time) => {
  if (!time || !time.includes(":")) {
    return 0;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const formatTime = (totalMinutes) => {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

export const createTimeSlots = (start, end, duration, breakDuration = 0) => {
  const slots = [];
  let cursor = getMinutes(start);
  const endMinutes = getMinutes(end);
  const slotDuration = Number(duration);

  if (!slotDuration || slotDuration < 1) {
    return slots;
  }

  while (cursor + slotDuration <= endMinutes) {
    const slotEnd = cursor + slotDuration;

    slots.push({
      start: formatTime(cursor),
      end: formatTime(slotEnd),
      startMinutes: cursor,
      endMinutes: slotEnd,
    });

    cursor = slotEnd + Number(breakDuration || 0);
  }

  return slots;
};

export const clone = (value) => JSON.parse(JSON.stringify(value));
