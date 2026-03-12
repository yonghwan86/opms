# 유가관리 시스템 - 권한 관리 플랫폼

## 개요
조직 구조(본부/팀/사용자) 및 지역 접근 권한을 통합 관리하는 어드민 웹 애플리케이션.
Opinet 유가 정보 자동 수집·분석·DB 저장 기능 포함. 향후 웹 표시 및 PWA 푸시 알림으로 확장 예정.

## 기술 스택
- **Frontend:** React + TypeScript + Vite, TailwindCSS, shadcn/ui, TanStack Query, Wouter
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL (Drizzle ORM)
- **Auth:** express-session (쿠키 기반 세션)
- **기타:** bcrypt (비밀번호 해싱), xlsx (엑셀 처리), multer (파일 업로드), axios (HTTP), node-cron (스케줄러), iconv-lite (EUC-KR 디코딩)

## 권한 구조
- **MASTER:** 전체 시스템 관리 (본부/팀/사용자/지역권한/로그 조회)
- **HQ_USER:** 자신의 본부+팀 조합에 할당된 지역만 조회 가능

## 기본 계정
- MASTER: username=`ax` / `kpetro!23` (이메일 없음, NULL)
- HQ_USER: username=`honggildong` / 초기 비밀번호 설정 필요

## DB 테이블
- `headquarters` - 본부
- `teams` - 팀 (본부에 소속)
- `users` - 사용자 (본부+팀에 소속)
- `hq_team_region_permissions` - 본부+팀 조합별 지역 권한
- `login_logs` - 로그인 이력
- `audit_logs` - 감사 로그
- `oil_price_raw` - Opinet 유가 원본 데이터 (주유소별 일별 가격)
- `oil_price_analysis` - 유가 분석 결과 (MAX_MIN/CHANGE/DIFF, top 10)

## 유가 수집 파이프라인
- **소스:** Opinet (www.opinet.co.kr) EUC-KR CSV
- **수집:** `server/services/oilScraper.ts` — Playwright 헤드리스 Chromium으로 자동화 다운로드
  - `fn_Download(6)` 직접 호출 (NetFunnel B7 토큰 자동 처리, confirm 다이얼로그 자동 수락)
  - Chromium: `/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium`
- **파싱:** `server/services/oilParser.ts` — iconv-lite EUC-KR→UTF-8, 0값=미판매 처리
- **분석:** `server/services/oilAnalyzer.ts`
  - MAX_MIN: 연료종류별 최고가/최저가 top 10
  - CHANGE: 전일대비 가격 상승/하락 top 10
  - DIFF: 휘발유-경유 가격차 큰/작은 top 10
- **스케줄:** `server/services/oilScheduler.ts` — 매일 오전 9시 10분 KST 자동 실행 (`"10 9 * * *"`)
  - 시작 복구: 서버 기동 시 KST 9시 이후이면 오늘 분석 데이터 유무 확인 후 자동 수집
  - 재시도: 수집 실패 또는 분석 0건이면 10분 후 자동 재시도 1회
  - 사용자 푸시: 수집 성공(analysisCount > 0) 시 전체 구독자에게 하루 1회만 발송 (lastUserPushDate 메모리 변수)
  - 마스터 푸시: 수집 실패/재시도 실패 시 MASTER 구독자에게만 알림 발송
- **수동 실행:** `POST /api/oil-prices/refresh` (MASTER)

## 인증 (로그인) 흐름
- `POST /api/auth/check-user` — `{username}` 전송, 사용자 존재 여부 및 초기설정 필요 여부 확인
- `POST /api/auth/login` — `{username, password}` 전송, 세션 발급
- `POST /api/auth/setup-password` — `{username, newPassword}`, 최초 비밀번호 설정 (mustChangePassword=true 시)
- DB: `users.email` 컬럼 nullable (현재 모두 NULL), `users.username` 으로 식별

## 주요 API
- `POST /api/auth/login` - 로그인 (username 기반)
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/me` - 현재 사용자
- `GET/POST/PATCH/DELETE /api/headquarters` - 본부 CRUD
- `GET/POST/PATCH/DELETE /api/teams` - 팀 CRUD
- `GET/POST/PATCH/DELETE /api/users` - 사용자 CRUD
- `POST /api/users/:id/reset-password` - 비밀번호 초기화
- `POST /api/users/upload-excel` - 엑셀 업로드
- `GET /api/users/upload-template` - 샘플 템플릿 다운로드
- `GET/POST/PATCH/DELETE /api/hq-team-region-permissions` - 지역 권한
- `GET /api/login-logs` - 로그인 로그
- `GET /api/audit-logs` - 감사 로그
- `GET /api/dashboard/stats` - 대시보드 통계
- `POST /api/oil-prices/refresh` - 유가 수동 수집·분석·저장 (MASTER)
- `GET /api/oil-prices/latest-date` - 최근 수집 날짜
- `GET /api/oil-prices/analysis` - 분석 결과 조회 (type/subType/fuelType/sido/date 필터)
- `GET /api/dashboard/wti` - WTI 국제 유가 및 3개월 시계열
- `GET /api/dashboard/exchange-rate` - 원/달러 환율
- `GET /api/dashboard/fuel-stats` - 당일 국내 유가 통계 (평균+편차)
- `GET /api/dashboard/regional-averages` - 시/도별 평균 유가 (HQ_USER는 자동 필터링)
- `GET /api/dashboard/domestic-history` - 전국 국내 유가 시계열 (WTI 연동 분석용)
- `GET /api/dashboard/regional-price-history` - 관할 지역 유가 시계열 (HQ_USER 자동 필터, 지역별 추이 탭용)
- `GET /api/oil-prices/top-stations` - TOP5 주유소 (type=RISE/FALL/HIGH/LOW)

## 페이지 구조
- `/login` - 로그인
- `/` - 대시보드 (MASTER)
- `/headquarters` - 본부 관리 (MASTER)
- `/teams` - 팀 관리 (MASTER)
- `/users` - 사용자 관리 (MASTER)
- `/users/upload` - 엑셀 업로드 (MASTER)
- `/region-permissions` - 지역 권한 관리 (전체)
- `/logs/login` - 로그인 로그 (MASTER)
- `/logs/audit` - 감사 로그 (MASTER)
- `/my-info` - 내 정보 (HQ_USER)

## 파일 구조
- `server/initDb.ts` - DB 테이블 DDL 초기화
- `server/seed.ts` - 기본 시드 데이터
- `server/db.ts` - Drizzle ORM 연결
- `server/storage.ts` - 데이터 접근 레이어
- `server/routes.ts` - API 라우트 (인증/권한 미들웨어 포함)
- `server/services/oilScraper.ts` - Opinet CSV 다운로드
- `server/services/oilParser.ts` - CSV 파싱 (EUC-KR)
- `server/services/oilAnalyzer.ts` - 유가 분석 엔진
- `server/services/oilScheduler.ts` - 정기 수집 스케줄러
- `shared/schema.ts` - Drizzle 스키마 및 타입
- `client/src/hooks/use-auth.ts` - 인증 훅
- `client/src/components/layout.tsx` - 레이아웃 및 사이드바
