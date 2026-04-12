import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const createRandomStudentName = () =>
  String(Math.floor(100000000 + Math.random() * 900000000));

// 수업 ID 허용 문자: 숫자 + 대문자 알파벳, 8자리
const SESSION_ID_REGEX = /^[A-Z0-9]{8}$/;
const SESSION_ID_SANITIZE = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export default function HomePage() {
  const [sessionId, setSessionId] = useState('');
  const [name, setName]           = useState('');
  const [error, setError]         = useState('');
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmedId   = sessionId.trim();
    const trimmedName = name.trim();
    const studentName = trimmedName || createRandomStudentName();

    if (!trimmedId) {
      setError('수업 ID를 입력해 주세요.');
      return;
    }
    if (!SESSION_ID_REGEX.test(trimmedId)) {
      setError('수업 ID는 숫자·대문자 알파벳 8자리여야 합니다.');
      return;
    }

    navigate(`/student/${encodeURIComponent(trimmedId)}?name=${encodeURIComponent(studentName)}`);
  };

  const handleSessionIdChange = (e) => {
    // 소문자 → 대문자 자동 변환, 숫자+대문자만 허용, 최대 8자
    const val = SESSION_ID_SANITIZE(e.target.value);
    setSessionId(val);
    setError('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <div
        className="card"
        style={{ width: 360, padding: '36px 32px', textAlign: 'center' }}
      >
        <div style={{ marginBottom: 8, fontSize: 28 }}>🎓</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          iKnow
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>
          강사에게 받은 수업 ID를 입력하고 수업에 참여하세요.
        </p>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="수업 ID (8자리, 예: AB12CD34)"
            value={sessionId}
            onChange={handleSessionIdChange}
            maxLength={8}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 20,
              textAlign: 'center',
              outline: 'none',
              letterSpacing: 6,
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
            autoFocus
          />
          <input
            type="text"
            placeholder="이름 입력 (비우면 9자리 숫자 자동 생성)"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 14,
              textAlign: 'center',
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: -4 }}>{error}</p>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            수업 참여
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
          강사라면{' '}
          <a
            href="/instructor"
            style={{ color: 'var(--blue)', textDecoration: 'underline' }}
          >
            강사 페이지
          </a>
          로 이동하세요.
        </p>
      </div>
    </div>
  );
}
