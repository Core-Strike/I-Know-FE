import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import StudentPage    from './pages/StudentPage';
import InstructorPage from './pages/InstructorPage';
import DashboardPage  from './pages/DashboardPage';

function NavBar() {
  return (
    <nav className="nav-bar">
      <NavLink to="/student"    className={({ isActive }) => isActive ? 'active' : ''}>교육생</NavLink>
      <NavLink to="/instructor" className={({ isActive }) => isActive ? 'active' : ''}>강사</NavLink>
      <NavLink to="/dashboard"  className={({ isActive }) => isActive ? 'active' : ''}>관리자</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/"            element={<Navigate to="/student" replace />} />
        <Route path="/student"     element={<StudentPage />} />
        <Route path="/instructor"  element={<InstructorPage />} />
        <Route path="/dashboard"   element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
