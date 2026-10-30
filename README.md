# EXCUSE ME!

일상 속 황당하고 창의적인 핑계를 예술 작품처럼 등록하고 감상하는 참여형 디지털 박물관.

현재 Phase 0은 완료했고 **Phase 1 랜딩페이지·샘플 전시관 UI를 구현**했습니다. Phase 1 빌드·HTTP·React 서버 렌더링·샘플 함수 검사는 통과했으며, 실제 브라우저 직접 검증은 보류입니다. 작품 등록·DB·투표·사진·AI 기능은 아직 없습니다. 확장 기획과 단계별 검증 상태는 [PROGRESS.md](docs/PROGRESS.md)를 참고합니다.

## 1. 폴더 구성

```text
frontend/   React + Vite + Tailwind CSS 화면
backend/    FastAPI 서버, 패키지 목록, 로컬 .venv
database/   향후 DB 저장용 폴더 (현재 비어 있음)
docs/       MVP, PRD, SPEC, PLAN 기획 문서
```

`node_modules`, `.venv`, `dist`, 로그, 실제 `.env`와 SQLite DB 파일은 기존 `.gitignore` 규칙에 따라 Git에서 제외됩니다. 비밀값이 없는 `.env.example`은 공유할 수 있습니다.

## 2. 확인한 실행 환경과 패키지

2026-10-30 Windows PowerShell 환경에서 확인했습니다.

| 항목 | 버전 |
| --- | --- |
| Node.js / npm | 24.22.1 / 11.19.1 |
| Python / SQLite | 3.13.14 / 3.50.4 |
| React / React DOM | 19.3.1 / 19.3.1 |
| Vite / React 플러그인 | 8.3.5 / 6.1.2 |
| Tailwind CSS / Vite 플러그인 | 4.3.3 / 4.3.3 |
| FastAPI / Uvicorn | 0.162.0 / 0.54.0 |

Vite와 React 플러그인의 Node.js 요구 조건은 `^20.19.0 || >=22.12.0`이며 현재 환경이 충족합니다. Tailwind Vite 플러그인의 Vite 8 지원과 FastAPI·Uvicorn의 Python 3.10 이상 요구 조건도 확인했습니다. 실제 프론트엔드 빌드와 백엔드 실행, Python 의존성 검사를 통과했습니다.

설정 근거: [Vite 시작 안내](https://vite.dev/guide/), [Tailwind의 Vite 설치 안내](https://tailwindcss.com/docs/installation/using-vite), [FastAPI CORS 안내](https://fastapi.tiangolo.com/tutorial/cors/), [FastAPI 패키지](https://pypi.org/project/fastapi/), [Uvicorn 패키지](https://pypi.org/project/uvicorn/).

## 3. 처음 내려받은 PC에서 설치하기

**이번 작업을 진행한 PC에는 이미 설치했습니다. 바로 4절의 실행 명령을 사용하면 됩니다.** 다른 PC에서 저장소를 내려받았거나 설치 폴더가 없을 때 아래 절차를 사용합니다. Node.js와 Python은 먼저 설치되어 있어야 합니다.

VS Code에서 `EXCUSE ME` 폴더를 열고 PowerShell 터미널을 만듭니다. 아래 첫 줄의 경로는 PC에 맞게 바꿉니다.

프론트엔드:

```powershell
Set-Location "C:\Users\aicam\Desktop\EXCUSE ME\frontend"
npm.cmd ci
```

백엔드:

```powershell
Set-Location "C:\Users\aicam\Desktop\EXCUSE ME\backend"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
```

`frontend/package-lock.json`과 `backend/requirements.lock.txt`는 이번에 검증한 의존성 버전을 기록합니다. `backend/requirements.txt`에는 직접 사용하는 FastAPI와 Uvicorn 버전이 있습니다.

`npm.cmd`와 가상환경의 `python.exe`를 직접 사용하므로 PowerShell 실행 정책 변경이나 `Activate.ps1` 실행은 필요하지 않습니다.

## 4. 실행하기: 터미널 두 개 사용

### 터미널 1 — 백엔드

```powershell
Set-Location "C:\Users\aicam\Desktop\EXCUSE ME\backend"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

서버가 실행되는 동안 이 터미널은 켜 둡니다. 브라우저에서 <http://127.0.0.1:8000/api/health>를 열면 `{"status":"ok"}`가 표시됩니다. 자동 API 문서는 <http://127.0.0.1:8000/docs>입니다.

### 터미널 2 — 프론트엔드

```powershell
Set-Location "C:\Users\aicam\Desktop\EXCUSE ME\frontend"
npm.cmd run dev
```

브라우저에서 **<http://localhost:5173>**을 열면 랜딩페이지가 표시됩니다. **전시 관람하기**로 <http://localhost:5173/gallery>에 이동합니다. 서버 연결 테스트는 하단 **서버 연결 확인** 링크 또는 **<http://localhost:5173/health>**에서 실행합니다.

두 서버는 각각 해당 터미널에서 `Ctrl+C`로 종료합니다. 다시 실행하려면 같은 실행 명령을 입력합니다. 현재 명령은 코드 변경 후 자동 재시작을 설정하지 않으므로, 백엔드 코드를 고쳤다면 종료 후 다시 실행합니다.

프론트엔드 포트는 `5173`으로 고정했고, 사용 중이면 다른 포트로 자동 이동하지 않고 오류를 표시합니다. 포트가 이미 사용 중일 때는 기존에 실행한 서버인지 확인하고 그 터미널에서 종료한 뒤 다시 실행합니다.

## 5. 서버 주소 설정

기본 서버 주소는 `http://127.0.0.1:8000`이며 `.env` 없이 실행할 수 있습니다. 변경이 필요할 때만 다음 명령으로 예시를 복사합니다.

```powershell
Set-Location "C:\Users\aicam\Desktop\EXCUSE ME\frontend"
Copy-Item .env.example .env
```

생성한 `.env`의 `VITE_API_BASE_URL`을 변경하고 프론트엔드를 재시작합니다. 이미 `.env`가 있다면 복사 명령으로 덮어쓰지 말고 기존 파일을 편집합니다. `VITE_` 변수는 브라우저에 공개되므로 비밀번호나 API 키를 넣지 않습니다.

FastAPI는 `http://localhost:5173`과 `http://127.0.0.1:5173`에서 오는 GET 요청을 허용합니다. 이 설정을 CORS라고 하며, 다른 주소의 화면이 서버 응답을 읽을 수 있는지 브라우저에 알려줍니다. 프론트엔드 포트를 바꾸면 `backend/main.py`의 허용 주소도 함께 바꿔야 합니다.

## 6. 연결 확인 화면에서 직접 확인할 동작

1. 두 서버를 켜고 <http://localhost:5173/health>를 엽니다. 연결 확인 화면의 제목과 버튼이 보이는지 확인합니다.
2. **서버 연결 확인**을 누르면 **연결 성공**과 `{"status":"ok"}`가 표시되어야 합니다.
3. 백엔드 터미널에서 `Ctrl+C`를 누릅니다. 프론트엔드 터미널은 유지합니다.
4. 같은 버튼을 다시 누르면 **연결 실패**와 백엔드 실행 여부를 확인하라는 안내가 표시되어야 합니다. 이전 성공 응답은 사라져야 합니다.
5. 백엔드를 같은 명령으로 다시 실행하고 버튼을 누르면 다시 성공해야 합니다.
6. 두 터미널에서 각각 `Ctrl+C`로 종료한 뒤 다시 실행해 봅니다.

연결 요청 중에는 버튼이 비활성화되고 **연결 확인 중…**을 표시합니다. 5초 안에 응답을 받지 못하면 시간 초과 안내를 표시하도록 구현했습니다. 연결 상태는 마지막 버튼 클릭 시점의 결과이며 자동 감시 기능은 없습니다.

## 7. Phase 0에서 수행한 검사와 남은 검증

| 검사 | 결과 |
| --- | --- |
| `npm.cmd run build` | 성공, `frontend/dist` 생성 |
| `npm.cmd ls --depth=0` | 직접 의존성 정상 설치 확인 |
| `python.exe -m pip check` | Python 의존성 충돌 없음 |
| 실제 FastAPI `/api/health` HTTP 요청 | 200, JSON `{"status":"ok"}` 확인 |
| 허용한 두 개발 주소의 CORS GET·OPTIONS 요청 | 허용 헤더와 200 응답 확인 |
| 허용하지 않은 주소의 CORS 검사 | GET 허용 헤더 없음, OPTIONS 400 확인 |
| Vite 개발 서버 HTTP 요청 | 200, HTML 제목과 React 진입 파일 확인 |
| 백엔드 실제 중단 후 HTTP 요청 | 연결 실패 확인 |
| 백엔드 재실행 후 HTTP 요청 | 200과 정상 JSON 확인 |
| 프론트엔드 개발 서버 종료·재실행 | 재실행 후 HTTP 200 확인 |
| 가상환경 Python의 SQLite 검사 | 메모리 연결과 `SELECT 1` 성공, 테이블 0개 확인 |
| React 웹페이지 정상 표시 | 사용자 브라우저 직접 테스트 통과 (2026-10-30) |
| 브라우저 버튼 클릭 후 성공 응답 표시 | 사용자 직접 확인: 연결 성공과 `{"status":"ok"}` 표시 |
| 백엔드 중단 후 브라우저 오류 안내 표시 | 사용자 직접 확인: 연결 실패 안내 표시 |
| 백엔드 재실행 후 브라우저 연결 복구 | 사용자 직접 확인: 연결 성공으로 복구 |
| 실제 브라우저에서 Tailwind 스타일 표시 | 사용자 브라우저 직접 테스트 통과 (2026-10-30) |

개발 당시 브라우저 자동화 도구가 Windows에서 현재 URL을 확인하지 못해 중단되었으나, 이후 사용자가 위 다섯 가지 브라우저 테스트를 직접 수행하고 통과 결과를 전달했습니다. 이는 사용자의 확인 결과이며 자동화 테스트를 수행했다는 뜻은 아닙니다. 시간 초과·비정상 HTTP·잘못된 JSON 응답 분기는 구현했지만 별도 동작 테스트는 하지 않았습니다. 요청 중 버튼 비활성화와 오류 후 이전 응답 제거도 별도 테스트 완료로 기록하지 않습니다.

SQLite 확인에는 `:memory:`를 사용했으며 실제 DB 파일이나 작품·투표 테이블을 만들지 않았습니다. 재확인은 백엔드 폴더에서 다음 명령으로 할 수 있습니다.

```powershell
.\.venv\Scripts\python.exe -c "import sqlite3; db = sqlite3.connect(':memory:'); print(sqlite3.sqlite_version, db.execute('SELECT 1').fetchone()); db.close()"
```

프론트엔드 빌드 재확인:

```powershell
Set-Location "C:\Users\aicam\Desktop\EXCUSE ME\frontend"
npm.cmd run build
```

백엔드 실행 중 API 재확인:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health | ConvertTo-Json -Compress
```

## 8. Phase 1 화면과 검증 상태

| 주소 | 현재 기능 |
| --- | --- |
| `/` | 랜딩페이지, 대표 샘플 카드 미리보기, 전시관 이동 |
| `/gallery` | 샘플 작품 8개, 카테고리 필터, 샘플 최신순·인기순 |
| `/health` | Phase 0 서버 연결 확인 |
| `/submit`, `/artworks/:id`, `/hall-of-fame` | 준비 중 안내, 실제 기능 없음 |

작품·작가명·날짜·명작 인정 수는 디자인 확인용 가상 데이터입니다. 필터·정렬은 샘플에만 적용됩니다. 메인 배경은 `#F9FAFB`이며 현재 히어로는 유지합니다.

Phase 1 빌드, health/CORS 및 각 경로 HTTP 접근, React 서버 렌더링의 랜딩 내용·전시관 8개 카드·안내 문구·링크 목적지, 샘플 필터·정렬 함수 검사는 통과했습니다. 실제 브라우저 표시·링크 클릭·필터 조작·dialog·모바일 배치는 미검증입니다. 서버 렌더링과 함수 검사는 실제 브라우저 클릭을 대신하지 않습니다.

브라우저에서는 랜딩 → 전시 관람하기 → 전시관 8개 카드 → 각 카테고리 및 전체 복귀 → 정렬 변경 → 기증·상세·명예의 전당 준비 중 안내 → /health 연결 확인을 직접 따라가세요. 자세한 검사 결과와 미검증 목록은 [PROGRESS.md](docs/PROGRESS.md)에 기록했습니다.

다음 개발 작업은 **Phase 1.5 설치미술 히어로 제작**이며 착수 전 Phase 1의 브라우저 확인 보류 항목을 마무리합니다. 확정된 사진전·AI 회화전 기획은 docs의 MVP·PRD·SPEC·PLAN에 있으며 아직 실제 기능으로 구현하지 않았습니다.
