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
| STT | Web Speech API (Chrome 내장, 무료) |

---

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에서 VITE_API_URL, VITE_AI_URL, VITE_INSTRUCTOR_PIN 수정

# 3. 개발 서버 시작
npm run dev
# → http://localhost:5173

# 4. 프로덕션 빌드
npm run build
```

PowerShell에서는 `cp .env.example .env` 대신 `Copy-Item .env.example .env`를 사용하면 됩니다.

---

## 환경변수 (.env)

```env
# Spring Boot 백엔드
VITE_API_URL=http://localhost:8080

# FastAPI AI 분석 서버
VITE_AI_URL=http://localhost:8000

# 강사 페이지 PIN (숫자 권장, 기본값 없으면 '0000' 사용)
VITE_INSTRUCTOR_PIN=1234
```

일부 화면은 서버 연결 실패 시 목(mock) 데이터 또는 임시 세션으로 폴백합니다.

- `/dashboard`는 목 데이터를 표시합니다.
- `/instructor`는 세션 생성 실패 시 임시 6자리 세션 ID로 UI를 계속 확인할 수 있습니다.
- `/student`의 표정 분석과 실시간 알림 흐름은 백엔드 없이 완전하게 재현되지는 않습니다.

---

## 페이지 구성

| 경로 | 역할 | 접속 대상 |
|------|------|-----------|
| `/` | 세션 ID + 이름 입력 → 수업 참가 | 교육생 |
| `/student/:sessionId?name=이름` | 웹캠 표정 감지 + 이미지 전송 | 교육생 |
| `/instructor` | PIN 인증 → 세션 생성 + 마이크 + 실시간 알림 수신 | 강사 |
| `/dashboard` | 반별 통계 및 알림 이력 | 관리자 |

---

## 사용자 흐름

```
[교육생]
  │
  ├─ / (홈)
  │    ├─ 6자리 숫자 세션 ID 입력
  │    ├─ 이름 입력 (studentId로 사용)
  │    └─ → /student/:sessionId?name=홍길동
  │
  └─ /student/:sessionId
       ├─ 웹캠 스트림 시작 (useWebcam)
       ├─ 10초마다 JPEG 캡처
       ├─ POST /analyze/{studentId} → FastAPI → confusedScore 수신
       ├─ 연속 3회(30초) confused=true 시
       │   POST /api/confused-events → Spring 전송
       └─ 30초 cooldown 후 재감지

[강사]
  /instructor
  ├─ PIN 입력 (VITE_INSTRUCTOR_PIN 검증)
  ├─ 세션 시작 설정 모달 (반ID, 임계값%, 커리큘럼)
  ├─ POST /api/sessions → 6자리 세션 ID 발급
  ├─ 파란 배너에 세션 ID + 클립보드 복사
  ├─ WebSocket 구독: /topic/alert/{sessionId}
  ├─ 마이크 녹음 시작 (useMicrophone)
  │    └─ 음소거 토글 / 30분 침묵 시 경고 토스트
  ├─ 알림 카드 수신
  │    ├─ PASS 버튼 → DELETE /api/alerts/:alertId → 카드 제거
  │    └─ 알림 수신 직후 2분간 음성 기록 (Web Speech API)
  │         ├─ 완료 → POST /ai-api/summarize → FastAPI AI 요약
  │         ├─ 요약 결과 → POST /api/lecture-summary → Spring 저장
  │         └─ 알림 카드에 '원문 보기' / 'AI 요약 보기' 토글 표시

[Spring]
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
│   │   └── index.js                  # 모든 REST API 호출 (axios)
│   │
│   ├── hooks/
│   │   ├── useWebcam.js              # 웹캠 스트림 + 주기적 프레임 캡처
│   │   ├── useStompAlert.js          # STOMP/SockJS WebSocket 구독
│   │   ├── useMicrophone.js          # MediaRecorder 마이크 청크 녹음 + 음소거
│   │   └── useSpeechRecognition.js   # Web Speech API 2분 STT
│   │
│   ├── components/
│   │   ├── PinModal.jsx              # 강사 PIN 인증 모달
│   │   └── SessionSettingsModal.jsx  # 세션 시작 설정 모달
│   │
│   ├── pages/
│   │   ├── HomePage.jsx              # /  —  세션 ID + 이름 입력 폼
│   │   ├── StudentPage.jsx           # /student/:sessionId  —  교육생 웹캠 화면
│   │   ├── InstructorPage.jsx        # /instructor  —  강사 화면
│   │   └── DashboardPage.jsx         # /dashboard  —  관리자 대시보드
│   │
│   ├── App.jsx                       # BrowserRouter + 라우트 정의 + NavBar
│   ├── App.css                       # 전역 override
│   ├── index.css                     # 디자인 시스템 (CSS 변수, 공통 클래스)
│   └── main.jsx                      # React 앱 진입점
│
├── .env.example                      # 환경변수 예시
├── vite.config.js                    # Vite 설정 (global 폴리필 포함)
└── package.json
```

---

## 파일별 상세 설명

### `src/api/index.js`

axios 인스턴스 두 개를 관리합니다.

- `http` — Spring Boot(`VITE_API_URL`)와 통신
- `ai` — FastAPI(`VITE_AI_URL`)와 통신

#### Spring Boot API

| 함수 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| `createSession(data)` | POST | `/api/sessions` | 세션 생성 (classId, thresholdPct, curriculum) |
| `endSession(id)` | PATCH | `/api/sessions/:id/end` | 세션 종료 |
| `getSessionAlerts(id)` | GET | `/api/sessions/:id/alerts` | 세션 알림 이력 |
| `getConfusedEvents(id)` | GET | `/api/sessions/:id/confused-events` | confused 이벤트 목록 |
| `getDashboardClasses()` | GET | `/api/dashboard/classes` | 반별 통계 |
| `postConfusedEvent(data)` | POST | `/api/confused-events` | 교육생 confused 이벤트 전송 |
| `sendLectureChunk(data)` | POST | `/api/lecture-chunk` | 현재 구현에서는 `{ sessionId }`만 전송 (오디오 blob은 전송하지 않음) |
| `deleteAlert(alertId)` | DELETE | `/api/alerts/:alertId` | 알림 PASS (삭제) |
| `getLectureSummary(alertId)` | GET | `/api/lecture-summary/:alertId` | 저장된 AI 요약 조회 |

#### FastAPI API

| 함수 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| `analyzeFrame(blob, studentId)` | POST | `/analyze/{studentId}` | 이미지 표정 분석 (path param + multipart) |

#### 복합 함수

| 함수 | 설명 |
|------|------|
| `postLectureSummary({ alertId, transcript })` | ① FastAPI `/ai-api/summarize` 로 transcript 전송 → AI 요약 수신<br>② Spring `/api/lecture-summary` 에 `{ alertId, summary }` 저장<br>③ `{ summary }` 반환 |

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

---

### `src/hooks/useMicrophone.js`

```js
const { active, muted, error, start, stop, toggleMute } = useMicrophone({
  onChunk,          // (blob: Blob) => void  —  오디오 청크 콜백
  chunkMs,          // 청크 분리 주기 (기본 5000ms)
  onSilenceWarning, // () => void  —  30분 무음 시 호출
});
```

- `MediaRecorder` API로 마이크 오디오 녹음
- `toggleMute()` — 오디오 트랙 enabled 플래그로 음소거 전환
- 30분 동안 유효 청크가 없으면 `onSilenceWarning` 콜백 호출

---

### `src/hooks/useSpeechRecognition.js`

```js
const { supported, recording, startRecording, stopRecording } = useSpeechRecognition();

// 사용 예
startRecording((transcript) => {
  // 2분 후 자동 호출
  console.log(transcript);
});
```

- Chrome/Edge 내장 `SpeechRecognition` API 사용 (별도 서버 불필요)
- `lang: 'ko-KR'`, `continuous: true`, `interimResults: false`
- `startRecording(onComplete)` 호출 시 2분 뒤 자동 종료 → transcript 콜백
- `supported` — 현재 브라우저 지원 여부 (Chrome 권장)

---

### `src/components/PinModal.jsx`

강사 페이지 진입 전 PIN 인증 모달입니다.

- `VITE_INSTRUCTOR_PIN` 환경변수 값과 입력값을 클라이언트에서 대조
- 오답 시 shake 애니메이션 + 에러 메시지 표시
- 올바른 PIN 입력 시 `onSuccess()` 콜백 호출

---

### `src/components/SessionSettingsModal.jsx`

세션 시작 버튼 클릭 시 표시되는 설정 모달입니다.

| 입력 항목 | 설명 |
|-----------|------|
| 반 ID | `classId` 문자열 (기본 `class-1`) |
| 혼란도 임계값 | 10~90% 슬라이더 (기본 45%) |
| 오늘의 커리큘럼 | 자유 텍스트, 선택 입력 |

`onConfirm({ thresholdPct, curriculum, classId })` 콜백으로 값 전달 후 세션 생성 API 호출.

---

### `src/pages/HomePage.jsx`

교육생 진입점.

- 세션 ID 입력: 숫자만 허용, 최대 6자리 (`maxLength=6`, `inputMode="numeric"`)
- 이름 입력: URL 쿼리 `?name=홍길동` 으로 전달 → StudentPage에서 studentId로 사용
- 유효성 통과 시 `/student/:sessionId?name=이름`으로 이동

---

### `src/pages/StudentPage.jsx`

```js
const { sessionId } = useParams();           // URL 경로에서 세션 ID
const [searchParams] = useSearchParams();
const studentId = searchParams.get('name');  // ?name= 쿼리에서 학생 이름
```

**교육생 confused 감지 로직:**

```
웹캠 10초 캡처
  → POST /analyze/{studentId}  multipart/form-data  (FastAPI)
  → confused=true && confidence >= 0.45
  → 연속 3회 달성 (= 30초 지속)
  → POST /api/confused-events { studentId, sessionId, capturedAt, confusedScore, reason }
  → 30초 cooldown (중복 전송 방지)
  → cooldown 해제 후 재감지
```

| 상수 | 값 | 설명 |
|------|----|------|
| `CONFUSED_STREAK_NEEDED` | `3` | 연속 감지 횟수 |
| `threshold` | `0.45` | confusedScore 기준값 |
| cooldown | `30000ms` | 전송 후 대기 시간 |

FastAPI 응답 필드 전체 표시: `confidence`, `emotion`, `gpt_reason`, `face_features` (7가지 감정 + brow_eye_ratio, EAR, head_tilt_deg)

---

### `src/pages/InstructorPage.jsx`

**접근 흐름:**

```
① PIN 입력 (PinModal)
     → VITE_INSTRUCTOR_PIN 일치 확인
② 세션 시작 버튼 클릭
     → SessionSettingsModal (반ID, 임계값, 커리큘럼)
     → POST /api/sessions { classId, thresholdPct, curriculum }
     → 세션 ID 발급 (6자리), 파란 배너에 표시
③ WebSocket 구독 시작 (/topic/alert/{sessionId})
④ 마이크 녹음 시작
⑤ 알림 카드 수신
     → PASS 버튼: DELETE /api/alerts/:alertId → 카드 제거
     → 알림 수신 후 2분 STT 시작
          → POST /ai-api/summarize (FastAPI) → AI 요약
          → POST /api/lecture-summary (Spring) 저장
          → '원문 보기' / 'AI 요약 보기' 탭 토글
```

**마이크 기능:**

- 녹음 중 🔊 음소거 / 🔇 음소거 해제 버튼으로 실시간 토글
- 30분 동안 유효 오디오 청크 없으면 화면 우하단에 경고 토스트 8초 표시

---

### `src/pages/DashboardPage.jsx`

| 구성 요소 | 설명 |
|-----------|------|
| KPI 카드 4개 | 진행 세션 수, 총 알림 수, 평균 혼란도, 참여 교육생 수 |
| BarChart | 반별 알림 발생 횟수 (Recharts) |
| LineChart | 세션 타임라인 혼란도 추이 + 50% threshold 점선 |
| 태그 목록 | 자주 언급된 모르는 내용 (unclearTopic) |
| 알림 이력 테이블 | 시각, 반, 모르는 내용, reason, 혼란도% |

`GET /api/dashboard/classes` 응답이 배열 형태: `[{ classId, alertCount, avgConfusedScore, topTopics, recentAlerts }]`

---

### `vite.config.js`

```js
define: {
  global: 'globalThis',  // sockjs-client의 Node.js global 참조를 브라우저 환경에서 해결
}
```

---

## REST API 전체 요약

### Spring Boot (`VITE_API_URL`)

| Method | URL | Body / Param | 설명 |
|--------|-----|------|------|
| POST | `/api/sessions` | `{ classId, thresholdPct, curriculum }` | 세션 생성 |
| PATCH | `/api/sessions/:id/end` | — | 세션 종료 |
| GET | `/api/sessions/:id/alerts` | — | 세션 알림 이력 |
| GET | `/api/sessions/:id/confused-events` | — | confused 이벤트 목록 |
| GET | `/api/dashboard/classes` | — | 반별 통계 |
| POST | `/api/confused-events` | `{ studentId, sessionId, capturedAt, confusedScore, reason }` | 교육생 confused 전송 |
| POST | `/api/lecture-chunk` | `{ sessionId }` | 현재 구현 기준 세션 식별자만 전송 |
| DELETE | `/api/alerts/:alertId` | — | 알림 PASS (삭제) |
| POST | `/api/lecture-summary` | `{ alertId, summary }` | AI 요약 저장 |
| GET | `/api/lecture-summary/:alertId` | — | AI 요약 조회 |

### FastAPI (`VITE_AI_URL`)

| Method | URL | Body | 설명 |
|--------|-----|------|------|
| POST | `/analyze/{studentId}` | `multipart/form-data` `file=frame.jpg` | 이미지 표정 분석 |
| POST | `/ai-api/summarize` | `{ transcript }` | 강의 음성 원문 → AI 요약 |

**`/analyze` 응답 예시:**

```json
{
  "confused": true,
  "confidence": 0.62,
  "emotion": "sad",
  "gpt_reason": "눈썹 찌푸림, 시선 불안정",
  "face_features": {
    "face_detected": true,
    "emotions": { "happy": 0.01, "neutral": 0.22, "fear": 0.08, "sad": 0.31, "angry": 0.05, "disgust": 0.02, "surprise": 0.09 },
    "top_emotion": "sad",
    "confidence": 0.62,
    "brow_eye_ratio": 0.83,
    "ear": 0.29,
    "head_tilt_deg": -12.4
  }
}
```

**`/ai-api/summarize` 요청 / 응답 예시:**

```json
// Request
{ "transcript": "오늘 트랜잭션 격리 수준에 대해 설명했습니다 ..." }

// Response
{ "summary": "강사가 트랜잭션 격리 수준(READ COMMITTED, REPEATABLE READ 등)을 설명하였으며 ..." }
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
                 → 알림 카드별 PASS 버튼 / 2분 STT / AI 요약 제공
```

---

## 주요 트러블슈팅

| 현상 | 원인 | 해결 |
|------|------|------|
| `global is not defined` | sockjs-client가 Node.js `global`을 참조 | `vite.config.js`에 `define: { global: 'globalThis' }` 추가 |
| `Cannot read properties of null (reading 'id')` | session이 null인 상태에서 session.id 참조 | useCallback 의존성을 `session` 전체로, 콜백 내부에 `if (!session) return` 가드 추가 |
| `vite`를 인식 못함 | node_modules 누락 | `npm install` 후 재시도 |
| Web Speech API 동작 안 함 | Firefox, Safari 미지원 | Chrome 또는 Edge 사용 권장 |
