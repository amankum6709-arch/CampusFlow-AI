// ============================================================
// Naam: Institution Setup
// Kya karta hai: Admin se institution details aur academic year planning data leta hai.
// ============================================================

import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import { formatAcademicYear } from "../../utils/helpers";

function InstitutionSetup({ institution, onChange }) {
  const currentYear = new Date().getFullYear();
  const selectedYear = Number(institution.academicYearStart);
  const academicYears = Array.from({ length: 10 }, (_, index) => currentYear + index);

  return (
    <section className="setup-step step-1">
      <SetupStepIllustrations step={1} />
      <SetupStepHeader
        icon="🏛️"
        title="Institution Information"
        description="Enter the institution details and choose the academic year for the timetable."
      />

      <div className="form-grid">
        <div className="form-group full-width">
          <label htmlFor="institution-name">Institution Name</label>
          <input
            id="institution-name"
            type="text"
            value={institution.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="e.g. Chandigarh University"
          />
        </div>

        <div className="form-group">
          <label htmlFor="institution-type">Institution Type</label>
          <select
            id="institution-type"
            value={institution.type}
            onChange={(event) => onChange("type", event.target.value)}
          >
            <option value="">Select institution type</option>
            <option value="University">University</option>
            <option value="College">College</option>
            <option value="Institute">Institute</option>
            <option value="School">School</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="academic-year">Academic Year</label>
          <select
            id="academic-year"
            value={selectedYear}
            onChange={(event) => onChange("academicYearStart", Number(event.target.value))}
          >
            {academicYears.map((year) => (
              <option key={year} value={year}>
                {formatAcademicYear(year)}
              </option>
            ))}
          </select>

          {selectedYear > currentYear && (
            <p className="field-warning">
              ⚠️ You selected a future academic year: {formatAcademicYear(selectedYear)}.
            </p>
          )}

          {selectedYear === currentYear && (
            <p className="field-success">
              ✓ Current academic year: {formatAcademicYear(selectedYear)}.
            </p>
          )}
        </div>
      </div>

      <div className="setup-info">
        <span>💡</span>
        <div>
          <strong>Academic year rule</strong>
          <p>
            The current academic year and future academic years are available for planning.
            Past academic years are not offered for creating a new timetable.
          </p>
        </div>
      </div>
    </section>
  );
}

export default InstitutionSetup;
