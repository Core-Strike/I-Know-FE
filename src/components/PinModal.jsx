import { useState, useRef, useEffect } from 'react';

/**
 * 강사 PIN 인증 모달.
 * VITE_INSTRUCTOR_PIN 환경변수와 입력값을 대조.
 * 올바른 PIN 입력 시 onSuccess() 호출.
 */
export default function PinModal({ onSuccess }) {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [shake, setShake]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const correctPin = import.meta.env.VITE_INSTRUCTOR_PIN || '0000';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === correctPin) {
      onSuccess();
    } else {
      setError('PIN이 올바르지 않습니다.');
      setShake(true);
      setPin('');
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        className="card"
        style={{
          width: 320,
          padding: '36px 32px',
          textAlign: 'center',
          animation: shake ? 'shake 0.4s ease' : 'none',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>강사 인증</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
          강사 페이지에 접근하려면 PIN을 입력해 주세요
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            placeholder="PIN 입력"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(''); }}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 22,
              textAlign: 'center',
              letterSpacing: 8,
              outline: 'none',
              fontFamily: 'monospace',
            }}
            autoComplete="off"
          />
          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: -4 }}>{error}</p>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            확인
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
