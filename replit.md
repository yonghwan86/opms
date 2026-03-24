# OPMS — 유가 모니터링 상황판 (Oil Price Monitoring System)

## 시스템 개요

**한국석유공사 계열 조직을 위한 유가 통합 관제 플랫폼.**
국내 소매 유가 이상징후를 자동 탐지하고, 국제 원유·석유제품 가격과 정유사 공급가를 함께 수집·분석해 관할 지역 담당자에게 실시간 제공한다.

- **배포 주소:** `opms.kpetro.or.kr`
- **마스터 계정:** username=`ax` / password=`kpetro!23`
- **운영 환경:** Replit (PostgreSQL 내장 DB) → Replit 배포

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| **프론트엔드** | React 18 + TypeScript, Vite, TailwindCSS, shadcn/ui, TanStack Query v5, Wouter |
| **백엔드** | Node.js + Express.js + TypeScript |
| **데이터베이스** | PostgreSQL (Drizzle ORM, `drizzle-zod` 유효성 검사) |
| **인증** | express-session + connect-pg-simple (쿠키 기반 서버 세션) |
| **크롤링/자동화** | Playwright (Chromium 헤드리스), Axios, Cheerio |
| **스케줄러** | node-cron (Asia/Seoul 시간대) |
| **알림** | Web Push API (PWA 푸시 알림) |
| **기타** | bcrypt, iconv-lite (EUC-KR 디코딩), multer (파일 업로드), xlsx |

---

## 권한 구조

| 역할 | 설명 |
|---|---|
| **MASTER** | 전체 시스템 관리 — 본부/팀/사용자/지역권한 관리, 모든 로그 조회, 유가 수동 수집, 관리자 기능 전체 |
| **HQ_USER** | 제한적 접근 — 자신이 속한 본부+팀에 할당된 지역 데이터만 조회 가능 |

> 사이드바 메뉴는 역할에 따라 자동으로 필터링됩니다. `masterOnly` 항목은 HQ_USER에게 표시되지 않습니다.

---

## 조직 구조

```
본부 (headquarters)
  └─ 팀 (teams)
       └─ 사용자 (users)
            └─ 지역 권한 (hq_team_region_permissions)
                  → 시·도·시·군·구 단위 접근 제어
```

---

## 페이지 구조

### 공통 접근
| 경로 | 페이지 | 설명 |
|---|---|---|
| `/login` | 로그인 | username 기반 2단계 로그인 (존재 확인 → 비밀번호) |
| `/public` | 공개 대시보드 | 비인증 접근 가능한 유가 현황 요약 화면 |

### 로그인 후 공통 접근
| 경로 | 페이지 | 설명 |
|---|---|---|
| `/` | 메인 대시보드 | WTI/브렌트/두바이 국제유가, 환율, 국내 평균유가, 지역별 현황, 날씨 |
| `/ceiling-trend` | 최고가격제 변동추이 | 주유소별 상한가 대비 실판매가 추이 분석 |
| `/oil-prices` | 유가 분석 | 국내 이상징후 탐지 — MAX/MIN/CHANGE/DIFF top 10 |
| `/station-search` | 주유소 검색 | 주유소명·지역별 검색, 가격 이력 조회 |
| `/region-permissions` | 본부 권한 관리 | 본부+팀 조합별 관할 지역(시도·시군구) 지정 |

### MASTER 전용
| 경로 | 페이지 | 설명 |
|---|---|---|
| `/users` | 사용자 관리 | 사용자 생성·수정·삭제·비밀번호 초기화 |
| `/users/upload` | 사용자 엑셀 업로드 | xlsx 일괄 등록 |
| `/oil-prices/upload` | CSV 업로드 | 국내 유가 CSV 수동 업로드 (청크 방식 대용량 지원) |
| `/logs/login` | 로그인 로그 | 로그인 성공/실패 이력 |
| `/logs/audit` | 감사 로그 | 사용자 작업(생성·수정·삭제) 이력 |
| `/logs/page-views` | 페이지 뷰 로그 | 사용자별 페이지 방문 기록 |
| `/logs/oil-collection` | 유가 수집 이력 | 자동·수동 수집 결과 로그 |
| `/logs/satisfaction` | 만족도 조사 결과 | 사용자 만족도 응답 내역 |

---

## 데이터베이스 테이블

### 조직·권한
| 테이블 | 설명 |
|---|---|
| `headquarters` | 본부 (id, name, code, createdAt, updatedAt) |
| `teams` | 팀 (id, name, code, hqId→headquarters, createdAt, updatedAt) |
| `users` | 사용자 (id, username, password, role, hqId, teamId, mustChangePassword, badgeCount, createdAt, updatedAt) |
| `hq_team_region_permissions` | 본부+팀 조합별 지역 권한 (id, hqId, teamId, sido, sigungu, createdAt) |

### 로그
| 테이블 | 설명 |
|---|---|
| `login_logs` | 로그인 이력 (성공/실패, IP, User-Agent) |
| `audit_logs` | 감사 로그 (사용자 작업, 대상 entity/id, 변경 전후 값) |
| `page_views` | 페이지 뷰 기록 (userId, path, createdAt) |
| `oil_collection_logs` | 유가 수집 이력 (jobType, status, targetDate, rawCount, analysisCount, rawDurationMs, analysisDurationMs, errorMessage) |
| `user_satisfactions` | 사용자 만족도 응답 (userId, rating, comment) |

### 국내 유가 데이터
| 테이블 | 설명 |
|---|---|
| `oil_price_raw` | Opinet CSV 원본 (stationId, date, brand, fuelType, price, sido, sigungu 등) |
| `oil_price_analysis` | 분석 결과 (type: MAX_MIN/CHANGE/DIFF, subType, fuelType, rank, stationId, price 등) |
| `oil_ceiling_prices` | 최고가격 기준 (stationId, fuelType, ceilingPrice, effectiveDate) |
| `oil_weekly_supply_prices` | 정유사 주간 공급가 (week, company, premiumGasoline, gasoline, diesel, kerosene) |

### 국제 유가 데이터
| 테이블 | 설명 |
|---|---|
| `intl_fuel_prices` | 국제 원유+석유제품 (date PK, gasoline, diesel, kerosene, wti, brent, dubai, wti_change, brent_change, dubai_change, created_at) |

### 주유소·푸시
| 테이블 | 설명 |
|---|---|
| `gas_stations_master` | 주유소 마스터 (stationId PK, name, brand, address, lat, lng, sido, sigungu 등) |
| `push_subscriptions` | PWA 푸시 구독 (endpoint, auth, p256dh, userId) |

---

## 자동 수집 파이프라인

### 수집 종류 및 스케줄

| # | 수집 대상 | 데이터 출처 | 수집 주기 | 로그 jobType |
|---|---|---|---|---|
| 1 | **국내 소매 유가 — 오전 확정** | Opinet CSV (Playwright) | 매일 **09:30** KST | `scheduled_morning` |
| 2 | **국내 소매 유가 — 오후 잠정** | Opinet CSV (Playwright) | 매일 **16:30** KST (당일 데이터 없을 때만) | `scheduled_afternoon` |
| 3 | **국내 평균 유가** | Opinet API | 매일 **09·12·16·19시** + 서버 시작 직후 | *(로그 없음)* |
| 4 | **국제 원유+석유제품** | Petronet HTML 크롤링 | **화~토 08:30** KST | `intl_price` |
| 5 | **정유사 주간 공급가** | Opinet 스크래핑 | **금 13:00** KST (공휴일 시 월 13:00) | `weekly_supply_price` |

### 시작 복구 로직 (서버 재시작 대응)
서버가 예기치 않게 재시작되어 정기 수집을 놓쳤을 때 자동 보완합니다.

| 복구 대상 | 조건 | 동작 |
|---|---|---|
| 국내 소매 유가 | KST 09:30 이후 + 오늘 오전 수집 로그 없음 | 즉시 오전 수집 실행 |
| 국제 원유+석유제품 | KST 08:30 이후 + 화~토 + 최근 5일 이내 intl 데이터 없음 | 즉시 크롤링 실행 |

### 재시도 전략

| 수집 종류 | 재시도 횟수 | 간격 | 실패 시 알림 |
|---|---|---|---|
| 국내 소매 유가 | 최대 2회 | 10분 후, 20분 후 | MASTER 푸시 알림 |
| 국제 유가+석유제품 | 최대 2회 | 1시간 후, 2시간 후 | (콘솔 로그) |
| 정유사 주간 공급가 | 최대 2회 | 1시간 후, 2시간 후 | MASTER 푸시 알림 |

### 유가 수집 이력 — jobType 목록

| jobType | 의미 |
|---|---|
| `scheduled_morning` | 오전 확정 수집 |
| `scheduled_morning_retry1/2` | 오전 1·2차 재시도 |
| `scheduled_afternoon` | 오후 잠정 수집 |
| `scheduled_afternoon_retry1/2` | 오후 1·2차 재시도 |
| `manual` | 수동 수집 (관리자 직접 실행) |
| `reanalyze` | 분석 재실행 (원본 재처리) |
| `weekly_supply_price` | 정유사 주간 공급가 |
| `intl_price` | 국제 유가+석유제품 |
| `intl_price_retry1/2` | 국제 가격 1·2차 재시도 |

### 국내 유가 수집 상세 흐름

```
1. Playwright Chromium으로 Opinet 접속
2. NetFunnel B7 토큰 처리 (자동화 차단 우회)
3. fn_Download(6) 직접 호출 → EUC-KR CSV 다운로드
4. iconv-lite로 EUC-KR → UTF-8 변환 및 파싱 (0값=미판매 처리)
5. oil_price_raw 테이블 저장 (주유소별 일별 원본)
6. 분석 실행 (oilAnalyzer):
   - MAX_MIN: 유종별 최고가·최저가 top 10
   - CHANGE: 전일 대비 상승·하락 top 10
   - DIFF: 휘발유-경유 가격차 크기 top 10
7. oil_price_analysis 저장
8. 성공 시 전체 구독자 PWA 푸시 (하루 1회 제한)
```

---

## 서비스 파일

| 파일 | 역할 |
|---|---|
| `server/services/oilScraper.ts` | Playwright로 Opinet CSV 다운로드 |
| `server/services/oilParser.ts` | EUC-KR CSV 파싱 및 정제 |
| `server/services/oilAnalyzer.ts` | MAX_MIN/CHANGE/DIFF 분석 엔진 |
| `server/services/oilScheduler.ts` | 전체 수집 스케줄 관리, 복구 로직, 재시도 |
| `server/services/intlPriceCrawler.ts` | Petronet 국제유가 HTML 크롤링 + CSV 수동 파싱 |
| `server/services/weeklySupplyScraper.ts` | Opinet 정유사 주간공급가 스크래핑 |
| `server/services/opinetApi.ts` | Opinet API 호출 (평균유가, 주유소 좌표) |
| `server/services/externalData.ts` | 외부 API (WTI 시세, 환율, 날씨) |
| `server/services/pushService.ts` | Web Push 구독 관리 및 전송 |
| `server/services/koreanHoliday.ts` | 한국 공휴일 판별 (주간공급가 스케줄 조정용) |
| `server/services/stationCoordScraper.ts` | 주유소 GIS 좌표 일괄 수집 (gas_stations_master) |

---

## 주요 API 엔드포인트

### 인증
| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/auth/check-user` | username 존재 여부 및 초기 설정 필요 여부 확인 |
| `POST` | `/api/auth/login` | 로그인 (세션 발급) |
| `POST` | `/api/auth/logout` | 로그아웃 |
| `POST` | `/api/auth/setup-password` | 최초 비밀번호 설정 |
| `GET` | `/api/auth/me` | 현재 로그인 사용자 정보 |

### 조직 관리 (MASTER)
| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/headquarters` | 본부 CRUD |
| `GET/POST/PATCH/DELETE` | `/api/teams` | 팀 CRUD |
| `GET/POST/PATCH/DELETE` | `/api/users` | 사용자 CRUD |
| `POST` | `/api/users/:id/reset-password` | 비밀번호 초기화 |
| `POST` | `/api/users/upload-excel` | 사용자 엑셀 일괄 등록 |
| `GET` | `/api/users/upload-template` | 등록 템플릿 다운로드 |
| `GET/POST/PATCH/DELETE` | `/api/hq-team-region-permissions` | 지역 권한 CRUD |

### 국내 유가
| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/oil-prices/refresh` | 유가 수동 수집·분석 (MASTER) |
| `POST` | `/api/oil-prices/reanalyze` | 기존 원본 재분석 (MASTER) |
| `GET` | `/api/oil-prices/analysis` | 분석 결과 (type/subType/fuelType/sido/date 필터) |
| `GET` | `/api/oil-prices/available-dates` | 수집된 날짜 목록 |
| `GET` | `/api/oil-prices/latest-date` | 최신 수집 날짜 |
| `GET` | `/api/oil-prices/top-stations` | TOP5 주유소 (RISE/FALL/HIGH/LOW) |
| `POST` | `/api/oil-prices/upload-csv` | CSV 수동 업로드 (단일/청크 방식) |

### 대시보드
| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/dashboard/wti` | WTI 국제유가 + 3개월 시계열 |
| `GET` | `/api/dashboard/exchange-rate` | 원/달러 환율 |
| `GET` | `/api/dashboard/fuel-stats` | 당일 국내 평균유가 통계 |
| `GET` | `/api/dashboard/regional-averages` | 시·도별 평균 유가 (HQ_USER 자동 필터) |
| `GET` | `/api/dashboard/regional-price-history` | 관할 지역 유가 시계열 |
| `GET` | `/api/dashboard/domestic-history` | 전국 국내 유가 시계열 |
| `GET` | `/api/dashboard/ceiling-prices` | 최고가격 기준 조회 |
| `POST` | `/api/admin/ceiling-prices` | 최고가격 기준 설정 (MASTER) |

### 국제 유가 (MASTER 관리)
| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/admin/intl-fuel-prices/crawl` | Petronet 즉시 크롤링 |
| `POST` | `/api/admin/intl-fuel-prices/upload` | CSV 수동 업로드 |
| `POST` | `/api/admin/intl-fuel-prices/crude-upsert` | 원유가격 직접 입력 |
| `GET` | `/api/public/intl-vs-domestic` | 국제-국내 가격 연동 차트 데이터 |

### 주유소 검색
| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/station-search` | 주유소 검색 (이름·지역·브랜드) |
| `GET` | `/api/station-search/suggest` | 주유소 자동완성 |
| `GET` | `/api/station-search/subregions` | 시·군·구 목록 |

### 로그 조회 (MASTER)
| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/login-logs` | 로그인 이력 |
| `GET` | `/api/audit-logs` | 감사 로그 |
| `GET` | `/api/logs/page-view` | 페이지 뷰 로그 |
| `GET` | `/api/oil-collection-logs` | 유가 수집 이력 |
| `GET` | `/api/logs/login/csv` | 로그인 로그 CSV 다운로드 |
| `GET` | `/api/logs/audit/csv` | 감사 로그 CSV 다운로드 |

### 공개 API (인증 불필요 — `/public` 대시보드용)
| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/public/wti` | WTI 시세 |
| `GET` | `/api/public/exchange-rate` | 환율 |
| `GET` | `/api/public/fuel-stats` | 전국 평균 유가 |
| `GET` | `/api/public/regional-averages` | 지역별 평균 유가 |
| `GET` | `/api/public/ceiling-prices` | 최고가격 기준 |
| `GET` | `/api/public/ceiling-trend` | 최고가격 추이 |
| `GET` | `/api/public/domestic-history` | 국내 유가 시계열 |
| `GET` | `/api/public/intl-vs-domestic` | 국제-국내 연동 데이터 |

### PWA 푸시
| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/push/vapid-public-key` | VAPID 공개키 조회 |
| `POST` | `/api/push/subscribe` | 푸시 구독 등록 |

---

## 대시보드 화면 구성

### 메인 대시보드 (`dashboard.tsx`)
- **상단 카드:** WTI·브렌트·두바이 국제원유가 + 환율 (실시간)
- **국내 평균 유가:** 휘발유·경유·등유 전국 평균 (Opinet API)
- **국제제품가격 차트:** 국제 휘발유·경유·등유 시계열 (유종 선택 버튼)
- **국제-국내 연동 차트:** WTI·브렌트·두바이 선택 + 국내 유가 비교 시계열
- **지역별 유가 현황:** 시·도별 평균 비교

### 공개 대시보드 (`public-dashboard.tsx`)
- 로그인 없이 접근 가능한 요약 화면
- WTI/브렌트/두바이 선택, 국내 유가 현황, 최고가격 현황 표시

---

## PWA 푸시 알림 전략

| 상황 | 수신 대상 | 내용 |
|---|---|---|
| 오전 확정 수집 성공 | 전체 구독자 (하루 1회) | "전일 유가 확정값이 업데이트되었습니다." |
| 오후 잠정 수집 성공 | 전체 구독자 (하루 1회) | "오늘 유가 데이터(잠정)가 업데이트되었습니다." |
| 수집 실패 / 재시도 실패 | MASTER 계정만 | 실패 원인 포함 알림 |
| 주간 공급가 업데이트 | 전체 구독자 | "N월 M주 공급가격 데이터가 업데이트되었습니다." |
| 주간 공급가 수집 실패 | MASTER 계정만 | 실패 원인 포함 알림 |

---

## 주요 파일 구조

```
server/
├── index.ts              # 서버 진입점 (Express 앱, 세션 설정)
├── db.ts                 # Drizzle ORM PostgreSQL 연결
├── initDb.ts             # DB 테이블 DDL 초기화 (시작 시 자동 실행)
├── seed.ts               # 기본 시드 데이터 (마스터 계정 등)
├── storage.ts            # 데이터 접근 레이어 (IStorage 인터페이스)
├── routes.ts             # API 라우트 전체 (인증/권한 미들웨어 포함)
└── services/
    ├── oilScheduler.ts   # 스케줄러 통합 관리 (모든 cron 등록)
    ├── oilScraper.ts     # Opinet CSV 다운로드 (Playwright)
    ├── oilParser.ts      # CSV 파싱 (EUC-KR → UTF-8)
    ├── oilAnalyzer.ts    # 유가 이상징후 분석 엔진
    ├── intlPriceCrawler.ts    # Petronet 국제유가 크롤링
    ├── weeklySupplyScraper.ts # 정유사 주간공급가 스크래핑
    ├── opinetApi.ts      # Opinet API (전국 평균유가)
    ├── externalData.ts   # 외부 API (WTI, 환율, 날씨)
    ├── pushService.ts    # PWA 푸시 알림
    ├── koreanHoliday.ts  # 공휴일 판별
    └── stationCoordScraper.ts # 주유소 GIS 좌표 수집

shared/
└── schema.ts             # Drizzle 스키마 + Zod 유효성 + 타입 정의

client/src/
├── App.tsx               # 라우터 및 페이지 등록
├── pages/
│   ├── login.tsx               # 로그인
│   ├── dashboard.tsx           # 메인 대시보드
│   ├── public-dashboard.tsx    # 공개 대시보드
│   ├── oil-prices.tsx          # 유가 분석 (이상징후 탐지)
│   ├── oil-upload.tsx          # CSV 수동 업로드
│   ├── ceiling-trend.tsx       # 최고가격 추이
│   ├── station-search.tsx      # 주유소 검색
│   ├── region-permissions.tsx  # 지역 권한 관리
│   ├── users.tsx               # 사용자 관리
│   ├── users-upload.tsx        # 사용자 엑셀 업로드
│   ├── login-logs.tsx          # 로그인 로그
│   ├── audit-logs.tsx          # 감사 로그
│   ├── page-view-logs.tsx      # 페이지 뷰 로그
│   ├── oil-collection-logs.tsx # 유가 수집 이력
│   ├── satisfaction-log.tsx    # 만족도 조사 결과
│   └── my-info.tsx             # 내 정보
└── components/
    └── layout.tsx        # 레이아웃 + 사이드바 (역할별 메뉴 필터링)
```

---

## 유종 표준 색상

| 유종 | 색상 코드 |
|---|---|
| 휘발유 (Gasoline) | `#eab308` (황색) |
| 경유 (Diesel) | `#22c55e` (녹색) |
| 등유 (Kerosene) | `#38bdf8` (하늘색) |
| WTI | `#f97316` (주황) |
| 브렌트 | `#a855f7` (보라) |
| 두바이 | `#14b8a6` (청록) |

---

## 개발 참고사항

- **로컬 실행:** `npm run dev` — Express(백엔드) + Vite(프론트엔드) 동시 시작 (포트 5000)
- **DB 스키마 변경:** `npm run db:push` — Drizzle 스키마를 DB에 반영
- **Chromium 경로:** `/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium`
- **환경변수:** `DATABASE_URL`, `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- **API 시간대:** 모든 cron은 `Asia/Seoul` 기준. KST 변환은 UTC+9 직접 계산 (`getKSTNow()`)
- **HQ_USER 지역 필터:** API 응답 단에서 자동 적용 — 프론트엔드 추가 처리 불필요
