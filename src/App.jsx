import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import HomePage       from './pages/HomePage';
import StudentPage    from './pages/StudentPage';
import InstructorPage from './pages/InstructorPage';
import DashboardPage  from './pages/DashboardPage';

// 강사·관리자 전용 상단 내비게이션 (학생 홈·수업 화면엔 숨김)
function NavBar() {
  const { pathname } = useLocation();
  const hide = pathname === '/' || pathname.startsWith('/student');
  if (hide) return null;
  return (
    <nav className="nav-bar">
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
        {/* 학생 진입점: 세션 ID 입력 */}
        <Route path="/"                   element={<HomePage />} />
        {/* 세션 ID를 URL 파라미터로 받음 */}
        <Route path="/student/:sessionId" element={<StudentPage />} />
        <Route path="/instructor"         element={<InstructorPage />} />
        <Route path="/dashboard"          element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
