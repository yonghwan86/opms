import { pgTable, text, varchar, boolean, timestamp, integer, serial, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 본부 (Headquarters) ───────────────────────────────────────────────────────
export const headquarters = pgTable("headquarters", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHeadquartersSchema = createInsertSchema(headquarters).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHeadquarters = z.infer<typeof insertHeadquartersSchema>;
export type Headquarters = typeof headquarters.$inferSelect;

// ─── 팀 (Teams) ────────────────────────────────────────────────────────────────
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  headquartersId: integer("headquarters_id").notNull().references(() => headquarters.id),
  name: text("name").notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// ─── 사용자 (Users) ────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  // passwordHash는 nullable: 최초 생성/초기화 시 null, 비밀번호 설정 후 해시값 저장
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  email: varchar("email", { length: 255 }).unique(),
  positionName: text("position_name"),
  departmentName: text("department_name"),
  role: varchar("role", { length: 20 }).notNull().default("HQ_USER"),
  headquartersId: integer("headquarters_id").references(() => headquarters.id),
  teamId: integer("team_id").references(() => teams.id),
  enabled: boolean("enabled").notNull().default(true),
  // 최초 로그인 시 비밀번호 설정 필요 여부 (엑셀 임포트/초기화 후 true)
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // PWA 아이콘 배지 카운트 (알림 수신 시 증가, 앱 오픈 시 초기화)
  badgeCount: integer("badge_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── 본부 권한 (HQ+Team Region Permissions) ──────────────────────────────────
// 본부+팀 조합에 접근 가능한 지역을 도/시/군/구 단위로 설정
export const hqTeamRegionPermissions = pgTable("hq_team_region_permissions", {
  id: serial("id").primaryKey(),
  headquartersId: integer("headquarters_id").notNull().references(() => headquarters.id),
  teamId: integer("team_id").notNull().references(() => teams.id),
  // 행정구역 계층 (도 → 시 → 군 → 구 순서로 상세화)
  doName: text("do_name"),        // 도/특별시/광역시 (예: 서울특별시, 경기도)
  siName: text("si_name"),        // 시 (예: 수원시, 성남시)
  gunName: text("gun_name"),      // 군 (예: 가평군, 양평군)
  guName: text("gu_name"),        // 구 (예: 강남구, 종로구)
  // 생성된 전체 지역명 (도+시+군+구 조합 자동 생성)
  regionName: text("region_name").notNull(),
  // 기존 코드 필드 (호환성 유지)
  sidoCode: varchar("sido_code", { length: 20 }),
  sigunCode: varchar("sigun_code", { length: 20 }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHqTeamRegionPermissionSchema = createInsertSchema(hqTeamRegionPermissions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHqTeamRegionPermission = z.infer<typeof insertHqTeamRegionPermissionSchema>;
export type HqTeamRegionPermission = typeof hqTeamRegionPermissions.$inferSelect;

// ─── 로그인 로그 (Login Logs) ──────────────────────────────────────────────────
export const loginLogs = pgTable("login_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  loginAt: timestamp("login_at").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
});

export type LoginLog = typeof loginLogs.$inferSelect;

// ─── 감사 로그 (Audit Logs) ──────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 100 }),
  targetId: integer("target_id"),
  detailJson: text("detail_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── 페이지 뷰 로그 (Page Views) ──────────────────────────────────────────────
export const pageViews = pgTable("page_views", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  page: varchar("page", { length: 100 }).notNull(),
  device: varchar("device", { length: 10 }).notNull().default("pc"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PageView = typeof pageViews.$inferSelect;

// ─── 유가 원본 데이터 (Oil Price Raw) ─────────────────────────────────────────
export const oilPriceRaw = pgTable("oil_price_raw", {
  id: serial("id").primaryKey(),
  stationId: varchar("station_id", { length: 20 }).notNull(),
  stationName: text("station_name").notNull(),
  address: text("address"),
  region: text("region").notNull(),
  sido: text("sido").notNull(),
  date: varchar("date", { length: 8 }).notNull(),
  brand: text("brand"),
  isSelf: boolean("is_self").notNull().default(false),
  premiumGasoline: integer("premium_gasoline"),
  gasoline: integer("gasoline"),
  diesel: integer("diesel"),
  kerosene: integer("kerosene"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  stationDateIdx: uniqueIndex("oil_price_raw_station_date_idx").on(table.stationId, table.date),
}));

export const insertOilPriceRawSchema = createInsertSchema(oilPriceRaw).omit({ id: true, createdAt: true });
export type InsertOilPriceRaw = z.infer<typeof insertOilPriceRawSchema>;
export type OilPriceRaw = typeof oilPriceRaw.$inferSelect;

// ─── 유가 분석 결과 (Oil Price Analysis) ────────────────────────────────────
// analysisType: MAX_MIN (최고/최저가), CHANGE (전일대비), DIFF (휘발유-경유차이)
// subType: HIGH / LOW (MAX_MIN), RISE / FALL (CHANGE), WIDE / NARROW (DIFF)
export const oilPriceAnalysis = pgTable("oil_price_analysis", {
  id: serial("id").primaryKey(),
  analysisDate: varchar("analysis_date", { length: 8 }).notNull(),
  analysisType: varchar("analysis_type", { length: 20 }).notNull(),
  subType: varchar("sub_type", { length: 20 }).notNull(),
  fuelType: varchar("fuel_type", { length: 20 }).notNull(),
  rank: integer("rank").notNull(),
  region: text("region"),
  sido: text("sido"),
  stationName: text("station_name"),
  stationId: varchar("station_id", { length: 20 }),
  price: integer("price"),
  priceChange: integer("price_change"),
  priceDiff: integer("price_diff"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOilPriceAnalysisSchema = createInsertSchema(oilPriceAnalysis).omit({ id: true, createdAt: true });
export type InsertOilPriceAnalysis = z.infer<typeof insertOilPriceAnalysisSchema>;
export type OilPriceAnalysis = typeof oilPriceAnalysis.$inferSelect;

// ─── 석유 최고가격제 (Oil Ceiling Prices) ────────────────────────────────────
export const oilCeilingPrices = pgTable("oil_ceiling_prices", {
  id: serial("id").primaryKey(),
  gasoline: numeric("gasoline", { precision: 10, scale: 2 }),
  diesel: numeric("diesel", { precision: 10, scale: 2 }),
  kerosene: numeric("kerosene", { precision: 10, scale: 2 }),
  effectiveDate: text("effective_date").notNull(),
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOilCeilingPricesSchema = createInsertSchema(oilCeilingPrices).omit({ id: true, createdAt: true });
export type InsertOilCeilingPrices = z.infer<typeof insertOilCeilingPricesSchema>;
export type OilCeilingPrices = typeof oilCeilingPrices.$inferSelect;

// ─── 유가 수집 이력 로그 (Oil Collection Logs) ───────────────────────────────
export const oilCollectionLogs = pgTable("oil_collection_logs", {
  id: serial("id").primaryKey(),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  // scheduled_morning | scheduled_afternoon | manual | reanalyze | retry_1st | retry_2nd
  status: varchar("status", { length: 20 }).notNull(),
  // success | failed | partial (원본 성공, 분석 실패)
  targetDate: varchar("target_date", { length: 8 }),
  yesterdayDate: varchar("yesterday_date", { length: 8 }),
  rawCount: integer("raw_count").default(0),
  analysisCount: integer("analysis_count").default(0),
  rawDurationMs: integer("raw_duration_ms"),
  analysisDurationMs: integer("analysis_duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOilCollectionLogSchema = createInsertSchema(oilCollectionLogs).omit({ id: true, createdAt: true });
export type InsertOilCollectionLog = z.infer<typeof insertOilCollectionLogSchema>;
export type OilCollectionLog = typeof oilCollectionLogs.$inferSelect;

// ─── 만족도 조사 (User Satisfactions) ────────────────────────────────────────
export const userSatisfactions = pgTable("user_satisfactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: varchar("rating", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSatisfactionSchema = createInsertSchema(userSatisfactions).omit({ id: true, createdAt: true });
export type InsertUserSatisfaction = z.infer<typeof insertUserSatisfactionSchema>;
export type UserSatisfaction = typeof userSatisfactions.$inferSelect;

// ─── 주간공급가격 (Oil Weekly Supply Prices) ─────────────────────────────────
export const oilWeeklySupplyPrices = pgTable("oil_weekly_supply_prices", {
  id: serial("id").primaryKey(),
  week: varchar("week", { length: 8 }).notNull(),
  company: varchar("company", { length: 50 }).notNull(),
  premiumGasoline: numeric("premium_gasoline", { precision: 10, scale: 2 }),
  gasoline: numeric("gasoline", { precision: 10, scale: 2 }),
  diesel: numeric("diesel", { precision: 10, scale: 2 }),
  kerosene: numeric("kerosene", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  weekCompanyIdx: uniqueIndex("oil_weekly_supply_week_company_idx").on(table.week, table.company),
}));

export const insertOilWeeklySupplyPriceSchema = createInsertSchema(oilWeeklySupplyPrices).omit({ id: true, createdAt: true });
export type InsertOilWeeklySupplyPrice = z.infer<typeof insertOilWeeklySupplyPriceSchema>;
export type OilWeeklySupplyPrice = typeof oilWeeklySupplyPrices.$inferSelect;

// ─── 푸시 구독 (Push Subscriptions) ─────────────────────────────────────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// ─── 국제 유류 제품가격 (Petronet 크롤링 / 수동 업로드) ───────────────────────
export const intlFuelPrices = pgTable("intl_fuel_prices", {
  date: varchar("date", { length: 8 }).primaryKey(),
  gasoline: numeric("gasoline"),
  diesel: numeric("diesel"),
  kerosene: numeric("kerosene"),
  wti: numeric("wti"),
  brent: numeric("brent"),
  dubai: numeric("dubai"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── 주유소 좌표 마스터 (Opinet GIS) ─────────────────────────────────────────
export const gasStationsMaster = pgTable("gas_stations_master", {
  stationId: varchar("station_id", { length: 20 }).primaryKey(),
  stationName: text("station_name").notNull(),
  gisX: numeric("gis_x"),
  gisY: numeric("gis_y"),
  region: text("region"),
  sido: text("sido"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
