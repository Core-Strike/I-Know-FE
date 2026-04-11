# iKnow — Frontend (React)

실시간 표정 기반 학습 이해도 감지 시스템의 프론트엔드입니다.  
교육생 웹캠 표정 → FastAPI 분석 → Spring 과반수 판정 → 강사 WebSocket 알림의 흐름을 UI로 구현합니다.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 번들러 | Vite 8 |
| 프레임워크 | React 19 |
| 라우팅 | React Router DOM v7 |
| HTTP 클라이언트 | Axios |
| WebSocket | @stomp/stompjs + sockjs-client |
| 차트 | Recharts |

---

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에서 VITE_API_URL, VITE_AI_URL 수정

# 3. 개발 서버 시작
npm run dev
# → http://localhost:5173

# 4. 프로덕션 빌드
npm run build
```

---

## 환경변수 (.env)

```env
# Spring Boot 백엔드
VITE_API_URL=http://localhost:8080

# FastAPI AI 분석 서버
VITE_AI_URL=http://localhost:8000
```

서버 없이 실행하면 목(mock) 데이터로 모든 UI를 확인할 수 있습니다.

---

## 페이지 구성

| 경로 | 역할 | 접속 대상 |
|------|------|-----------|
| `/` | 세션 ID 입력 → 수업 참가 | 교육생 |
| `/student/:sessionId` | 웹캠 표정 감지 + 이미지 전송 | 교육생 |
| `/instructor` | 세션 생성 + 마이크 + 실시간 알림 수신 | 강사 |
| `/dashboard` | 반별 통계 및 알림 이력 | 관리자 |

---

## 사용자 흐름

```
[교육생]
  │
  ├─ / (홈) ──── 세션 ID 입력 ─────────────────────────────────────────┐
  │                                                                     │
  └─ /student/:sessionId                                               │
       │                                                               ↓
       ├─ 웹캠 스트림 시작 (useWebcam)                           [강사]
       ├─ 10초마다 JPEG 캡처                                     /instructor
       ├─ POST /ai-api/analyze → confusedScore 수신                  │
       ├─ 연속 3회(30초) confused=true 시                           ├─ 세션 시작 → 세션 ID 발급
       │   POST /api/confused-events → Spring 전송                ├─ 세션 ID 배너 표시 + 복사
       └─ 30초 cooldown 후 재감지                                   ├─ WebSocket 구독
                                                                     │    /topic/alert/{sessionId}
                                                         [Spring]   ├─ 실시간 알림 카드 수신
                                                             │       └─ 마이크 녹음 (useMicrophone)
                                                             ├─ confused 이벤트 수집
                                                             ├─ 최근 30초 과반수 판정
                                                             ├─ Alert DB 저장
                                                             └─ WebSocket으로 강사에게 전송
```

---

## 프로젝트 구조

```
fe/
├── public/
├── src/
│   ├── api/
│   │   └── index.js            # 모든 REST API 호출 (axios)
│   │
│   ├── hooks/
│   │   ├── useWebcam.js        # 웹캠 스트림 + 주기적 프레임 캡처
│   │   ├── useStompAlert.js    # STOMP/SockJS WebSocket 구독
│   │   └── useMicrophone.js    # MediaRecorder 마이크 청크 녹음
│   │
│   ├── pages/
│   │   ├── HomePage.jsx        # /  —  세션 ID 입력 폼
│   │   ├── StudentPage.jsx     # /student/:sessionId  —  교육생 웹캠 화면
│   │   ├── InstructorPage.jsx  # /instructor  —  강사 화면
│   │   └── DashboardPage.jsx   # /dashboard  —  관리자 대시보드
│   │
│   ├── App.jsx                 # BrowserRouter + 라우트 정의 + NavBar
│   ├── App.css                 # 전역 override
│   ├── index.css               # 디자인 시스템 (CSS 변수, 공통 클래스)
│   └── main.jsx                # React 앱 진입점
│
├── .env.example                # 환경변수 예시
├── vite.config.js              # Vite 설정 (global 폴리필 포함)
└── package.json
```

---

## 파일별 상세 설명

### `src/api/index.js`

axios 인스턴스 두 개를 관리합니다.

- `http` — Spring Boot(`VITE_API_URL`)와 통신
- `ai` — FastAPI(`VITE_AI_URL`)와 통신

| 함수 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| `createSession(data)` | POST | `/api/sessions` | 세션 생성 |
| `endSession(id)` | PATCH | `/api/sessions/:id/end` | 세션 종료 |
| `getSessionAlerts(id)` | GET | `/api/sessions/:id/alerts` | 세션 알림 이력 |
| `getConfusedEvents(id)` | GET | `/api/sessions/:id/confused-events` | confused 이벤트 목록 |
| `getDashboardClasses()` | GET | `/api/dashboard/classes` | 반별 통계 |
| `analyzeFrame(blob, studentId)` | POST | `/ai-api/analyze` | 이미지 표정 분석 |
| `postConfusedEvent(data)` | POST | `/api/confused-events` | 교육생 confused 이벤트 전송 |
| `sendLectureChunk(data)` | POST | `/api/lecture-chunk` | 강사 음성 청크 전송 |

---

### `src/hooks/useWebcam.js`

```js
const { videoRef, active, error, start, stop } = useWebcam({
  onFrame,      // (blob: Blob) => void  —  캡처된 JPEG Blob 콜백
  intervalMs,   // 캡처 주기 (기본 10000ms)
  enabled,      // true일 때만 주기적 캡처 동작
});
```

- `navigator.mediaDevices.getUserMedia`로 카메라 스트림 획득
- `<canvas>`에 `drawImage` 후 `toBlob('image/jpeg', 0.8)`으로 캡처
- `start()` / `stop()`으로 스트림 제어
- `videoRef`를 `<video>` 태그에 연결해 미리보기 표시

---

### `src/hooks/useStompAlert.js`

```js
const { connected } = useStompAlert({
  sessionId,   // 구독할 세션 ID
  onAlert,     // (data: object) => void  —  알림 수신 콜백
  enabled,     // 세션 활성화 여부
});
```

- `@stomp/stompjs` + `sockjs-client`로 Spring WebSocket 연결
- 연결 주소: `VITE_API_URL/ws`
- 구독 토픽: `/topic/alert/{sessionId}`
- `reconnectDelay: 5000` — 연결이 끊기면 5초 후 자동 재연결
- `enabled=false` 또는 컴포넌트 언마운트 시 `client.deactivate()` 호출

---

### `src/hooks/useMicrophone.js`

```js
const { active, error, start, stop } = useMicrophone({
  onChunk,    // (blob: Blob) => void  —  오디오 청크 콜백
  chunkMs,    // 청크 분리 주기 (기본 5000ms)
});
```

- `MediaRecorder` API로 마이크 오디오 녹음
- `chunkMs` 간격으로 `ondataavailable` 이벤트 발생 → `onChunk` 전달

---

### `src/pages/HomePage.jsx`

교육생 진입점. 세션 ID를 입력받아 `/student/:sessionId`로 이동합니다.

- 숫자 외 입력 시 에러 메시지 표시
- 강사 페이지 링크 제공

---

### `src/pages/StudentPage.jsx`

`useParams()`로 URL의 `:sessionId`를 읽어 이후 모든 API 호출에 사용합니다.

**교육생 confused 감지 로직:**

```
웹캠 10초 캡처
  → POST /ai-api/analyze (FastAPI)
  → confusedScore >= 0.45 이면 confused = true
  → 연속 3회 달성 (= 30초 지속)
  → POST /api/confused-events { studentId, sessionId, capturedAt } → Spring 전송
  → 30초 cooldown (중복 전송 방지)
  → cooldown 해제 후 재감지 시작
```

| 상수 | 값 | 설명 |
|------|----|------|
| `CONFUSED_STREAK_NEEDED` | `3` | 연속 감지 횟수 |
| `threshold` | `0.45` | confusedScore 기준값 |
| cooldown | `30000ms` | 전송 후 대기 시간 |

---

### `src/pages/InstructorPage.jsx`

**세션 시작 흐름:**

1. "세션 시작" 클릭 → `POST /api/sessions`
2. 서버 미응답 시 랜덤 ID로 mock 세션 자동 생성
3. 파란 배너에 세션 ID 크게 표시 + 클립보드 복사 버튼 + 학생 접속 URL 안내
4. `useStompAlert` 활성화 → `/topic/alert/{sessionId}` 구독 시작
5. `useMicrophone` 활성화 → 마이크 녹음 시작

**수신 알림 JSON 구조:**

```json
{
  "activeCount": 28,
  "confusedCount": 16,
  "pct": 57,
  "unclearTopic": "트랜잭션 격리 수준",
  "reason": "표정·시선 불안정"
}
```

---

### `src/pages/DashboardPage.jsx`

| 구성 요소 | 설명 |
|-----------|------|
| KPI 카드 4개 | 진행 세션 수, 총 알림 수, 평균 혼란도, 참여 학생 수 |
| 반 탭 필터 | 전체 반 / 1반 / 2반 / 3반 |
| BarChart | 반별 알림 발생 횟수 (Recharts) |
| LineChart | 세션 타임라인 혼란도 추이 + 50% threshold 점선 |
| 태그 목록 | 자주 언급된 모르는 내용 (unclearTopic) |
| 알림 이력 테이블 | 시각, 반, 모르는 내용, GPT reason, 혼란도% |

`GET /api/dashboard/classes` 응답이 없으면 하드코딩된 목 데이터를 유지합니다.

---

### `src/App.jsx`

```jsx
<BrowserRouter>
  <NavBar />   {/* /, /student/* 경로에서는 숨김 */}
  <Routes>
    <Route path="/"                   element={<HomePage />} />
    <Route path="/student/:sessionId" element={<StudentPage />} />
    <Route path="/instructor"         element={<InstructorPage />} />
    <Route path="/dashboard"          element={<DashboardPage />} />
  </Routes>
</BrowserRouter>
```

---

### `src/index.css` — 디자인 시스템

CSS 변수 기반 디자인 토큰을 사용합니다.

| 변수 | 값 | 용도 |
|------|----|------|
| `--bg` | `#f5f5f0` | 페이지 배경 |
| `--surface` | `#ffffff` | 카드 배경 |
| `--border` | `#e5e5e0` | 테두리 |
| `--text-primary` | `#1a1a1a` | 본문 텍스트 |
| `--text-secondary` | `#6b7280` | 보조 텍스트 |
| `--red` | `#ef4444` | 경고·혼란 표시 |
| `--blue` | `#3b82f6` | 정상·강조 |

공통 클래스: `.card` `.btn` `.badge` `.score-bar-*` `.alert-card` `.data-table` `.kpi-card` `.stat-box` 등

---

### `vite.config.js`

```js
define: {
  global: 'globalThis',  // sockjs-client의 Node.js global 참조를 브라우저 환경에서 해결
}
```

---

## WebSocket 메시지 흐름

```
Spring Boot
  └─ /ws  (SockJS endpoint)
       └─ /topic/alert/{sessionId}  (STOMP topic)
            └─ 강사 브라우저 구독 중
                 → 과반수 판정 시 JSON 메시지 push
                 → InstructorPage 알림 카드로 렌더링
```

---

## REST API 요약

### Spring Boot (`VITE_API_URL`)

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/sessions` | 세션 생성 |
| PATCH | `/api/sessions/:id/end` | 세션 종료 |
| POST | `/api/confused-events` | 교육생 confused 이벤트 전송 |
| GET | `/api/sessions/:id/alerts` | 세션 알림 이력 |
| GET | `/api/sessions/:id/confused-events` | confused 이벤트 목록 |
| GET | `/api/dashboard/classes` | 반별 통계 |
| POST | `/api/confused-events` | 교육생 confused 이벤트 전송 |
| POST | `/api/lecture-chunk` | 강사 음성 청크 전송 |

### FastAPI (`VITE_AI_URL`)

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/ai-api/analyze` | 이미지 표정 분석 → confusedScore 반환 |

**분석 응답 예시:**

```json
{
  "confused": true,
  "confusedScore": 0.62,
  "sad": 0.31,
  "fearful": 0.18,
  "surprised": 0.09,
  "neutral": 0.42
}
```