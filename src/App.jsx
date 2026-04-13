import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { FaGithub } from 'react-icons/fa';
import HomePage from './pages/HomePage';
import StudentPage from './pages/StudentPage';
import InstructorPage from './pages/InstructorPage';
import DashboardPage from './pages/DashboardPage';
import './App.css';

function NavBar() {
  const { pathname } = useLocation();
  const hide = pathname === '/' || pathname.startsWith('/student');
  if (hide) return null;

  return (
    <nav className="nav-bar">
      <NavLink to="/instructor" className={({ isActive }) => isActive ? 'active' : ''}>
        강사
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
        관리자
      </NavLink>
    </nav>
  );
}

function Footer() {
  const members = [
    {
      name: '정은아',
      email: 'eunah0507@naver.com',
      github: 'https://github.com/eunah0507',
    },
    {
      name: '김보민',
      email: 'riahboa@naver.com',
      github: 'https://github.com/WHOOZ-23',
    },
    {
      name: '오의석',
      email: 'dkdlelxoa@naver.com',
      github: 'https://github.com/ohuiseok',
    },
  ];

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <p className="app-footer-title">
          2026 KIT 바이브코딩 공모전 출품작 · AI 분석 이해도 저하 자동 감지 알림 서비스
        </p>
        <div className="app-footer-members">
          {members.map((member) => (
            <div key={member.email} className="app-footer-member">
              <span className="app-footer-name">{member.name}</span>
              <a href={`mailto:${member.email}`} className="app-footer-email">
                {member.email}
              </a>
              <a
                href={member.github}
                target="_blank"
                rel="noreferrer"
                aria-label={`${member.name} GitHub`}
                className="app-footer-github"
                title={`${member.name} GitHub`}
              >
                <FaGithub />
              </a>
            </div>
          ))}
        </div>
      </div>
    </footer>
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
        <Footer />
      </div>
    </BrowserRouter>
  );
}
