import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import "./Auth.css";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import { api, setAuth, clearAuth, getCurrentUser } from "../services/api";

function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [formMode, setFormMode] = useState(initialMode);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organization_name: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      let payload;
      if (formMode === "signup") {
        payload = {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          organization_name: form.organization_name.trim(),
        };
      } else {
        payload = {
          email: form.email.trim(),
          password: form.password,
        };
      }
      const result = await api[formMode](payload);
      setAuth(result.access_token, result.user);
      setMessage(`Welcome${formMode === "signup" ? `, ${result.user.name}` : " back"}! Redirecting...`);
      setTimeout(() => navigate("/setup", { replace: true }), 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setFormMode(nextMode);
    setError("");
    setMessage("");
  };

  return (
    <>
      <Navbar />
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h2>{formMode === "login" ? "Sign in to CampusFlow" : "Create your CampusFlow account"}</h2>
            <p>{formMode === "login" ? "Welcome back. Sign in to continue." : "Set up your university and start building conflict-free timetables."}</p>
          </div>

          <div className="auth-tabs">
            <button type="button" className={formMode === "login" ? "auth-tab active" : "auth-tab"} onClick={() => switchMode("login")}>Login</button>
            <button type="button" className={formMode === "signup" ? "auth-tab active" : "auth-tab"} onClick={() => switchMode("signup")}>Sign Up</button>
          </div>

          {getCurrentUser() && (
            <div className="auth-session-note">
              You're signed in as <strong>{getCurrentUser().name}</strong> ({getCurrentUser().email}).{" "}
              <button type="button" className="link-button" onClick={() => { clearAuth(); window.location.reload(); }}>Sign out</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {formMode === "signup" && (
              <>
                <label>
                  Your Name
                  <input type="text" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Dr. Ananya Rao" required />
                </label>
                <label>
                  University / College Name
                  <input type="text" value={form.organization_name} onChange={(event) => update("organization_name", event.target.value)} placeholder="e.g. Tech University" required />
                </label>
              </>
            )}
            <label>
              Email
              <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@university.edu" required />
            </label>
            <label>
              Password
              <input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="At least 8 characters" required minLength={8} />
            </label>

            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Please wait..." : formMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default Auth;
