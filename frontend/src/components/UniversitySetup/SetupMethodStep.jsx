// ============================================================
// Naam: Setup Method Step
// Kya karta hai: Wizard ke step 0 mein user ko Manual Setup ya Excel Import choose karne deta hai.
// ============================================================

import { useRef, useState } from "react";
import { downloadSetupTemplate } from "../../utils/setupExcelExport";
import { importSetupFile, validateImportedSetup, mergeImportedSetup } from "../../utils/setupExcelImport";
import SetupStepIllustrations from "./SetupStepIllustrations";
import "./SetupMethodStep.css";

function SetupMethodStep({ onManualSetup, onExcelImport }) {
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = async (e) => {
    e.stopPropagation();
    try {
      await downloadSetupTemplate();
    } catch (err) {
      setImportStatus({ type: "error", message: `Download failed: ${err.message}` });
    }
  };

  const processImportFile = async (file) => {
    if (importing) return;
    setImporting(true);
    setImportStatus({ type: "loading", message: "Importing setup data from file..." });
    try {
      const importedData = await importSetupFile(file);
      const validation = validateImportedSetup(importedData);
      if (validation.errors.length > 0) {
        setImportStatus({ type: "error", message: `Import errors: ${validation.errors.join("; ")}` });
        setImporting(false);
        return;
      }
      const stats = importedData.mergeStats || {
        roomsAdded: importedData.rooms?.length || 0,
        coursesAdded: importedData.courses?.length || 0,
        subjectsAdded: importedData.subjects?.length || 0,
        facultyAdded: importedData.faculty?.length || 0,
      };
      setImportStatus({
        type: "success",
        message: `Imported: ${stats.roomsAdded} rooms, ${stats.coursesAdded} courses, ${stats.subjectsAdded} subjects, ${stats.facultyAdded} faculty.`,
      });
      if (onExcelImport) onExcelImport(importedData);
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
    fileInputRef.current?.click();
  };

  return (
    <section className="setup-step step-0 setup-method-step">
      <SetupStepIllustrations step={0} />
      <div className="step-title">
        <div className="step-icon">🚀</div>
        <div>
          <h2>Get Started</h2>
          <p>Choose how you want to set up your university data. You can enter everything manually or import from an Excel file.</p>
        </div>
      </div>

      <div className="method-cards">
        <button
          type="button"
          className={`method-card ${selectedMethod === "manual" ? "active" : ""}`}
          onClick={() => { setSelectedMethod("manual"); onManualSetup(); }}
        >
          <div className="method-card-icon manual-icon">✏️</div>
          <div className="method-card-content">
            <h3>Manual Setup</h3>
            <p>Enter all university information step by step through the setup wizard.</p>
          </div>
          <div className="method-card-action">
            <span className="method-card-button">Start Manual Setup →</span>
          </div>
        </button>

        <button
          type="button"
          className={`method-card ${selectedMethod === "excel" ? "active" : ""}`}
          onClick={() => setSelectedMethod("excel")}
        >
          <div className="method-card-icon excel-icon">📊</div>
          <div className="method-card-content">
            <h3>Import from Excel</h3>
            <p>Download the official template, fill in your data, and import it to automatically populate all setup sections.</p>
            <div className="method-sub-steps">
              <div className="method-sub-step">
                <span className="sub-step-number">1</span>
                <span>Download Excel template</span>
              </div>
              <div className="method-sub-step">
                <span className="sub-step-number">2</span>
                <span>Fill in your university data</span>
              </div>
              <div className="method-sub-step">
                <span className="sub-step-number">3</span>
                <span>Upload completed file</span>
              </div>
              <div className="method-sub-step">
                <span className="sub-step-number">4</span>
                <span>Review imported data</span>
              </div>
            </div>
          </div>
          <div className="method-card-action">
            <span className="method-card-button">Download Template & Import</span>
          </div>
        </button>
      </div>

      {selectedMethod === "excel" && (
        <div className="excel-import-panel">
          <div className="excel-import-actions">
            <button type="button" className="excel-download-btn" onClick={handleDownloadTemplate}>
              📥 Download Excel Template
            </button>
            <div
              className="excel-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleImportDrop}
            >
              <div className="dropzone-content">
                <span className="dropzone-icon">📂</span>
                <p>Drag & drop your completed Excel file here, or</p>
                <button type="button" className="excel-browse-btn" onClick={handleImportClick}>
                  Browse Files
                </button>
                <span className="dropzone-hint">.xlsx, .xls, or .csv files supported</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
            </div>
          </div>
          {importStatus && (
            <div className={`import-status-banner ${importStatus.type}`}>
              <span className="import-status-icon">
                {importStatus.type === "loading" && "⏳"}
                {importStatus.type === "success" && "✅"}
                {importStatus.type === "error" && "❌"}
              </span>
              <span>{importStatus.message}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default SetupMethodStep;
