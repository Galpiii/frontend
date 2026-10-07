# 갈피 · Frontend

기능명세서와 GitHub PR을 연결해, 내가 했던 작업부터 이어받아야 할 작업까지 프로젝트의 갈피를 잡는 서비스입니다. 이 저장소는 웹 프론트엔드(SPA)입니다.

## 기술 스택

React 19 · TypeScript · Vite · Tailwind CSS v4 · react-router

## 시작하기

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL을 백엔드 주소로 설정
npm run dev
```

프론트엔드 개발 서버의 기본 주소는 `http://localhost:5173`이며, 기본 API 대상은 배포된 `https://galpi-server.duckdns.org`입니다. 로컬 백엔드를 사용할 때는 `.env`의 값을 별도로 변경하세요.

개발 모드에서는 `/preview`에서 공통 컴포넌트 미리보기를 확인할 수 있습니다. 프로덕션 번들에는 포함되지 않습니다.

## 환경 변수

| 이름                | 설명                                 | 기본값                             |
| ------------------- | ------------------------------------ | ---------------------------------- |
| `VITE_API_BASE_URL` | 백엔드 origin (API 경로 접두사 없이) | `https://galpi-server.duckdns.org` |

Vite는 환경 변수를 **빌드 시점에 번들에 박아 넣습니다.** 배포 대상이 바뀌면 값을 바꾸고 다시 빌드해야 합니다. 토큰이나 비밀값은 프론트엔드 환경 변수에 두지 마세요.

로그인 코드 교환(`POST /auth/token`)과 세션 갱신(`POST /auth/refresh`)은 브라우저가 같은 출처의 경로로 요청합니다. 개발 서버는 `VITE_API_BASE_URL`로, 운영 Vercel은 [`vercel.json`](vercel.json)의 외부 rewrite로 이 두 요청을 백엔드에 전달합니다. GitHub OAuth 시작·콜백과 일반 API 요청은 기존 백엔드 주소를 사용합니다. 백엔드 주소를 바꿀 때는 환경 변수와 Vercel rewrite 목적지를 함께 바꾸세요.

## 스크립트

| 명령                   | 설명                                |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | 개발 서버                           |
| `npm run build`        | 타입체크(`tsc -b`) 후 프로덕션 빌드 |
| `npm run preview`      | 빌드 결과 미리보기                  |
| `npm run lint`         | ESLint                              |
| `npm run format`       | Prettier 적용                       |
| `npm run format:check` | Prettier 검사 (CI와 동일)           |
| `npm test`             | 인증 흐름 테스트 (`node --test`)    |

CI는 PR과 `main` push에서 `format:check` → `lint` → `test` → `build`를 실행합니다.

## 구조

```
src/
  main.tsx     진입점: QueryClient·라우터·인증 Provider 연결
  app/         App(라우트·가드), QueryClient 설정
  pages/       라우트 진입 화면만. 데이터 접근은 features의 api를 사용
  features/    도메인별 코드 — API, 상태 owner, 쿼리 키, 화면 조각
    auth/            세션·토큰, AuthProvider, 콜백 처리, 로그인 버튼
    consent/         외부 AI 전송 동의 API·흐름·모달
    projects/        프로젝트 API, 분석 요청 owner, 개요 조회, 온보딩 단계
    repositories/    GitHub 저장소 조회·연결 API, 필터, 연결된 저장소 카드
    pull-requests/   PR 목록·상세·재분석, 분석 관리 드로어
    feature-spec/    기능명세서 업로드·교체, 기능대조 탭 컨테이너
    feature-review/  기능 검토 API·owner·쿼리, 검토 화면
    feature-match/   기능대조 API·owner·쿼리, 결과·근거·PR 연결 화면
    landing/         랜딩 결과 예시
  components/  공통 UI (ui/, layout/, Markdown) — API 호출 없음
  lib/         API 경로·응답 헬퍼, 포맷, 클래스 병합, 공통 훅
tests/         모듈 단위 테스트 (helpers/sources.mjs로 src 모듈을 변환해 실행)
```

의존 방향은 `app → pages → features → components·lib` 한쪽으로만 흐릅니다. `components/`·`lib/`는 `features/`·`pages/`·`app/`을, `features/`는 `pages/`·`app/`을 import할 수 없으며 ESLint(`no-restricted-imports`)가 이를 검사합니다. 테스트가 직접 불러오는 모듈(각 feature의 `api.ts`와 owner 등)은 서로를 `.ts` 확장자를 붙여 import합니다.

라우트와 인증 흐름은 [`src/pages/README.md`](src/pages/README.md), 공통 컴포넌트 사용법은 [`src/components/README.md`](src/components/README.md)를 참고하세요.

## 배포

- 프로덕션 호스팅은 SPA 라우트(`/projects`, `/auth/callback` 등)에 대해 `index.html`을 서빙해야 합니다.
- `/auth/token`, `/auth/refresh`는 SPA fallback보다 먼저 백엔드로 프록시해야 합니다. 백엔드 refresh 쿠키는 `Domain` 없이 `Path=/auth`여야 프론트 출처에서 발급하고 다시 보낼 수 있습니다.
- 백엔드의 CORS 허용 origin, 콜백 URL, 프론트엔드 리다이렉트, 쿠키 `Secure`/`SameSite` 설정을 배포 환경에 맞게 구성해야 합니다.

## 기여

이슈와 PR은 `.github/`의 템플릿을 사용합니다. 커밋 메시지는 `type: 설명 (#이슈번호)` 형식을 따릅니다.
