import { NavLink } from 'react-router-dom';

export default function NavBar() {
  return (
    <header className="navbar">
      <nav className="navbar__links" aria-label="ניווט ראשי">
        <NavLink to="/" end className="navbar__link">
          דף הבית
        </NavLink>
        <NavLink to="/about" className="navbar__link">
          אודות
        </NavLink>
      </nav>
    </header>
  );
}
