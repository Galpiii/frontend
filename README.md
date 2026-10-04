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
  auth/        인증 상태와 세션 (AuthProvider, session, bootstrap)
  components/  공통 UI (ui/, layout/) — API 호출 없음
  lib/         API 경로·응답 헬퍼, 클래스 병합, 훅
  pages/       화면 단위 컴포넌트
tests/         인증 흐름 테스트
```

라우트와 인증 흐름은 [`src/pages/README.md`](src/pages/README.md), 공통 컴포넌트 사용법은 [`src/components/README.md`](src/components/README.md)를 참고하세요.

## 배포

- 프로덕션 호스팅은 SPA 라우트(`/projects`, `/auth/callback` 등)에 대해 `index.html`을 서빙해야 합니다.
- 백엔드의 CORS 허용 origin, 콜백 URL, 프론트엔드 리다이렉트, 쿠키 `Secure`/`SameSite` 설정을 배포 환경에 맞게 구성해야 합니다.

## 기여

이슈와 PR은 `.github/`의 템플릿을 사용합니다. 커밋 메시지는 `type: 설명 (#이슈번호)` 형식을 따릅니다.
