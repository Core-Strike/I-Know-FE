import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../assets/logo-header.svg";

const createRandomStudentName = () =>
  String(Math.floor(100000000 + Math.random() * 900000000));

// 수업 ID 허용 문자: 숫자 + 대문자 알파벳, 8자리
const SESSION_ID_REGEX = /^[A-Z0-9]{8}$/;
const SESSION_ID_SANITIZE = (v) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export default function HomePage() {
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmedId = sessionId.trim();
    const trimmedName = name.trim();
    const studentName = trimmedName || createRandomStudentName();

    if (!trimmedId) {
      setError("수업 ID를 입력해 주세요.");
      return;
    }
    if (!SESSION_ID_REGEX.test(trimmedId)) {
      setError("수업 ID는 숫자·대문자 알파벳 8자리여야 합니다.");
      return;
    }

    navigate(
      `/student/${encodeURIComponent(trimmedId)}?name=${encodeURIComponent(studentName)}`,
    );
  };

  const handleSessionIdChange = (e) => {
    // 소문자 → 대문자 자동 변환, 숫자+대문자만 허용, 최대 8자
    const val = SESSION_ID_SANITIZE(e.target.value);
    setSessionId(val);
    setError("");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        className="card"
        style={{ width: 360, padding: "36px 32px", textAlign: "center" }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>
          <img
            src={Logo}
            alt="logo"
            style={{
              width: "100%",
              height: "46px",
            }}
          />
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginTop: 20,
            marginBottom: 30,
          }}
        >
          수업 ID를 입력해 수업에 참여해보세요.
        </p>

        <form
          onSubmit={handleJoin}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            className="placeholder"
            type="text"
            inputMode="numeric"
            placeholder="수업 ID (8자리, 예: AB12CD34)"
            value={sessionId}
            onChange={handleSessionIdChange}
            maxLength={8}
            style={{
              width: "100%",
              padding: "14px",
              border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
              borderRadius: 8,
              fontSize: 16,
              outline: "none",
            }}
            autoFocus
          />
          <input
            className="placeholder"
            type="text"
            placeholder="이름 입력 (비우면 9자리 숫자 자동 생성)"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            style={{
              width: "100%",
              padding: "14px",
              border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
              borderRadius: 8,
              fontSize: 16,
              outline: "none",
            }}
          />
          {error && (
            <p style={{ fontSize: 12, color: "var(--red)", marginTop: -4 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "12px",
              marginTop: "10px",
            }}
          >
            수업 참여
          </button>
        </form>

        <p
          style={{
            marginTop: 24,
            fontSize: 14,
            color: "var(--text-secondary)",
          }}
        >
          관리자이신가요?{" "}
          <a
            href="/instructor"
            style={{
              color: "var(--blue)",
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            관리자 페이지
          </a>
        </p>
      </div>
    </div>
  );
}
