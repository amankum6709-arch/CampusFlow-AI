import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { FiMenu, FiX, FiLogOut, FiUser, FiSearch, FiChevronDown } from "react-icons/fi";
import "./Navbar.css";
import { isAuthenticated, clearAuth, getCurrentUser } from "../../services/api";

function Navbar() {
  const loggedIn = isAuthenticated();
  const user = getCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = () => {
    clearAuth();
    navigate("/", { replace: true });
    setMobileOpen(false);
  };

  const isActive = (path) => location.pathname === path;
  const handleNavClick = () => setMobileOpen(false);

  const scrollTo = (id) => {
    handleNavClick();
    if (location.pathname !== "/") {
      window.location.href = `/#${id}`;
      return;
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="landing-nav-wrap">
      <nav className={`navbar navbar--landing ${mobileOpen ? "navbar--open" : ""}`} aria-label="Primary">
        <Link to="/" className="logo" style={{ textDecoration: "none" }} onClick={handleNavClick} aria-label="CampusFlow home">
          <span className="logo-cap" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 4 2.5 9.5 14 15l11.5-5.5L14 4Z" fill="#1769F5" />
              <path d="M7 12.6V18c0 1.5 3.1 3.2 7 3.2s7-1.7 7-3.2v-5.4l-7 3.4-7-3.4Z" fill="#101B45" />
              <path d="M22.5 11v6.2" stroke="#101B45" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="22.5" cy="18.6" r="1.6" fill="#FFD24A" />
            </svg>
          </span>
          <h2 className="logo-text">Campus<span className="logo-accent">Flow</span></h2>
        </Link>

        <button
          className="navbar-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <FiX size={22} /> : <FiMenu size={22} />}
        </button>

        <div className={`navbar-menu ${mobileOpen ? "navbar-menu--open" : ""}`}>
          <ul className="nav-links">
            <li>
              <Link
                to="/"
                className={`nav-link ${isActive("/") ? "nav-link--active" : ""}`}
                onClick={handleNavClick}
              >
                Home
              </Link>
            </li>
            <li>
              <button type="button" className="nav-link nav-link--btn" onClick={() => scrollTo("features")}>
                Features
              </button>
            </li>
            <li>
              <button type="button" className="nav-link nav-link--btn" onClick={() => scrollTo("how-it-works")}>
                Solutions
              </button>
            </li>
            <li>
              <button type="button" className="nav-link nav-link--btn" onClick={() => scrollTo("pricing")}>
                Pricing
              </button>
            </li>
            <li>
              <button type="button" className="nav-link nav-link--btn" onClick={() => scrollTo("about")}>
                Resources <FiChevronDown size={13} aria-hidden="true" />
              </button>
            </li>
            {loggedIn && (
              <>
                <li>
                  <Link
                    to="/dashboard"
                    className={`nav-link ${isActive("/dashboard") ? "nav-link--active" : ""}`}
                    onClick={handleNavClick}
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/setup"
                    className={`nav-link ${isActive("/setup") ? "nav-link--active" : ""}`}
                    onClick={handleNavClick}
                  >
                    Setup
                  </Link>
                </li>
                <li>
                  <Link
                    to="/timetable"
                    className={`nav-link ${isActive("/timetable") ? "nav-link--active" : ""}`}
                    onClick={handleNavClick}
                  >
                    Timetable
                  </Link>
                </li>
              </>
            )}
          </ul>

          <div className="nav-buttons">
            <button
              type="button"
              className="nav-search-btn"
              aria-label="Search"
              title="Search"
              onClick={() => { navigate("/dashboard"); handleNavClick(); }}
            >
              <FiSearch size={17} />
            </button>
            {loggedIn ? (
              <>
                {user && (
                  <div className="nav-user">
                    <div className="nav-user-avatar">
                      <FiUser size={14} />
                    </div>
                    <span className="nav-user-name">{user.name}</span>
                  </div>
                )}
                <button className="nav-logout-btn" onClick={logout}>
                  <FiLogOut size={15} />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <button className="nav-login-btn" onClick={() => { navigate("/auth?mode=login"); handleNavClick(); }}>
                  Sign In
                </button>
                <button className="nav-register-btn" onClick={() => { navigate("/auth?mode=signup"); handleNavClick(); }}>
                  Get Started <span aria-hidden="true">→</span>
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default Navbar;
