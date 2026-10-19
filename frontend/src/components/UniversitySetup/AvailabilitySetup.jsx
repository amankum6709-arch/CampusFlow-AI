import { useState, useMemo, useCallback } from "react";
import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import { DAYS } from "../../utils/constants";

// ── Time helpers ─────────────────────────────────────────────
const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const formatHM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const durationLabel = (d) => {
  if (d >= 60) {
    const h = d / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${d} minutes`;
};

// ── Build time slots for preview ─────────────────────────────
function buildSlots(start, end, durMins, breakEnabled, breakStart, breakEnd) {
  const slots = [];
  const dayStart = toMinutes(start);
  const dayEnd = toMinutes(end);
  const bStart = breakEnabled ? toMinutes(breakStart) : -1;
  const bEnd = breakEnabled ? toMinutes(breakEnd) : -1;

  let t = dayStart;
  while (t + durMins <= dayEnd) {
    const slotEnd = t + durMins;

    if (breakEnabled && bStart >= 0 && bEnd > bStart) {
      if (t < bEnd && slotEnd > bStart) {
        if (t < bStart) {
          slots.push({ start: t, end: bStart, type: "class" });
        }
        slots.push({ start: bStart, end: bEnd, type: "break" });
        t = bEnd;
        continue;
      }
    }

    slots.push({ start: t, end: slotEnd, type: "class" });
    t = slotEnd;
  }

  if (t < dayEnd) {
    slots.push({ start: t, end: dayEnd, type: "remaining" });
  }
  return slots;
}

// ── Count class slots per day and per week ───────────────────
function countClassSlots(dayStart, dayEnd, dur, breakEnabled, bStart, bEnd, numDays) {
  const dayMins = toMinutes(dayEnd) - toMinutes(dayStart);
  if (dayMins < dur) return { perDay: 0, perWeek: 0 };

  const slots = buildSlots(dayStart, dayEnd, dur, breakEnabled, bStart, bEnd);
  const perDay = slots.filter((s) => s.type === "class").length;
  return { perDay, perWeek: perDay * numDays };
}

// ── Validation ───────────────────────────────────────────────
function validate(availability, breakEnabled, breakStart, breakEnd) {
  const errors = [];
  const { dayStart, dayEnd, workingDays, slotDuration } = availability;

  if (!dayStart) errors.push("Start time is required.");
  if (!dayEnd) errors.push("End time is required.");

  if (dayStart && dayEnd) {
    if (toMinutes(dayEnd) <= toMinutes(dayStart)) {
      errors.push("End time must be later than start time.");
    }
  }

  if (!workingDays || workingDays.length === 0) {
    errors.push("Select at least one working day.");
  }

  if (!slotDuration || slotDuration < 1) {
    errors.push("Class duration must be at least 1 minute.");
  }

  if (dayStart && dayEnd && toMinutes(dayEnd) > toMinutes(dayStart)) {
    const totalMins = toMinutes(dayEnd) - toMinutes(dayStart);
    if (slotDuration > totalMins) {
      errors.push("Working hours are shorter than the selected class duration.");
    }
  }

  if (breakEnabled) {
    if (!breakStart || !breakEnd) {
      errors.push("Break start and end times are required when break is enabled.");
    } else {
      if (toMinutes(breakEnd) <= toMinutes(breakStart)) {
        errors.push("Break end time must be later than break start time.");
      }
      if (dayStart && toMinutes(breakStart) < toMinutes(dayStart)) {
        errors.push("Break must be inside working hours.");
      }
      if (dayEnd && toMinutes(breakEnd) > toMinutes(dayEnd)) {
        errors.push("Break must be inside working hours.");
      }
    }
  }

  return errors;
}

// ── Component ────────────────────────────────────────────────
function AvailabilitySetup({ availability, onChange, constraints = {}, onConstraintsChange }) {
  const [breakEnabled, setBreakEnabled] = useState(
    () => (constraints.lunchDuration || 0) > 0
  );
  const [breakStart, setBreakStart] = useState(constraints.lunchStart || "13:00");
  const [breakEnd, setBreakEnd] = useState(() => {
    const s = toMinutes(constraints.lunchStart || "13:00");
    const d = constraints.lunchDuration || 60;
    return formatHM(s + d);
  });
  const [previewDay, setPreviewDay] = useState(availability.workingDays?.[0] || "Monday");
  const [selectedPreset, setSelectedPreset] = useState("custom");

  // ── Update helpers ───────────────────────────────────────
  const update = useCallback(
    (key, value) => onChange({ ...availability, [key]: value }),
    [availability, onChange]
  );

  const toggleDay = useCallback(
    (day) => {
      const current = availability.workingDays || [];
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day];
      update("workingDays", next);
    },
    [availability, update]
  );

  // ── Sync break → constraints ─────────────────────────────
  const syncBreakToConstraints = useCallback(
    (enabled, bStart, bEnd) => {
      if (!onConstraintsChange) return;
      const sMin = toMinutes(bStart);
      const eMin = toMinutes(bEnd);
      const dur = enabled && eMin > sMin ? eMin - sMin : 0;
      onConstraintsChange({
        ...constraints,
        lunchStart: bStart,
        lunchDuration: dur,
      });
    },
    [constraints, onConstraintsChange]
  );

  const handleBreakToggle = useCallback(() => {
    const next = !breakEnabled;
    setBreakEnabled(next);
    syncBreakToConstraints(next, breakStart, breakEnd);
  }, [breakEnabled, breakStart, breakEnd, syncBreakToConstraints]);

  const handleBreakStart = useCallback(
    (val) => {
      setBreakStart(val);
      syncBreakToConstraints(breakEnabled, val, breakEnd);
    },
    [breakEnabled, breakEnd, syncBreakToConstraints]
  );

  const handleBreakEnd = useCallback(
    (val) => {
      setBreakEnd(val);
      syncBreakToConstraints(breakEnabled, breakStart, val);
    },
    [breakEnabled, breakStart, syncBreakToConstraints]
  );

  // ── Presets ──────────────────────────────────────────────
  const applyPreset = useCallback(
    (preset) => {
      setSelectedPreset(preset);
      if (preset === "standard") {
        onChange({
          ...availability,
          dayStart: "09:00",
          dayEnd: "17:00",
          workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          slotDuration: 60,
        });
      } else if (preset === "morning") {
        onChange({
          ...availability,
          dayStart: "08:00",
          dayEnd: "14:00",
          workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          slotDuration: 60,
        });
      }
    },
    [availability, onChange]
  );

  // ── Quick-day actions ────────────────────────────────────
  const setDays = useCallback(
    (days) => update("workingDays", days),
    [update]
  );

  // ── Computed ─────────────────────────────────────────────
  const errors = useMemo(
    () => validate(availability, breakEnabled, breakStart, breakEnd),
    [availability, breakEnabled, breakStart, breakEnd]
  );

  const previewSlots = useMemo(
    () =>
      buildSlots(
        availability.dayStart,
        availability.dayEnd,
        availability.slotDuration,
        breakEnabled,
        breakStart,
        breakEnd
      ),
    [availability.dayStart, availability.dayEnd, availability.slotDuration, breakEnabled, breakStart, breakEnd]
  );

  const { perDay, perWeek } = useMemo(
    () =>
      countClassSlots(
        availability.dayStart,
        availability.dayEnd,
        availability.slotDuration,
        breakEnabled,
        breakStart,
        breakEnd,
        availability.workingDays?.length || 0
      ),
    [availability.dayStart, availability.dayEnd, availability.slotDuration, breakEnabled, breakStart, breakEnd, availability.workingDays]
  );

  const previewDaySlots = useMemo(() => previewSlots, [previewSlots]);

  const daysLabel = useMemo(() => {
    const d = availability.workingDays || [];
    if (d.length === 0) return "No days selected";
    if (d.length === 7) return "Every day";
    if (
      d.length === 5 &&
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].every((x) => d.includes(x))
    )
      return "Monday – Friday";
    if (
      d.length === 6 &&
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].every((x) => d.includes(x))
    )
      return "Monday – Saturday";
    return d.join(", ");
  }, [availability.workingDays]);

  const validPreviewDay = useMemo(() => {
    if (availability.workingDays?.includes(previewDay)) return previewDay;
    return availability.workingDays?.[0] || "Monday";
  }, [previewDay, availability.workingDays]);

  return (
    <section className="setup-step step-7">
      <SetupStepIllustrations step={7} />
      <SetupStepHeader
        icon="&#128336;"
        title="Availability"
        description="Set when classes can be scheduled across your institution."
      />

      {/* ── Status indicator ─────────────────────────────── */}
      {errors.length === 0 ? (
        <div className="avail-status avail-status--ok">
          <span className="avail-status-dot avail-status-dot--ok" />
          Configuration looks good
        </div>
      ) : (
        <div className="avail-status avail-status--warn">
          <span className="avail-status-dot avail-status-dot--warn" />
          {errors.length} item{errors.length !== 1 ? "s" : ""} need{errors.length === 1 ? "s" : ""} attention
        </div>
      )}

      {/* ── Presets ──────────────────────────────────────── */}
      <div className="nested-section">
        <div className="nested-header">
          <div>
            <h4>How does your college operate?</h4>
            <p>Choose a starting schedule. You can customize it below.</p>
          </div>
        </div>

        <div className="avail-presets">
          <button
            type="button"
            className={`avail-preset-card ${selectedPreset === "standard" ? "avail-preset-card--active" : ""}`}
            onClick={() => applyPreset("standard")}
          >
            <strong>Standard College</strong>
            <span>Mon – Fri &bull; 09:00 – 17:00 &bull; 60 min</span>
          </button>

          <button
            type="button"
            className={`avail-preset-card ${selectedPreset === "morning" ? "avail-preset-card--active" : ""}`}
            onClick={() => applyPreset("morning")}
          >
            <strong>Morning Shift</strong>
            <span>Mon – Sat &bull; 08:00 – 14:00 &bull; 60 min</span>
          </button>

          <button
            type="button"
            className={`avail-preset-card ${selectedPreset === "custom" ? "avail-preset-card--active" : ""}`}
            onClick={() => setSelectedPreset("custom")}
          >
            <strong>Custom</strong>
            <span>Configure manually</span>
          </button>
        </div>
      </div>

      {/* ── Main two-column layout ───────────────────────── */}
      <div className="avail-columns">
        {/* ── LEFT COLUMN ─────────────────────────────────── */}
        <div className="avail-col-left">

          {/* Working Hours */}
          <div className="nested-section">
            <div className="nested-header">
              <div>
                <h4>Working Hours</h4>
                <p>Set the daily time window in which classes can be scheduled.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="avail-start">Start</label>
                <input
                  id="avail-start"
                  type="time"
                  value={availability.dayStart}
                  onChange={(e) => update("dayStart", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="avail-end">End</label>
                <input
                  id="avail-end"
                  type="time"
                  value={availability.dayEnd}
                  onChange={(e) => update("dayEnd", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Working Days */}
          <div className="nested-section">
            <div className="nested-header">
              <div>
                <h4>Working Days</h4>
                <p>Choose the days when your institution operates.</p>
              </div>
            </div>

            <div className="avail-day-quick-actions">
              <button
                type="button"
                className="avail-day-btn"
                onClick={() => setDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])}
              >
                Weekdays
              </button>
              <button
                type="button"
                className="avail-day-btn"
                onClick={() =>
                  setDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])
                }
              >
                Mon – Sat
              </button>
              <button
                type="button"
                className="avail-day-btn"
                onClick={() => setDays([...DAYS])}
              >
                Select All
              </button>
              <button
                type="button"
                className="avail-day-btn"
                onClick={() => setDays([])}
              >
                Clear All
              </button>
            </div>

            <div className="section-options">
              {DAYS.map((day) => (
                <label className="section-option" key={day}>
                  <input
                    type="checkbox"
                    checked={(availability.workingDays || []).includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>

          {/* Class Schedule */}
          <div className="nested-section">
            <div className="nested-header">
              <div>
                <h4>Class Schedule</h4>
                <p>Choose how long each timetable class should be.</p>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="avail-duration">Class Slot Duration</label>
              <select
                id="avail-duration"
                value={availability.slotDuration}
                onChange={(e) => update("slotDuration", Number(e.target.value))}
              >
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={75}>75 Minutes</option>
                <option value={90}>90 Minutes</option>
                <option value={120}>120 Minutes</option>
              </select>
            </div>
          </div>

          {/* Break / Lunch */}
          <div className="nested-section">
            <div className="nested-header">
              <div>
                <h4>Break / Lunch</h4>
                <p>Optional time when classes should not be scheduled.</p>
              </div>
            </div>

            <label className="large-toggle">
              <input
                type="checkbox"
                checked={breakEnabled}
                onChange={handleBreakToggle}
              />
              <span>
                <strong>Enable lunch / break</strong>
                <small>
                  When enabled, this time window will be reserved and no classes will be placed during it.
                </small>
              </span>
            </label>

            {breakEnabled && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label htmlFor="avail-break-start">Break Start</label>
                  <input
                    id="avail-break-start"
                    type="time"
                    value={breakStart}
                    onChange={(e) => handleBreakStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="avail-break-end">Break End</label>
                  <input
                    id="avail-break-end"
                    type="time"
                    value={breakEnd}
                    onChange={(e) => handleBreakEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────── */}
        <div className="avail-col-right">

          {/* Schedule Summary */}
          <div className="avail-summary-card">
            <h4>Schedule Summary</h4>

            <div className="avail-summary-row">
              <span className="avail-summary-label">Working Days</span>
              <span className="avail-summary-value">{daysLabel}</span>
            </div>

            <div className="avail-summary-row">
              <span className="avail-summary-label">Working Hours</span>
              <span className="avail-summary-value">
                {availability.dayStart || "–"} – {availability.dayEnd || "–"}
              </span>
            </div>

            <div className="avail-summary-row">
              <span className="avail-summary-label">Class Duration</span>
              <span className="avail-summary-value">
                {durationLabel(availability.slotDuration)}
              </span>
            </div>

            <div className="avail-summary-row">
              <span className="avail-summary-label">Break</span>
              <span className="avail-summary-value">
                {breakEnabled ? `${breakStart} – ${breakEnd}` : "Not enabled"}
              </span>
            </div>

            <div className="avail-summary-row">
              <span className="avail-summary-label">Available Class Slots</span>
              <span className="avail-summary-value avail-summary-value--highlight">
                {perWeek} per week
              </span>
            </div>
          </div>

          {/* Slot Preview */}
          <div className="avail-preview-card">
            <div className="avail-preview-header">
              <h4>Timetable Slot Preview</h4>
              <select
                value={validPreviewDay}
                onChange={(e) => setPreviewDay(e.target.value)}
              >
                {(availability.workingDays || []).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {previewDaySlots.length === 0 ? (
              <div className="avail-empty">
                No slots available with current settings.
              </div>
            ) : (
              <div className="avail-slot-list">
                {previewDaySlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className={`avail-slot-row ${
                      slot.type === "class"
                        ? "avail-slot-row--class"
                        : slot.type === "break"
                        ? "avail-slot-row--break"
                        : "avail-slot-row--remaining"
                    }`}
                  >
                    <span className="avail-slot-time">
                      {formatHM(slot.start)} – {formatHM(slot.end)}
                    </span>
                    <span className="avail-slot-type">
                      {slot.type === "class"
                        ? "Class Slot"
                        : slot.type === "break"
                        ? "Break"
                        : "Remaining"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="avail-preview-note">
              This is a preview only. No classes are being created.
            </p>
          </div>

          {/* Faculty Availability */}
          <div className="nested-section">
            <div className="nested-header">
              <div>
                <h4>Faculty Availability</h4>
                <p>
                  Faculty availability can override the general university schedule.
                </p>
              </div>
            </div>

            {constraints && Object.keys(constraints).length > 0 && (
              <div className="setup-info compact">
                <span>&#10003;</span>
                <div>
                  <strong>Scheduler will respect</strong>
                  <p>
                    Working days, university timings, faculty availability, room
                    availability and batch conflicts.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AvailabilitySetup;
