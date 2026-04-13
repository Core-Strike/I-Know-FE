import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../assets/logo-header.svg";
import { getSession } from "../api";
import Footer from "../components/Footer";

// 수업 ID 허용 문자: 숫자 + 대문자 알파벳, 8자리
const SESSION_ID_REGEX = /^[A-Z0-9]{8}$/;
const SESSION_ID_SANITIZE = (value) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export default function HomePage() {
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleJoin = async (e) => {
    e.preventDefault();
    const trimmedId = sessionId.trim();
    const trimmedName = name.trim();

    if (!trimmedId) {
      setError("수업 ID를 입력해 주세요.");
      return;
    }

    if (!trimmedName) {
      setError("이름을 입력해 주세요.");
      return;
    }

    if (!SESSION_ID_REGEX.test(trimmedId)) {
      setError("수업 ID는 숫자·대문자 알파벳 8자리여야 합니다.");
      return;
    }

    try {
      const session = await getSession(trimmedId);
      if (session?.status !== "ACTIVE") {
        setError("아직 시작하지 않았거나 이미 종료된 수업입니다.");
        return;
      }
    } catch {
      setError("유효하지 않거나 아직 시작하지 않은 수업 ID입니다.");
      return;
    }

    navigate(
      `/student/${encodeURIComponent(trimmedId)}?name=${encodeURIComponent(trimmedName)}`,
    );
  };

  const handleSessionIdChange = (e) => {
    const value = SESSION_ID_SANITIZE(e.target.value);
    setSessionId(value);
    setError("");
  };

  return (
    <>
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
            수업 ID와 이름을 입력해 수업에 참여해보세요.
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
              placeholder="이름 입력"
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
      <Footer />
    </>
  );
}
