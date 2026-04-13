import { useEffect, useState } from "react";

export default function SessionSettingsModal({
  curriculums = [],
  loading = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const [thresholdPct, setThresholdPct] = useState(45);
  const [curriculum, setCurriculum] = useState(curriculums[0]?.name ?? "");
  const [classId, setClassId] = useState("class-1");

  useEffect(() => {
    if (!curriculums.length) {
      setCurriculum("");
      return;
    }

    setCurriculum((prev) =>
      prev && curriculums.some((item) => item.name === prev)
        ? prev
        : curriculums[0].name,
    );
  }, [curriculums]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!curriculum) {
      return;
    }

    onConfirm({
      thresholdPct,
      curriculum,
      classId: classId.trim() || "class-1",
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 900,
      }}
    >
      <div
        className="card"
        style={{
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          padding: "32px 28px",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          수업 시작 설정
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginBottom: 24,
          }}
        >
          수업을 시작하기 전에 기본 설정을 확인해 주세요.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 30 }}
        >
          <div>
            <label
              for="curriculum"
              style={{
                fontSize: 14,
                fontWeight: 600,
                display: "block",
                marginBottom: 6,
              }}
            >
              커리큘럼
            </label>
            <select
              name="curriculum"
              value={curriculum}
              onChange={(e) => setCurriculum(e.target.value)}
              required
              disabled={loading || curriculums.length === 0}
              style={{
                width: "100%",
                padding: "12px",
                paddingRight: "24px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              {curriculums.length === 0 && (
                <option value="">
                  {loading
                    ? "커리큘럼 불러오는 중..."
                    : "등록된 커리큘럼이 없습니다"}
                </option>
              )}
              {curriculums.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
            {error && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
                {error}
              </div>
            )}
          </div>

          <div>
            <label
              style={{
                fontSize: 14,
                fontWeight: 600,
                display: "block",
                marginBottom: 6,
              }}
            >
              반 이름
            </label>
            <input
              type="text"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              placeholder="예: class-1"
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                이해 부족 알림 기준
              </span>
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  color:
                    thresholdPct > 60
                      ? "var(--red)"
                      : thresholdPct > 40
                        ? "#f59e0b"
                        : "var(--blue)",
                }}
              >
                {thresholdPct}%
              </span>
            </label>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value))}
              style={{
                width: "100%",
                accentColor: "var(--blue)",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                color: "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              <span>10% (민감)</span>
              <span>90% (엄격)</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="btn btn-outline"
              onClick={onCancel}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || curriculums.length === 0 || !curriculum}
            >
              수업 시작
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
