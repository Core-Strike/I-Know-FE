import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
} from "react-router-dom";
import HomePage from "./pages/HomePage";
import StudentPage from "./pages/StudentPage";
import InstructorPage from "./pages/InstructorPage";
import DashboardPage from "./pages/DashboardPage";
import "./App.css";

function NavBar() {
  const { pathname } = useLocation();
  const hide = pathname === "/" || pathname.startsWith("/student");
  if (hide) return null;

  return (
    <nav className="nav-bar">
      <NavLink
        to="/instructor"
        className={({ isActive }) => (isActive ? "active" : "")}
      >
        강사
      </NavLink>
      <NavLink
        to="/dashboard"
        className={({ isActive }) => (isActive ? "active" : "")}
      >
        관리자
      </NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="app-main">
          <NavBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/student/:sessionId" element={<StudentPage />} />
            <Route path="/instructor" element={<InstructorPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
