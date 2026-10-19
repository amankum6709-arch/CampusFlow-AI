import { FiGithub, FiTwitter, FiLinkedin } from "react-icons/fi";
import "./Footer.css";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="footer-logo">
            <div className="footer-logo-box">CF</div>
            <span>CampusFlow</span>
          </div>
          <p className="footer-tagline">
            Conflict-aware academic timetabling for modern universities.
          </p>
        </div>

        <div className="footer-links">
          <a href="/">Home</a>
          <a href="/auth?mode=signup">Get Started</a>
          <a href="/auth?mode=login">Login</a>
        </div>

        <div className="footer-social">
          <a href="#" aria-label="GitHub" className="footer-social-link">
            <FiGithub />
          </a>
          <a href="#" aria-label="Twitter" className="footer-social-link">
            <FiTwitter />
          </a>
          <a href="#" aria-label="LinkedIn" className="footer-social-link">
            <FiLinkedin />
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>&copy; {new Date().getFullYear()} CampusFlow AI. All rights reserved.</span>
      </div>
    </footer>
  );
}

export default Footer;
