// ============================================================
// Naam: Review & Generate
// Kya karta hai: Final pre-flight check before timetable generation.
// Shows setup summary, readiness status, generation options,
// and handles the complete generation flow with auto-navigation.
// ============================================================

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import UpgradePrompt from "../UpgradePrompt/UpgradePrompt";
import { buildSchedulerConfiguration, ensureOrganization } from "../../services/serverScheduling";
import { saveSetupToBackend } from "../../services/backendSync";
import { remapSchedulerConfiguration } from "../../services/idMapping";
import { api, isAuthenticated } from "../../services/api";
import { downloadSetupTemplate } from "../../utils/setupExcelExport";
import { importSetupFile, validateImportedSetup } from "../../utils/setupExcelImport";
import { hasFeature, FEATURES } from "../../utils/subscription";

// ── Readiness check items ────────────────────────────────────
function computeReadiness(setup) {
  const items = [];

  const institutionOk = Boolean(setup.institution?.name?.trim());
  items.push({
    label: "Institution",
    ok: institutionOk,
    message: institutionOk ? "Configured" : "Institution name is missing.",
    step: 1,
  });

  const campusesOk = setup.campuses?.length > 0;
  items.push({
    label: "Campuses",
    ok: campusesOk,
    message: campusesOk ? `${setup.campuses.length} configured` : "At least one campus is required.",
    step: 2,
  });

  const roomsOk = setup.rooms?.length > 0;
  items.push({
    label: "Rooms",
    ok: roomsOk,
    message: roomsOk ? `${setup.rooms.length} available` : "At least one room is required.",
    step: 3,
  });

  const coursesOk = setup.courses?.length > 0;
  items.push({
    label: "Courses",
    ok: coursesOk,
    message: coursesOk ? `${setup.courses.length} configured` : "At least one course is required.",
    step: 4,
  });

  const batchesOk = setup.courses?.some((c) => c.batches?.length > 0);
  items.push({
    label: "Batches",
    ok: batchesOk,
    message: batchesOk
      ? `${setup.courses.reduce((t, c) => t + c.batches.length, 0)} configured`
      : "At least one batch is required.",
    step: 4,
  });

  const subjectsOk = setup.subjects?.length > 0;
  items.push({
    label: "Subjects",
    ok: subjectsOk,
    message: subjectsOk ? `${setup.subjects.length} configured` : "At least one subject is required.",
    step: 5,
  });

  const facultyOk = setup.faculty?.length > 0;
  items.push({
    label: "Faculty",
    ok: facultyOk,
    message: facultyOk ? `${setup.faculty.length} members` : "At least one faculty member is required.",
    step: 6,
  });

  const daysOk = setup.availability?.workingDays?.length > 0;
  const hoursOk = setup.availability?.dayStart && setup.availability?.dayEnd;
  const availOk = daysOk && hoursOk;
  items.push({
    label: "Availability",
    ok: availOk,
    message: availOk
      ? `${setup.availability.workingDays.length} days, ${setup.availability.dayStart}–${setup.availability.dayEnd}`
      : "Working days and hours must be configured.",
    step: 7,
  });

  items.push({
    label: "Constraints",
    ok: true,
    message: "Configured",
    step: 8,
  });

  return items;
}

// ── Component ────────────────────────────────────────────────
function ReviewGenerate({ setup, onTimetableGenerated, onImportComplete, onGoToStep }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("all");
  const [selectedCourseIds, setSelectedCourseIds] = useState(
    setup.courses.map((course) => course.id),
  );
  const [selectedSemesters, setSelectedSemesters] = useState([]);
  const [genState, setGenState] = useState("idle");
  const [serverRunId, setServerRunId] = useState("");
  const [serverStatus, setServerStatus] = useState("");
  const [serverError, setServerError] = useState("");
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState(null);

  const isGenerating = genState === "saving" || genState === "generating";

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(
    () => [
      ["Campuses", setup.campuses.length],
      [
        "Buildings",
        setup.campuses.reduce((t, c) => t + c.buildings.length, 0),
      ],
      ["Rooms", setup.rooms.length],
      ["Courses", setup.courses.length],
      [
        "Batches",
        setup.courses.reduce((t, c) => t + c.batches.length, 0),
      ],
      ["Subjects", setup.subjects.length],
      ["Faculty", setup.faculty.length],
    ],
    [setup],
  );

  // ── Readiness ──────────────────────────────────────────────
  const readiness = useMemo(() => computeReadiness(setup), [setup]);
  const allReady = readiness.every((item) => item.ok);
  const failedItems = readiness.filter((item) => !item.ok);

  // ── Helpers ────────────────────────────────────────────────
  const toggleCourse = (courseId) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const toggleSemester = (semester) => {
    setSelectedSemesters((prev) =>
      prev.includes(semester)
        ? prev.filter((s) => s !== semester)
        : [...prev, semester],
    );
  };

  const getSelectedSubjectIds = () => {
    if (mode !== "selected") return null;
    return setup.subjects
      .filter((subject) => {
        const courseSelected = selectedCourseIds.includes(subject.courseId);
        const course = setup.courses.find((c) => c.id === subject.courseId);
        const assignedBatches = (course?.batches || []).filter((b) =>
          (subject.batchIds || []).includes(b.id),
        );
        const semesterSelected =
          !selectedSemesters.length ||
          assignedBatches.some((b) =>
            selectedSemesters.includes(Number(b.currentSemester || 1)),
          );
        return courseSelected && semesterSelected;
      })
      .map((s) => s.id);
  };

  // ── Excel import ───────────────────────────────────────────
  const processImportFile = async (file) => {
    if (importing) return;
    setImporting(true);
    setImportStatus({ type: "loading", message: "Importing setup data..." });
    try {
      const importedData = await importSetupFile(file);
      const validation = validateImportedSetup(importedData, setup);
      const importErrors = [...(importedData.errors || []), ...validation.errors];
      if (importErrors.length > 0) {
        setImportStatus({
          type: "error",
          message: `Import errors: ${importErrors.join("; ")}`,
        });
        return;
      }
      setImportStatus({
        type: "success",
        message: "Setup data imported successfully!",
      });
      if (onImportComplete) onImportComplete(importedData);
    } catch (err) {
      setImportStatus({ type: "error", message: `Import failed: ${err.message}` });
    } finally {
      setImporting(false);
    }
  };

  const handleImportDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) processImportFile(file);
  };

  const handleImportFile = (e) => {
    const file = e.target?.files?.[0];
    if (file) processImportFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportClick = () => {
    if (!hasFeature(FEATURES.EXCEL_IMPORT)) {
      setUpgradeFeature(FEATURES.EXCEL_IMPORT);
      return;
    }
    fileInputRef.current?.click();
  };

  // ── Generation ─────────────────────────────────────────────
  const handleGenerate = async () => {
    if (isGenerating) return;

    // Clear previous state
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setServerError("");
    setServerRunId("");
    setServerStatus("");

    if (isAuthenticated()) {
      await generateOnServer();
    } else {
      await generateClientSide();
    }
  };

  const generateOnServer = async () => {
    setGenState("saving");
    setServerStatus("Saving setup data to database...");
    try {
      const organizationId = await ensureOrganization(setup);
      const syncResult = await saveSetupToBackend(setup);
      if (syncResult?.status !== "ok" || !syncResult.id_map) {
        throw new Error("Could not synchronize setup with the database. Please save again and retry.");
      }

      setGenState("generating");
      setServerStatus("Submitting to scheduler...");

      const selectedIds = getSelectedSubjectIds();
      const configuration = remapSchedulerConfiguration(
        buildSchedulerConfiguration(setup, selectedIds),
        syncResult.id_map,
      );

      const run = await api.generateTimetable({
        organization_id: organizationId,
        configuration,
      });
      setServerRunId(run.id);
      setServerStatus("Scheduler is optimizing...");

      // 120-second timeout
      let timedOut = false;
      timeoutRef.current = setTimeout(() => {
        timedOut = true;
        setGenState("failed");
        setServerError(
          "Generation timed out after 120 seconds. The constraint set may be too tight.",
        );
        setServerStatus("");
      }, 120000);

      const poll = async () => {
        if (timedOut) return;
        try {
          const latest = await api.getRun(run.id);
          if (latest.status === "COMPLETED") {
            clearTimeout(timeoutRef.current);
            setGenState("success");
            setServerStatus("Timetable generated! Opening your timetable...");
            setTimeout(() => navigate(`/timetable?run=${run.id}`), 1200);
            return;
          }
          if (latest.status === "FAILED") {
            clearTimeout(timeoutRef.current);
            setGenState("failed");
            setServerError(
              latest.error ||
                "The scheduler could not find a feasible timetable with the current constraints.",
            );
            setServerStatus("");
            return;
          }
          setServerStatus(`Scheduler status: ${latest.status}...`);
          window.setTimeout(poll, 1500);
        } catch {
          clearTimeout(timeoutRef.current);
          setGenState("failed");
          setServerError("Failed to check generation status. Please try again.");
          setServerStatus("");
        }
      };
      await poll();
    } catch (error) {
      clearTimeout(timeoutRef.current);
      setGenState("failed");
      let msg = error.message || "Server generation failed.";
      if (msg.includes("Cannot reach the server"))
        msg = "Cannot reach the server. Check your connection and try again.";
      else if (msg.includes("Organization not found"))
        msg = "Organization not found. Save your setup and try again.";
      else if (msg.includes("401") || msg.includes("403"))
        msg = "Authentication error. Please sign in again.";
      setServerError(msg);
      setServerStatus("");
    }
  };

  const generateClientSide = async () => {
    setGenState("generating");
    try {
      let generationSetup = setup;
      const selectedIds = getSelectedSubjectIds();
      if (selectedIds) {
        generationSetup = {
          ...setup,
          subjects: setup.subjects.filter((s) => selectedIds.includes(s.id)),
        };
      }

      if (workerRef.current) workerRef.current.terminate();
      const worker = new Worker(
        new URL("../../workers/timetableWorker.js", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;

      timeoutRef.current = setTimeout(() => {
        worker.terminate();
        workerRef.current = null;
        setGenState("failed");
        setServerError("Client-side generation timed out after 120 seconds.");
      }, 120000);

      worker.onmessage = (event) => {
        clearTimeout(timeoutRef.current);
        const { type, generated, error } = event.data || {};
        if (type === "complete") {
          onTimetableGenerated(generated.timetable);
          setGenState("success");
        } else if (type === "error") {
          setGenState("failed");
          setServerError(error || "Client-side generation failed.");
        }
        worker.terminate();
        workerRef.current = null;
      };

      worker.onerror = (event) => {
        clearTimeout(timeoutRef.current);
        setGenState("failed");
        setServerError(event.error?.message || "Worker error.");
        worker.terminate();
        workerRef.current = null;
      };

      worker.postMessage({
        setup: generationSetup,
        options: { previousTimetable: [], attempts: 8 },
      });
    } catch (error) {
      clearTimeout(timeoutRef.current);
      setGenState("failed");
      setServerError(error.message || "Client-side generation failed.");
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <section className="setup-step step-9">
      <SetupStepIllustrations step={9} />
      <SetupStepHeader
        icon="🤖"
        title="Review & Generate"
        description="Review your setup, resolve any issues, and generate your timetable."
      />

      {/* ── Setup Summary ──────────────────────────────────── */}
      <div className="review-stat-grid">
        {stats.map(([label, value]) => (
          <div className="review-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {/* ── Readiness Check ────────────────────────────────── */}
      <div className="review-readiness">
        <div className="review-readiness-header">
          <h4>Generation Readiness</h4>
          {allReady ? (
            <span className="review-readiness-badge review-readiness-badge--ok">
              Ready
            </span>
          ) : (
            <span className="review-readiness-badge review-readiness-badge--warn">
              {failedItems.length} item{failedItems.length !== 1 ? "s" : ""} need
              attention
            </span>
          )}
        </div>

        <div className="review-readiness-list">
          {readiness.map((item) => (
            <div
              className={`review-readiness-item ${item.ok ? "review-readiness-item--ok" : "review-readiness-item--fail"}`}
              key={item.label}
            >
              <span className="review-readiness-check">{item.ok ? "✓" : "○"}</span>
              <span className="review-readiness-label">{item.label}</span>
              <span className="review-readiness-msg">{item.message}</span>
            </div>
          ))}
        </div>

        {!allReady && (
          <p className="review-readiness-help">
            Go back through the setup steps to fix the items marked above.
          </p>
        )}
      </div>

      {/* ── Generation Options ─────────────────────────────── */}
      <div className="generation-mode">
        <button
          type="button"
          className={`mode-button ${mode === "all" ? "active" : ""}`}
          onClick={() => setMode("all")}
        >
          <strong>Generate Complete Timetable</strong>
          <span>
            Use all configured courses, batches, subjects, faculty, rooms and
            availability.
          </span>
        </button>
        <button
          type="button"
          className={`mode-button ${mode === "selected" ? "active" : ""}`}
          onClick={() => setMode("selected")}
        >
          <strong>Generate Selected Timetable</strong>
          <span>Generate only the selected course(s) or semester(s).</span>
        </button>
      </div>

      {mode === "selected" && (
        <div className="selection-panel">
          <h3>Select Courses</h3>
          <div className="batch-check-list">
            {setup.courses.map((course) => (
              <label className="batch-check-card" key={course.id}>
                <input
                  type="checkbox"
                  checked={selectedCourseIds.includes(course.id)}
                  onChange={() => toggleCourse(course.id)}
                />
                <span>
                  <strong>{course.name || "Unnamed Course"}</strong>
                  <small>{course.batches.length} batch(es)</small>
                </span>
              </label>
            ))}
          </div>

          <h3>Optional Semester Filter</h3>
          <div className="section-options">
            {Array.from(
              {
                length: Math.max(
                  1,
                  ...setup.courses.map((c) => Number(c.totalSemesters || 1)),
                ),
              },
              (_, i) => i + 1,
            ).map((semester) => (
              <label className="section-option" key={semester}>
                <input
                  type="checkbox"
                  checked={selectedSemesters.includes(semester)}
                  onChange={() => toggleSemester(semester)}
                />
                Semester {semester}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Generate Button ────────────────────────────────── */}
      <button
        type="button"
        className="generate-button large-generate-button"
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating
          ? genState === "saving"
            ? "Saving setup..."
            : "Generating Timetable..."
          : "Generate Timetable →"}
      </button>

      {isAuthenticated() ? (
        <p className="review-gen-hint">
          Uses the CampusFlow backend scheduler with your saved data.
        </p>
      ) : (
        <p className="review-gen-hint">
          Running client-side. Sign in for persistent results.
        </p>
      )}

      {/* ── Loading State ──────────────────────────────────── */}
      {isGenerating && (
        <div className="gen-status gen-status--loading">
          <div className="gen-spinner" />
          <div>
            <strong>Generating your timetable...</strong>
            <p>
              Please wait while CampusFlow assigns classes respecting your
              configured rules.
            </p>
          </div>
        </div>
      )}

      {/* ── Status (non-generating) ────────────────────────── */}
      {serverRunId && serverStatus && !isGenerating && (
        <div
          className={`gen-status ${genState === "success" ? "gen-status--success" : ""}`}
        >
          <span>{serverStatus}</span>
          {genState !== "success" && (
            <span>
              {" "}
              ·{" "}
              <a href={`/timetable?run=${serverRunId}`}>Open workspace</a>
            </span>
          )}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────── */}
      {serverError && !isGenerating && (
        <div className="gen-error">
          <div className="gen-error-header">
            <span className="gen-error-icon">⚠</span>
            <strong>Timetable generation couldn't be completed</strong>
          </div>
          <p>{serverError}</p>
          <div className="gen-error-actions">
            <button
              type="button"
              className="generate-button"
              onClick={handleGenerate}
            >
              Try Again
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                const firstFail = failedItems[0];
                if (firstFail && firstFail.step) {
                  onGoToStep?.(firstFail.step);
                }
              }}
            >
              Review Setup
            </button>
          </div>
        </div>
      )}

      {/* ── Excel Import ───────────────────────────────────── */}
      <div className="import-section import-panel">
        <div className="import-panel-head">
          <span className="import-panel-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
          </span>
          <div className="import-panel-titles">
            <h3>Import Setup Data from Excel</h3>
            <p>
              Download the template, complete your university data, and import
              it into CampusFlow.
            </p>
          </div>
          <span className="import-format-tag">.xlsx · .xls</span>
        </div>

        <div className="import-panel-grid">
          <div className="import-step-card">
            <div className="import-step-head">
              <span className="import-step-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </span>
              <div>
                <h4>1. Download Template</h4>
                <p>
                  Start with the CampusFlow Excel template to keep your data
                  correctly formatted.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="generate-button import-download-btn"
              onClick={() => downloadSetupTemplate()}
            >
              Download Excel Template
            </button>
          </div>

          <div className="import-step-card">
            <div className="import-step-head">
              <span className="import-step-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                </svg>
              </span>
              <div>
                <h4>2. Upload Your Completed File</h4>
                <p>
                  Drag and drop your Excel file here, or browse your device.
                </p>
              </div>
            </div>
            <div
              className="import-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleImportDrop}
            >
              <button
                type="button"
                className="secondary-action"
                onClick={handleImportClick}
              >
                Choose Excel File
              </button>
              <span className="import-formats">Supported formats: .xlsx, .xls</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
            </div>
          </div>
        </div>

        {importStatus && (
          <div className={`import-status ${importStatus.type}`}>
            {importStatus.message}
          </div>
        )}

        <p className="import-merge-note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Your existing setup data will be merged with the imported data.
          Review the information before continuing.
        </p>
      </div>

      {upgradeFeature && (
        <UpgradePrompt
          feature={upgradeFeature}
          onDismiss={() => setUpgradeFeature(null)}
        />
      )}
    </section>
  );
}

export default ReviewGenerate;
