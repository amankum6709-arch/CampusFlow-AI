// ============================================================
// Naam: University Setup
// Kya karta hai: 9-step setup wizard ko manage karta hai aur sabhi university data ko ek single saved structure mein rakhta hai.
// ============================================================

import { useEffect, useRef, useState } from "react";
import "./UniversitySetup.css";

import SetupMethodStep from "../components/UniversitySetup/SetupMethodStep";
import InstitutionSetup from "../components/UniversitySetup/InstitutionSetup";
import CampusSetup from "../components/UniversitySetup/CampusSetup";
import RoomSetup from "../components/UniversitySetup/RoomSetup";
import CoursesSetup from "../components/UniversitySetup/CoursesSetup";
import SubjectsSetup from "../components/UniversitySetup/SubjectsSetup";
import FacultySetup from "../components/UniversitySetup/FacultySetup";
import AvailabilitySetup from "../components/UniversitySetup/AvailabilitySetup";
import ConstraintsSetup from "../components/UniversitySetup/ConstraintsSetup";
import ReviewGenerate from "../components/UniversitySetup/ReviewGenerate";

import { createInitialSetup } from "../utils/setupDefaults";
import {
  validateAvailability,
  validateCampuses,
  validateCourses,
  validateFaculty,
  validateInstitution,
  validateRooms,
  validateSubjects,
} from "../utils/validators";
import { loadSetup, saveSetup } from "../services/storage";
import { loadBackendSetup, saveSetupToBackend } from "../services/backendSync";
import { isAuthenticated } from "../services/api";
import { mergeImportedSetup } from "../utils/setupExcelImport";

const STEPS = [
  "Get Started",
  "Institution",
  "Campus & Buildings",
  "Rooms",
  "Courses & Batches",
  "Subjects",
  "Faculty",
  "Availability",
  "Constraints",
  "Review & Generate",
];

function UniversitySetup() {
  // Naam: setup
  // Kya karta hai: Institution se lekar timetable tak ka complete data ek central state mein rakhta hai.
  const [setup, setSetup] = useState(createInitialSetup);

  // Naam: currentStep
  // Kya karta hai: Wizard mein currently kaunsa step open hai, woh control karta hai.
  const [currentStep, setCurrentStep] = useState(0);

  // Naam: isLoaded
  // Kya karta hai: Saved browser data load hone tak UI ko stable rakhta hai.
  const [isLoaded, setIsLoaded] = useState(false);

  const setupRef = useRef(setup);
  useEffect(() => { setupRef.current = setup; }, [setup]);

  useEffect(() => {
    let cancelled = false;

    const getOrgId = () => {
      try {
        const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
        return user?.organization_id || localStorage.getItem("campusflow.organizationId") || "";
      } catch {
        return localStorage.getItem("campusflow.organizationId") || "";
      }
    };

    const applySetup = (savedSetup) => {
      if (cancelled) return;
      setSetup((previous) => ({
        ...previous,
        ...savedSetup,
        institution: {
          ...previous.institution,
          ...(savedSetup.institution || {}),
        },
        availability: {
          ...previous.availability,
          ...(savedSetup.availability || {}),
        },
        constraints: {
          ...previous.constraints,
          ...(savedSetup.constraints || {}),
        },
        campuses: (savedSetup.campuses || previous.campuses || []),
        faculty: (savedSetup.faculty || previous.faculty || []),
        rooms: (savedSetup.rooms || previous.rooms || []),
        courses: (savedSetup.courses || previous.courses || []),
        subjects: (savedSetup.subjects || previous.subjects || []),
        timetable: savedSetup.timetable ?? (savedSetup.timetable || previous.timetable),
      }));
    };

    // Prefer backend resources so the wizard reflects the real database data.
    if (isAuthenticated()) {
      const orgId = getOrgId();
      loadBackendSetup()
        .then((backendSetup) => {
          if (cancelled) return;
          if (backendSetup) {
            applySetup(backendSetup);
            // Persist to org-specific localStorage so refresh works offline
            saveSetup({ ...backendSetup }, orgId);
          } else {
            // Backend returned null (no org ID or no response).
            // Only use localStorage for the SAME organization.
            const saved = loadSetup(orgId);
            if (saved) applySetup(saved);
          }
          setIsLoaded(true);
        })
        .catch(() => {
          // On network error, fall back to org-specific localStorage only
          const saved = loadSetup(orgId);
          if (saved) applySetup(saved);
          setIsLoaded(true);
        });
    } else {
      // Not authenticated: start with clean initial setup (already set as default state).
      setIsLoaded(true);
    }

    return () => { cancelled = true; };
  }, []);

  // Naam: updateSetup
  // Kya karta hai: Central setup object ke kisi ek section ko update karta hai.
  const updateSetup = (key, value) => {
    setSetup((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  // Naam: updateInstitution
  // Kya karta hai: Institution form ke individual fields update karta hai.
  const updateInstitution = (key, value) => {
    updateSetup("institution", {
      ...setup.institution,
      [key]: value,
    });
  };

  // Naam: updateCampusMode
  // Kya karta hai: Single/multiple campus selection ko update karta hai aur single mode mein extra campuses remove karta hai.
  const updateCampusMode = (mode) => {
    setSetup((previous) => ({
      ...previous,
      campusMode: mode,
      campuses:
        mode === "single" ? previous.campuses.slice(0, 1) : previous.campuses,
    }));
  };

  // Naam: saveCurrentSetup
  // Kya karta hai: Complete setup ko browser localStorage aur backend mein save karta hai.
  const saveCurrentSetup = (showMessage = true, roomsOverride = null, coursesOverride = null) => {
    let orgId;
    try {
      const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
      orgId = user?.organization_id || localStorage.getItem("campusflow.organizationId") || "";
    } catch {
      orgId = localStorage.getItem("campusflow.organizationId") || "";
    }
    let latestSetup = setupRef.current;
    if (roomsOverride) {
      latestSetup = { ...latestSetup, rooms: roomsOverride };
    }
    if (coursesOverride) {
      latestSetup = { ...latestSetup, courses: coursesOverride };
    }
    saveSetup(latestSetup, orgId);

    // When signed in, also persist the wizard data to the backend so the
    // generated timetable and the database stay consistent with what the user
    // configured in this wizard.
    if (isAuthenticated()) {
      saveSetupToBackend(latestSetup).catch((err) => console.error("Backend sync failed:", err));
    }

    if (showMessage) {
      alert("CampusFlow setup progress has been saved.");
    }
  };

  // Naam: validateCurrentStep
  // Kya karta hai: Next step par jaane se pehle current step ka minimum required data check karta hai.
  const validateCurrentStep = () => {
    if (currentStep === 0) {
      return "";
    }

    if (currentStep === 1) {
      return validateInstitution(setup.institution);
    }

    if (currentStep === 2) {
      return validateCampuses(setup.campuses);
    }

    if (currentStep === 3) {
      return validateRooms(setup.rooms);
    }

    if (currentStep === 4) {
      return validateCourses(setup.courses);
    }

    if (currentStep === 5) {
      return validateSubjects(setup.subjects, setup.availability);
    }

    if (currentStep === 6) {
      return validateFaculty(setup.faculty, setup.constraints);
    }

    if (currentStep === 7) {
      return validateAvailability(setup.availability, setup.constraints);
    }

    return "";
  };

  // Naam: nextStep
  // Kya karta hai: Validation pass hone par next setup step open karta hai.
  const nextStep = () => {
    const error = validateCurrentStep();

    if (error) {
      alert(error);
      return;
    }

    saveCurrentSetup(false);

    setCurrentStep((previous) =>
      Math.min(previous + 1, STEPS.length),
    );
  };

  // Naam: previousStep
  // Kya karta hai: Admin ko previous setup step par wapas le jata hai.
  const previousStep = () => {
    setCurrentStep((previous) => Math.max(previous - 1, 0));
  };

  // Naam: handleTimetableGenerated
  // Kya karta hai: Generated timetable ko central setup data mein save karta hai.
  const handleTimetableGenerated = (timetable) => {
    setSetup((previous) => ({
      ...previous,
      timetable,
    }));
  };

  // Naam: handleExcelImportComplete
  // Kya karta hai: Excel import ke baad setup data ko merge karta hai aur Review step par le jata hai.
  const handleExcelImportComplete = (importedData) => {
    const merged = mergeImportedSetup(importedData, setup);
    setSetup(merged);
    setCurrentStep(STEPS.length - 1);
  };

  if (!isLoaded) {
    return (
      <div className="university-setup-loading">
        <div>
          <span>⚙️</span>
          <strong>Loading CampusFlow setup...</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="university-setup">
      {/* Naam: Page Header
          Kya karta hai: Product name, page title aur current step count dikhata hai. */}
      <header className="setup-header">
        <div>
          <span className="setup-badge">CampusFlow AI</span>

          <h1>University Setup</h1>

          <p>
            Save the complete university data first, then generate a conflict-aware timetable from the saved data.
          </p>
        </div>

        <div className="step-counter">
          {currentStep === 0 ? "Get Started" : `Step ${currentStep} of ${STEPS.length - 1}`}
        </div>
        <span className="setup-doodle" aria-hidden="true">Small steps, big schedules!</span>
      </header>

      {/* Naam: Setup Progress
          Kya karta hai: Admin ko 9-step setup ki current position aur completion status dikhata hai. */}
      <nav className="setup-progress" aria-label="Setup progress">
        {STEPS.slice(1).map((step, index) => {
          const stepNumber = index + 1;

          return (
            <button
              type="button"
              key={step}
              className={`progress-step ${
                currentStep === stepNumber ? "active" : ""
              } ${currentStep > stepNumber ? "completed" : ""}`}
              onClick={() => {
                if (stepNumber <= currentStep) {
                  setCurrentStep(stepNumber);
                }
              }}
            >
              <span className="progress-number">
                {currentStep > stepNumber ? "✓" : stepNumber}
              </span>

              <span>{step}</span>
            </button>
          );
        })}
      </nav>

      {/* Naam: Main Setup Card
          Kya karta hai: Current step ka actual component render karta hai. */}
      <main className="setup-card">
        {currentStep === 0 && (
          <SetupMethodStep
            onManualSetup={() => setCurrentStep(1)}
            onExcelImport={handleExcelImportComplete}
          />
        )}

        {currentStep === 1 && (
          <InstitutionSetup
            institution={setup.institution}
            onChange={updateInstitution}
          />
        )}

        {currentStep === 2 && (
          <CampusSetup
            mode={setup.campusMode}
            campuses={setup.campuses}
            onModeChange={updateCampusMode}
            onChange={(campuses) => updateSetup("campuses", campuses)}
          />
        )}

        {currentStep === 3 && (
          <RoomSetup
            campuses={setup.campuses}
            rooms={setup.rooms}
            onChange={(rooms) => updateSetup("rooms", rooms)}
            onPersist={(filteredRooms) => saveCurrentSetup(false, filteredRooms)}
          />
        )}

        {currentStep === 4 && (
          <CoursesSetup
            courses={setup.courses}
            campuses={setup.campuses}
            rooms={setup.rooms}
            onChange={(courses) => updateSetup("courses", courses)}
            onPersist={(courses) => saveCurrentSetup(false, null, courses)}
          />
        )}

        {currentStep === 5 && (
          <SubjectsSetup
            subjects={setup.subjects}
            courses={setup.courses}
            onChange={(subjects) => updateSetup("subjects", subjects)}
          />
        )}

        {currentStep === 6 && (
          <FacultySetup
            faculty={setup.faculty}
            subjects={setup.subjects}
            courses={setup.courses}
            timetable={setup.timetable}
            constraints={setup.constraints}
            onChange={(faculty) => updateSetup("faculty", faculty)}
            onSubjectsChange={(subjects) => updateSetup("subjects", subjects)}
          />
        )}

        {currentStep === 7 && (
          <AvailabilitySetup
            availability={setup.availability}
            onChange={(availability) =>
              updateSetup("availability", availability)
            }
            constraints={setup.constraints}
            onConstraintsChange={(constraints) =>
              setSetup((previous) => ({
                ...previous,
                constraints,
              }))
            }
          />
        )}

        {currentStep === 8 && (
          <ConstraintsSetup
            constraints={setup.constraints}
            onChange={(constraints) => {
              setSetup((previous) => ({
                ...previous,
                constraints,
              }));
            }}
          />
        )}

        {currentStep === 9 && (
          <ReviewGenerate
            setup={setup}
            onTimetableGenerated={handleTimetableGenerated}
            onImportComplete={(importedSetup) => {
              setSetup((prev) => ({
                ...prev,
                ...importedSetup,
                institution: prev.institution,
                availability: prev.availability,
                constraints: prev.constraints,
              }));
            }}
          />
        )}

        {/* Naam: Setup Footer
            Kya karta hai: Back, Save Progress aur Next/Generate navigation provide karta hai. */}
        {currentStep > 0 && (
        <footer className="setup-footer">
          <button
            type="button"
            className="back-button"
            onClick={previousStep}
            disabled={currentStep === 1}
          >
            ← Back
          </button>

          <div className="footer-right">
            <button
              type="button"
              className="save-button"
              onClick={() => saveCurrentSetup(true)}
            >
              Save Progress
            </button>

            {currentStep < STEPS.length && (
              <button
                type="button"
                className="continue-button"
                onClick={nextStep}
              >
                Save & Continue →
              </button>
            )}
          </div>
        </footer>
        )}
      </main>
    </div>
  );
}

export default UniversitySetup;
