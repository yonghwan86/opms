import { db } from "./db";
import { eq, and, ilike, or, desc, asc, count, sql, inArray } from "drizzle-orm";
import {
  headquarters, teams, users, hqTeamRegionPermissions,
  loginLogs, auditLogs, pageViews,
  oilPriceRaw, oilPriceAnalysis, oilCollectionLogs,
  pushSubscriptions, oilCeilingPrices, userSatisfactions, oilWeeklySupplyPrices,
  gasStationsMaster,
  type Headquarters, type InsertHeadquarters,
  type Team, type InsertTeam,
  type User, type InsertUser,
  type HqTeamRegionPermission, type InsertHqTeamRegionPermission,
  type LoginLog, type AuditLog, type PageView,
  type InsertOilPriceRaw, type OilPriceRaw,
  type InsertOilPriceAnalysis, type OilPriceAnalysis,
  type PushSubscription, type InsertPushSubscription,
  type OilCeilingPrices, type InsertOilCeilingPrices,
  type InsertOilCollectionLog, type OilCollectionLog,
  type InsertOilWeeklySupplyPrice, type OilWeeklySupplyPrice,
} from "@shared/schema";

// ─── 최고가격제 변동추이 타입 ──────────────────────────────────────────────────
export interface CeilingTrendRow {
  date: string;
  gasolineAvg: number | null;
  dieselAvg: number | null;
  keroseneAvg: number | null;
  gasolineAbove: number;
  gasolineBelow: number;
  dieselAbove: number;
  dieselBelow: number;
  keroseneAbove: number;
  keroseneBelow: number;
  baseGas: number | null;
  baseDiesel: number | null;
  baseKerosene: number | null;
}

export interface CeilingStationExportRow {
  date: string;
  stationId: string;
  stationName: string;
  region: string;
  sido: string;
  brand: string | null;
  isSelf: boolean;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
  baseGasoline: number | null;
  baseDiesel: number | null;
  baseKerosene: number | null;
  gasDiff: number | null;
  dieselDiff: number | null;
  keroDiff: number | null;
  ceilingGasoline: number | null;
  ceilingDiesel: number | null;
  ceilingKerosene: number | null;
}

export interface StationTrendRow {
  date: string;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}

// ─── 시/도 전체명 → 오피넷 축약명 매핑 ────────────────────────────────────────
const SIDO_ABBREV: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종시',
  '경기도': '경기', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
};

function toOilRegionName(doName: string | null, siName: string | null, gunName: string | null, guName: string | null): string {
  const sido = doName ? (SIDO_ABBREV[doName] || doName) : '';
  const sigungu = guName || siName || gunName || '';
  return `${sido} ${sigungu}`.trim();
}

// ─── 유가 분석 결과 타입 ──────────────────────────────────────────────────────
export interface OilTopStation {
  rank: number;
  stationId: string;
  stationName: string;
  region: string;
  sido: string;
  brand: string | null;
  isSelf: boolean;
  price?: number;
  prevPrice?: number;
  changeAmount?: number;
  ceilingPrice?: number;
  gasoline?: number;
  diesel?: number;
  kerosene?: number;
  diff?: number;
}

// ─── 페이징 공통 타입 ─────────────────────────────────────────────────────────
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── 스토리지 인터페이스 ───────────────────────────────────────────────────────
export interface IStorage {
  // 본부
  getHeadquarters(params?: { search?: string; page?: number; pageSize?: number; enabled?: boolean }): Promise<PaginatedResult<Headquarters>>;
  getHeadquartersAll(): Promise<Headquarters[]>;
  getHeadquartersById(id: number): Promise<Headquarters | undefined>;
  getHeadquartersByCode(code: string): Promise<Headquarters | undefined>;
  getHeadquartersByName(name: string): Promise<Headquarters | undefined>;
  createHeadquarters(data: InsertHeadquarters): Promise<Headquarters>;
  updateHeadquarters(id: number, data: Partial<InsertHeadquarters>): Promise<Headquarters>;
  deleteHeadquarters(id: number): Promise<void>;

  // 팀
  getTeams(params?: { search?: string; headquartersId?: number; page?: number; pageSize?: number; enabled?: boolean }): Promise<PaginatedResult<Team>>;
  getTeamsAll(headquartersId?: number): Promise<Team[]>;
  getTeamById(id: number): Promise<Team | undefined>;
  getTeamByCode(code: string): Promise<Team | undefined>;
  getTeamByName(name: string, headquartersId: number): Promise<Team | undefined>;
  createTeam(data: InsertTeam): Promise<Team>;
  updateTeam(id: number, data: Partial<InsertTeam>): Promise<Team>;
  deleteTeam(id: number): Promise<void>;

  // 사용자
  getUsers(params?: { search?: string; headquartersId?: number; teamId?: number; role?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<User>>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User>;
  updateUserPassword(id: number, passwordHash: string): Promise<void>;
  resetUserPassword(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;

  // 지역 권한
  getRegionPermissions(params?: { headquartersId?: number; teamId?: number; search?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<HqTeamRegionPermission>>;
  getRegionPermissionsByHqTeam(headquartersId: number, teamId: number): Promise<HqTeamRegionPermission[]>;
  getRegionPermissionById(id: number): Promise<HqTeamRegionPermission | undefined>;
  createRegionPermission(data: InsertHqTeamRegionPermission): Promise<HqTeamRegionPermission>;
  updateRegionPermission(id: number, data: Partial<InsertHqTeamRegionPermission>): Promise<HqTeamRegionPermission>;
  deleteRegionPermission(id: number): Promise<void>;

  // 로그인 로그
  createLoginLog(userId: number, ipAddress?: string, userAgent?: string): Promise<void>;
  getLoginLogs(params?: { userId?: number; search?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<LoginLog & { username: string; displayName: string }>>;

  // 감사 로그
  createAuditLog(userId: number | null, actionType: string, targetType?: string, targetId?: number, detail?: object): Promise<void>;
  getAuditLogs(params?: { userId?: number; actionType?: string; targetType?: string; search?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<AuditLog & { username?: string }>>;

  // 페이지 뷰 로그
  createPageView(userId: number, page: string, device: string): Promise<void>;
  getPageViews(params?: { userId?: number; page?: string; device?: string; page_num?: number; pageSize?: number }): Promise<PaginatedResult<PageView & { username: string; displayName: string }>>;
  getAllLoginLogsForCsv(): Promise<(LoginLog & { username: string; displayName: string })[]>;
  getAllAuditLogsForCsv(): Promise<(AuditLog & { username?: string })[]>;
  getAllPageViewsForCsv(): Promise<(PageView & { username: string; displayName: string })[]>;

  // 대시보드 통계
  getDashboardStats(): Promise<{
    headquartersCount: number;
    teamsCount: number;
    usersCount: number;
    recentLoginCount: number;
  }>;

  // 유가 원본 데이터
  saveOilPriceRaw(rows: InsertOilPriceRaw[]): Promise<void>;
  getOilPriceRawByDate(date: string): Promise<OilPriceRaw[]>;
  getOilPriceLatestDate(): Promise<string | null>;

  // 유가 분석 결과
  saveOilPriceAnalysis(results: InsertOilPriceAnalysis[]): Promise<void>;
  getOilPriceAnalysis(params: {
    analysisDate?: string;
    analysisType?: string;
    subType?: string;
    fuelType?: string;
    sido?: string;
  }): Promise<OilPriceAnalysis[]>;

  // 유가 실시간 분석 (top-stations)
  getOilTopStations(params: {
    type: 'HIGH' | 'LOW' | 'RISE' | 'FALL' | 'WIDE' | 'CEILING';
    fuelType: 'gasoline' | 'diesel' | 'kerosene';
    date: string;
    prevDate?: string;
    regions: { sidoList: string[]; regionList: string[] } | null;
    sido?: string;
  }): Promise<OilTopStation[]>;
  getOilAvailableDates(): Promise<string[]>;
  getLastAnalysisTime(date: string): Promise<Date | null>;
  hasSuccessfulMorningLog(targetDate: string, sinceUTC: Date): Promise<boolean>;
  getUserPermittedRegions(userId: number): Promise<{ sidoList: string[]; regionList: string[] }>;
  getOilSubregions(date: string, permitted: { sidoList: string[]; regionList: string[] }): Promise<string[]>;

  // 대시보드 유가 분석
  getOilNationalAverages(date: string, prevDate: string): Promise<{
    gasoline: number; diesel: number; kerosene: number;
    gasolineChange: number; dieselChange: number; keroseneChange: number;
  }>;
  getOilPriceSpread(date: string, sidoFilter?: string[], regionFilter?: string[]): Promise<{
    gasoline: { spread: number; maxPrice: number; maxStation: string; maxRegion: string; minPrice: number; minStation: string; minRegion: string } | null;
    diesel: { spread: number; maxPrice: number; maxStation: string; maxRegion: string; minPrice: number; minStation: string; minRegion: string } | null;
  }>;
  getOilRegionalAverages(date: string, sidoFilter?: string[], regionFilter?: string[]): Promise<{ sido: string; avgPrice: number; avgDiesel: number | null }[]>;
  getOilDomesticHistory(): Promise<{ date: string; gasoline: number; diesel: number }[]>;
  getOilRegionalHistory(sidoFilter?: string[], regionFilter?: string[]): Promise<{ date: string; gasoline: number | null; diesel: number | null; kerosene: number | null }[]>;
  getIntlVsDomestic(cutoffStr: string): Promise<{
    date: string;
    intlGasoline: number | null;
    intlDiesel: number | null;
    intlKerosene: number | null;
    domesticGasoline: number | null;
    domesticDiesel: number | null;
    domesticKerosene: number | null;
  }[]>;

  // 푸시 구독
  savePushSubscription(userId: number, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  getMasterPushSubscriptions(): Promise<PushSubscription[]>;
  getPushSubscriptionsByUserId(userId: number): Promise<PushSubscription[]>;
  incrementBadgeCount(userId: number): Promise<number>;
  resetBadgeCount(userId: number): Promise<void>;
  getBadgeCount(userId: number): Promise<number>;

  // 석유 최고가격제
  getCeilingPrices(): Promise<OilCeilingPrices[]>;
  getAllCeilingPrices(): Promise<OilCeilingPrices[]>;
  setCeilingPrices(data: InsertOilCeilingPrices): Promise<OilCeilingPrices>;
  getCeilingTrendData(effectiveDate: string, sido?: string, sigungu?: string): Promise<CeilingTrendRow[]>;
  getStationCeilingTrend(effectiveDate: string, stationId: string): Promise<StationTrendRow[]>;
  getCeilingStationsForExport(params: { effectiveDate: string; role: string; headquartersId?: number | null; teamId?: number | null }): Promise<CeilingStationExportRow[]>;

  // 유가 수집 이력 로그
  saveOilCollectionLog(log: InsertOilCollectionLog): Promise<void>;
  getOilCollectionLogs(params?: { page?: number; pageSize?: number; status?: string; jobType?: string }): Promise<{ data: OilCollectionLog[]; total: number; page: number; totalPages: number }>;

  // 만족도 조사
  saveSatisfaction(userId: number, rating: string): Promise<void>;
  savePublicSatisfaction(rating: string): Promise<void>;
  hasSatisfactionToday(userId: number): Promise<boolean>;
  getSatisfactionList(params: { page: number; pageSize: number; search?: string }): Promise<{ data: any[]; total: number }>;

  // 주유소 가격 검색
  searchStations(params: { name: string; sido?: string; region?: string }): Promise<StationSearchRow[]>;
  getStationSubregions(sido: string): Promise<string[]>;
  suggestStations(params: { q: string; sido?: string; region?: string }): Promise<string[]>;
  suggestStationsDetailed(params: { q: string; sido?: string; region?: string }): Promise<{ stationId: string; stationName: string; region: string }[]>;

  // 주간공급가격
  upsertWeeklySupplyPrices(rows: InsertOilWeeklySupplyPrice[]): Promise<void>;
  upsertWeeklySupplyFuelColumn(rows: { week: string; company: string; price: number | null }[], fuelType: 'gasoline' | 'diesel' | 'kerosene'): Promise<number>;
  getWeeklySupplyPrices(limitWeeks?: number): Promise<OilWeeklySupplyPrice[]>;
  getLatestWeeklySupplyWeek(): Promise<string | null>;
}

export interface StationSearchRow {
  date: string;
  stationId: string;
  stationName: string;
  brand: string | null;
  isSelf: boolean;
  address: string | null;
  region: string;
  sido: string;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
  supplyGasoline: number | null;
  supplyDiesel: number | null;
  supplyKerosene: number | null;
}

// ─── PostgreSQL 구현체 ─────────────────────────────────────────────────────────
export class PostgresStorage implements IStorage {

  // ── 본부 ──────────────────────────────────────────────────────────────────
  async getHeadquarters(params: { search?: string; page?: number; pageSize?: number; enabled?: boolean } = {}): Promise<PaginatedResult<Headquarters>> {
    const { search, page = 1, pageSize = 20, enabled } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (search) conditions.push(or(ilike(headquarters.name, `%${search}%`), ilike(headquarters.code, `%${search}%`)));
    if (enabled !== undefined) conditions.push(eq(headquarters.enabled, enabled));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(headquarters).where(where).orderBy(desc(headquarters.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(headquarters).where(where),
    ]);
    return { data: rows, total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  async getHeadquartersAll(): Promise<Headquarters[]> {
    const rows = await db.select().from(headquarters);
    const ORDER = ['HQ_SUDNAM','HQ_SUDBUK','HQ_DAEJEON','HQ_CHUNGBUK','HQ_GWANGJU','HQ_JEONBUK','HQ_BUSAN','HQ_DAEGU','HQ_GANGWON','HQ_JEJU'];
    return rows.sort((a, b) => {
      const ai = ORDER.indexOf(a.code);
      const bi = ORDER.indexOf(b.code);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  async getHeadquartersById(id: number): Promise<Headquarters | undefined> {
    const [row] = await db.select().from(headquarters).where(eq(headquarters.id, id));
    return row;
  }

  async getHeadquartersByCode(code: string): Promise<Headquarters | undefined> {
    const [row] = await db.select().from(headquarters).where(eq(headquarters.code, code));
    return row;
  }

  async getHeadquartersByName(name: string): Promise<Headquarters | undefined> {
    const [row] = await db.select().from(headquarters).where(eq(headquarters.name, name));
    return row;
  }

  async createHeadquarters(data: InsertHeadquarters): Promise<Headquarters> {
    const [row] = await db.insert(headquarters).values(data).returning();
    return row;
  }

  async updateHeadquarters(id: number, data: Partial<InsertHeadquarters>): Promise<Headquarters> {
    const [row] = await db.update(headquarters).set({ ...data, updatedAt: new Date() }).where(eq(headquarters.id, id)).returning();
    return row;
  }

  async deleteHeadquarters(id: number): Promise<void> {
    await db.delete(headquarters).where(eq(headquarters.id, id));
  }

  // ── 팀 ──────────────────────────────────────────────────────────────────
  async getTeams(params: { search?: string; headquartersId?: number; page?: number; pageSize?: number; enabled?: boolean } = {}): Promise<PaginatedResult<Team>> {
    const { search, headquartersId, page = 1, pageSize = 20, enabled } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (search) conditions.push(or(ilike(teams.name, `%${search}%`), ilike(teams.code, `%${search}%`)));
    if (headquartersId) conditions.push(eq(teams.headquartersId, headquartersId));
    if (enabled !== undefined) conditions.push(eq(teams.enabled, enabled));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(teams).where(where).orderBy(desc(teams.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(teams).where(where),
    ]);
    return { data: rows, total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  async getTeamsAll(headquartersId?: number): Promise<Team[]> {
    if (headquartersId) {
      return db.select().from(teams).where(eq(teams.headquartersId, headquartersId)).orderBy(asc(teams.name));
    }
    return db.select().from(teams).orderBy(asc(teams.name));
  }

  async getTeamById(id: number): Promise<Team | undefined> {
    const [row] = await db.select().from(teams).where(eq(teams.id, id));
    return row;
  }

  async getTeamByCode(code: string): Promise<Team | undefined> {
    const [row] = await db.select().from(teams).where(eq(teams.code, code));
    return row;
  }

  async getTeamByName(name: string, headquartersId: number): Promise<Team | undefined> {
    const [row] = await db.select().from(teams).where(and(eq(teams.name, name), eq(teams.headquartersId, headquartersId)));
    return row;
  }

  async createTeam(data: InsertTeam): Promise<Team> {
    const [row] = await db.insert(teams).values(data).returning();
    return row;
  }

  async updateTeam(id: number, data: Partial<InsertTeam>): Promise<Team> {
    const [row] = await db.update(teams).set({ ...data, updatedAt: new Date() }).where(eq(teams.id, id)).returning();
    return row;
  }

  async deleteTeam(id: number): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // ── 사용자 ──────────────────────────────────────────────────────────────────
  async getUsers(params: { search?: string; headquartersId?: number; teamId?: number; role?: string; page?: number; pageSize?: number } = {}): Promise<PaginatedResult<User>> {
    const { search, headquartersId, teamId, role, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (search) conditions.push(or(
      ilike(users.username, `%${search}%`),
      ilike(users.displayName, `%${search}%`),
      ilike(users.departmentName, `%${search}%`)
    ));
    if (headquartersId) conditions.push(eq(users.headquartersId, headquartersId));
    if (teamId) conditions.push(eq(users.teamId, teamId));
    if (role) conditions.push(eq(users.role, role));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(users).where(where),
    ]);
    return { data: rows, total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.username, username));
    return row;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.email, email));
    return row;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [row] = await db.insert(users).values(data).returning();
    return row;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const [row] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return row;
  }

  async updateUserPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async resetUserPassword(id: number): Promise<void> {
    await db.update(users).set({ passwordHash: null, mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(pageViews).where(eq(pageViews.userId, id));
    await db.delete(loginLogs).where(eq(loginLogs.userId, id));
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  // ── 지역 권한 ──────────────────────────────────────────────────────────────
  async getRegionPermissions(params: { headquartersId?: number; teamId?: number; search?: string; page?: number; pageSize?: number } = {}): Promise<PaginatedResult<HqTeamRegionPermission>> {
    const { headquartersId, teamId, search, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (headquartersId) conditions.push(eq(hqTeamRegionPermissions.headquartersId, headquartersId));
    if (teamId) conditions.push(eq(hqTeamRegionPermissions.teamId, teamId));
    if (search) conditions.push(ilike(hqTeamRegionPermissions.regionName, `%${search}%`));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(hqTeamRegionPermissions).where(where).orderBy(desc(hqTeamRegionPermissions.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(hqTeamRegionPermissions).where(where),
    ]);
    return { data: rows, total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  async getRegionPermissionsByHqTeam(headquartersId: number, teamId: number): Promise<HqTeamRegionPermission[]> {
    return db.select().from(hqTeamRegionPermissions).where(
      and(eq(hqTeamRegionPermissions.headquartersId, headquartersId), eq(hqTeamRegionPermissions.teamId, teamId))
    );
  }

  async getRegionPermissionById(id: number): Promise<HqTeamRegionPermission | undefined> {
    const [row] = await db.select().from(hqTeamRegionPermissions).where(eq(hqTeamRegionPermissions.id, id));
    return row;
  }

  async createRegionPermission(data: InsertHqTeamRegionPermission): Promise<HqTeamRegionPermission> {
    const [row] = await db.insert(hqTeamRegionPermissions).values(data).returning();
    return row;
  }

  async updateRegionPermission(id: number, data: Partial<InsertHqTeamRegionPermission>): Promise<HqTeamRegionPermission> {
    const [row] = await db.update(hqTeamRegionPermissions).set({ ...data, updatedAt: new Date() }).where(eq(hqTeamRegionPermissions.id, id)).returning();
    return row;
  }

  async deleteRegionPermission(id: number): Promise<void> {
    await db.delete(hqTeamRegionPermissions).where(eq(hqTeamRegionPermissions.id, id));
  }

  // ── 로그인 로그 ──────────────────────────────────────────────────────────────
  async createLoginLog(userId: number, ipAddress?: string, userAgent?: string): Promise<void> {
    await db.insert(loginLogs).values({ userId, ipAddress, userAgent });
  }

  async getLoginLogs(params: { userId?: number; search?: string; page?: number; pageSize?: number } = {}): Promise<PaginatedResult<LoginLog & { username: string; displayName: string }>> {
    const { userId, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (userId) conditions.push(eq(loginLogs.userId, userId));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id: loginLogs.id,
        userId: loginLogs.userId,
        loginAt: loginLogs.loginAt,
        ipAddress: loginLogs.ipAddress,
        userAgent: loginLogs.userAgent,
        username: users.username,
        displayName: users.displayName,
      }).from(loginLogs)
        .leftJoin(users, eq(loginLogs.userId, users.id))
        .where(where)
        .orderBy(desc(loginLogs.loginAt))
        .limit(pageSize).offset(offset),
      db.select({ total: count() }).from(loginLogs).where(where),
    ]);
    return { data: rows as any, total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  // ── 감사 로그 ──────────────────────────────────────────────────────────────
  async createAuditLog(userId: number | null, actionType: string, targetType?: string, targetId?: number, detail?: object): Promise<void> {
    await db.insert(auditLogs).values({
      userId: userId ?? undefined,
      actionType,
      targetType,
      targetId,
      detailJson: detail ? JSON.stringify(detail) : undefined,
    });
  }

  async getAuditLogs(params: { userId?: number; actionType?: string; targetType?: string; search?: string; page?: number; pageSize?: number } = {}): Promise<PaginatedResult<AuditLog & { username?: string }>> {
    const { userId, actionType, targetType, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (actionType) conditions.push(eq(auditLogs.actionType, actionType));
    if (targetType) conditions.push(eq(auditLogs.targetType, targetType));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        actionType: auditLogs.actionType,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        detailJson: auditLogs.detailJson,
        createdAt: auditLogs.createdAt,
        username: users.username,
      }).from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ total: count() }).from(auditLogs).where(where),
    ]);
    return { data: rows as any, total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  // ── 페이지 뷰 로그 ──────────────────────────────────────────────────────────
  async createPageView(userId: number, page: string, device: string): Promise<void> {
    await db.insert(pageViews).values({ userId, page, device });
  }

  async getPageViews(params: { userId?: number; page?: string; device?: string; page_num?: number; pageSize?: number } = {}): Promise<PaginatedResult<PageView & { username: string; displayName: string }>> {
    const { userId, page: pageFilter, device, page_num = 1, pageSize = 20 } = params;
    const offset = (page_num - 1) * pageSize;
    const conditions = [];
    if (userId) conditions.push(eq(pageViews.userId, userId));
    if (pageFilter) conditions.push(eq(pageViews.page, pageFilter));
    if (device) conditions.push(eq(pageViews.device, device));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id: pageViews.id,
        userId: pageViews.userId,
        page: pageViews.page,
        device: pageViews.device,
        createdAt: pageViews.createdAt,
        username: users.username,
        displayName: users.displayName,
      }).from(pageViews)
        .leftJoin(users, eq(pageViews.userId, users.id))
        .where(where)
        .orderBy(desc(pageViews.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ total: count() }).from(pageViews).where(where),
    ]);
    return { data: rows as any, total: Number(total), page: page_num, pageSize, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  async getAllLoginLogsForCsv(): Promise<(LoginLog & { username: string; displayName: string })[]> {
    const rows = await db.select({
      id: loginLogs.id,
      userId: loginLogs.userId,
      loginAt: loginLogs.loginAt,
      ipAddress: loginLogs.ipAddress,
      userAgent: loginLogs.userAgent,
      username: users.username,
      displayName: users.displayName,
    }).from(loginLogs)
      .leftJoin(users, eq(loginLogs.userId, users.id))
      .orderBy(desc(loginLogs.loginAt));
    return rows as any;
  }

  async getAllAuditLogsForCsv(): Promise<(AuditLog & { username?: string })[]> {
    const rows = await db.select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      actionType: auditLogs.actionType,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      detailJson: auditLogs.detailJson,
      createdAt: auditLogs.createdAt,
      username: users.username,
    }).from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt));
    return rows as any;
  }

  async getAllPageViewsForCsv(): Promise<(PageView & { username: string; displayName: string })[]> {
    const rows = await db.select({
      id: pageViews.id,
      userId: pageViews.userId,
      page: pageViews.page,
      device: pageViews.device,
      createdAt: pageViews.createdAt,
      username: users.username,
      displayName: users.displayName,
    }).from(pageViews)
      .leftJoin(users, eq(pageViews.userId, users.id))
      .orderBy(desc(pageViews.createdAt));
    return rows as any;
  }

  // ── 유가 원본 데이터 ──────────────────────────────────────────────────────
  async saveOilPriceRaw(rows: InsertOilPriceRaw[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await db
        .insert(oilPriceRaw)
        .values(chunk)
        .onConflictDoUpdate({
          target: [oilPriceRaw.stationId, oilPriceRaw.date],
          set: {
            stationName: sql`EXCLUDED.station_name`,
            address: sql`EXCLUDED.address`,
            region: sql`EXCLUDED.region`,
            sido: sql`EXCLUDED.sido`,
            brand: sql`EXCLUDED.brand`,
            isSelf: sql`EXCLUDED.is_self`,
            premiumGasoline: sql`EXCLUDED.premium_gasoline`,
            gasoline: sql`EXCLUDED.gasoline`,
            diesel: sql`EXCLUDED.diesel`,
            kerosene: sql`EXCLUDED.kerosene`,
            createdAt: sql`now()`,
          },
        });
    }
    // 청크 루프 완료 후 gas_stations_master 동기화 (station_id 기준 중복 제거)
    // PostgreSQL 파라미터 상한(65,535)을 초과하면 청크 분할 fallback
    const MASTER_COLS = 5; // stationId, stationName, sido, region, updatedAt
    const MAX_PG_PARAMS = 65535;
    const uniqueMap = new Map<string, InsertOilPriceRaw>();
    for (const r of rows) {
      if (!uniqueMap.has(r.stationId)) uniqueMap.set(r.stationId, r);
    }
    const stations = Array.from(uniqueMap.values());
    const chunkSize = Math.floor(MAX_PG_PARAMS / MASTER_COLS); // 최대 행 수/청크
    for (let i = 0; i < stations.length; i += chunkSize) {
      const chunk = stations.slice(i, i + chunkSize);
      await db.insert(gasStationsMaster).values(
        chunk.map(r => ({
          stationId: r.stationId,
          stationName: r.stationName,
          sido: r.sido,
          region: r.region,
          updatedAt: new Date(),
        }))
      ).onConflictDoUpdate({
        target: gasStationsMaster.stationId,
        set: {
          stationName: sql`EXCLUDED.station_name`,
          sido: sql`EXCLUDED.sido`,
          region: sql`EXCLUDED.region`,
          updatedAt: sql`now()`,
        },
      });
    }
    console.log(`[master-sync] gas_stations_master upserted: ${stations.length} rows`);
  }

  async getOilPriceRawByDate(date: string): Promise<OilPriceRaw[]> {
    return db
      .select()
      .from(oilPriceRaw)
      .where(eq(oilPriceRaw.date, date));
  }

  async getOilPriceLatestDate(): Promise<string | null> {
    const result = await db
      .select({ date: oilPriceRaw.date })
      .from(oilPriceRaw)
      .orderBy(desc(oilPriceRaw.date))
      .limit(1);
    return result[0]?.date ?? null;
  }

  // ── 유가 분석 결과 ────────────────────────────────────────────────────────
  async saveOilPriceAnalysis(results: InsertOilPriceAnalysis[]): Promise<void> {
    if (results.length === 0) return;
    const dates = [...new Set(results.map((r) => r.analysisDate))];
    for (const date of dates) {
      await db.delete(oilPriceAnalysis).where(eq(oilPriceAnalysis.analysisDate, date));
    }
    const CHUNK = 500;
    for (let i = 0; i < results.length; i += CHUNK) {
      await db.insert(oilPriceAnalysis).values(results.slice(i, i + CHUNK));
    }
  }

  async getOilPriceAnalysis(params: {
    analysisDate?: string;
    analysisType?: string;
    subType?: string;
    fuelType?: string;
    sido?: string;
  }): Promise<OilPriceAnalysis[]> {
    const conditions = [];
    if (params.analysisDate) conditions.push(eq(oilPriceAnalysis.analysisDate, params.analysisDate));
    if (params.analysisType) conditions.push(eq(oilPriceAnalysis.analysisType, params.analysisType));
    if (params.subType) conditions.push(eq(oilPriceAnalysis.subType, params.subType));
    if (params.fuelType) conditions.push(eq(oilPriceAnalysis.fuelType, params.fuelType));
    if (params.sido) conditions.push(eq(oilPriceAnalysis.sido, params.sido));

    return db
      .select()
      .from(oilPriceAnalysis)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(oilPriceAnalysis.rank));
  }

  // ── 유가 실시간 분석 ──────────────────────────────────────────────────────
  async getOilTopStations(params: {
    type: 'HIGH' | 'LOW' | 'RISE' | 'FALL' | 'WIDE' | 'CEILING';
    fuelType: 'gasoline' | 'diesel' | 'kerosene';
    date: string;
    prevDate?: string;
    regions: { sidoList: string[]; regionList: string[] } | null;
    sido?: string;
  }): Promise<OilTopStation[]> {
    const { type, fuelType, date, prevDate, regions, sido } = params;
    const fc = fuelType === 'gasoline' ? 'gasoline' : fuelType === 'diesel' ? 'diesel' : 'kerosene';
    const fuelCol = sql.raw(fc);

    const hasSido = regions !== null && regions.sidoList.length > 0;
    const hasRegion = regions !== null && regions.regionList.length > 0;

    // null → 전국(필터 없음), 빈 객체 → 권한 없음(FALSE)
    let regionCond: ReturnType<typeof sql>;
    let r1RegionCond: ReturnType<typeof sql>;
    if (regions === null) {
      regionCond = sql``;
      r1RegionCond = sql``;
    } else if (!hasSido && !hasRegion) {
      regionCond = sql` AND FALSE`;
      r1RegionCond = sql` AND FALSE`;
    } else if (hasSido && !hasRegion) {
      const sidoIn = sql.join(regions.sidoList.map(s => sql`${s}`), sql`, `);
      regionCond = sql` AND sido IN (${sidoIn})`;
      r1RegionCond = sql` AND r1.sido IN (${sidoIn})`;
    } else if (!hasSido && hasRegion) {
      const regionIn = sql.join(regions.regionList.map(s => sql`${s}`), sql`, `);
      regionCond = sql` AND region IN (${regionIn})`;
      r1RegionCond = sql` AND r1.region IN (${regionIn})`;
    } else {
      const sidoIn = sql.join(regions.sidoList.map(s => sql`${s}`), sql`, `);
      const regionIn = sql.join(regions.regionList.map(s => sql`${s}`), sql`, `);
      regionCond = sql` AND (sido IN (${sidoIn}) OR region IN (${regionIn}))`;
      r1RegionCond = sql` AND (r1.sido IN (${sidoIn}) OR r1.region IN (${regionIn}))`;
    }

    const sidoCond = sido ? sql` AND sido = ${sido}` : sql``;
    const r1SidoCond = sido ? sql` AND r1.sido = ${sido}` : sql``;

    let rawRows: any[];

    if (type === 'HIGH' || type === 'LOW') {
      const orderDir = sql.raw(type === 'HIGH' ? 'DESC' : 'ASC');
      const result = await db.execute(
        sql`SELECT station_id, station_name, region, sido, brand, is_self, ${fuelCol} AS price
            FROM oil_price_raw
            WHERE date = ${date} AND ${fuelCol} > 0${sidoCond}${regionCond}
            ORDER BY ${fuelCol} ${orderDir} LIMIT 10`
      );
      rawRows = result.rows as any[];

    } else if (type === 'RISE' || type === 'FALL') {
      if (!prevDate) return [];
      const compareOp = sql.raw(type === 'RISE' ? '>' : '<');
      const orderDir = sql.raw(type === 'RISE' ? 'DESC' : 'ASC');
      const result = await db.execute(
        sql`SELECT r1.station_id, r1.station_name, r1.region, r1.sido, r1.brand, r1.is_self,
                   r1.${fuelCol} AS price, r2.${fuelCol} AS prev_price,
                   (r1.${fuelCol} - r2.${fuelCol}) AS change_amount
            FROM oil_price_raw r1
            JOIN oil_price_raw r2 ON r1.station_id = r2.station_id AND r2.date = ${prevDate}
            WHERE r1.date = ${date}
              AND r1.${fuelCol} > 0 AND r2.${fuelCol} > 0
              AND r1.${fuelCol} ${compareOp} r2.${fuelCol}${r1SidoCond}${r1RegionCond}
            ORDER BY (r1.${fuelCol} - r2.${fuelCol}) ${orderDir} LIMIT 10`
      );
      rawRows = result.rows as any[];

    } else if (type === 'CEILING') {
      // 석유 최고가격제 — 최신 상한가와 비교, 가격 내림차순 TOP 10
      const result = await db.execute(
        sql`SELECT r.station_id, r.station_name, r.region, r.sido, r.brand, r.is_self,
                   r.${fuelCol} AS price,
                   c.${fuelCol} AS ceiling_price,
                   (r.${fuelCol} - c.${fuelCol}) AS change_amount
            FROM oil_price_raw r
            LEFT JOIN (SELECT gasoline, diesel, kerosene FROM oil_ceiling_prices ORDER BY effective_date DESC LIMIT 1) c ON TRUE
            WHERE r.date = ${date} AND r.${fuelCol} > 0${sidoCond}${regionCond}
            ORDER BY r.${fuelCol} DESC LIMIT 10`
      );
      rawRows = result.rows as any[];

    } else {
      // WIDE: fuelType에 따라 분기
      if (fuelType === 'diesel') {
        // 경유-등유 가격차
        const result = await db.execute(
          sql`SELECT station_id, station_name, region, sido, brand, is_self,
                     diesel, kerosene, (diesel - kerosene) AS diff
              FROM oil_price_raw
              WHERE date = ${date} AND diesel > 0 AND kerosene > 0 AND (diesel - kerosene) > 0${sidoCond}${regionCond}
              ORDER BY (diesel - kerosene) DESC LIMIT 10`
        );
        rawRows = result.rows as any[];
      } else {
        // 휘발유-경유 가격차 (default)
        const result = await db.execute(
          sql`SELECT station_id, station_name, region, sido, brand, is_self,
                     gasoline, diesel, (gasoline - diesel) AS diff
              FROM oil_price_raw
              WHERE date = ${date} AND gasoline > 0 AND diesel > 0 AND (gasoline - diesel) > 0${sidoCond}${regionCond}
              ORDER BY (gasoline - diesel) DESC LIMIT 10`
        );
        rawRows = result.rows as any[];
      }
    }

    return rawRows.map((row, idx) => ({
      rank: idx + 1,
      stationId: String(row.station_id),
      stationName: String(row.station_name),
      region: String(row.region),
      sido: String(row.sido),
      brand: row.brand ? String(row.brand) : null,
      isSelf: Boolean(row.is_self),
      price: row.price != null ? Number(row.price) : undefined,
      prevPrice: row.prev_price != null ? Number(row.prev_price) : undefined,
      changeAmount: row.change_amount != null ? Number(row.change_amount) : undefined,
      ceilingPrice: row.ceiling_price != null ? Number(row.ceiling_price) : undefined,
      gasoline: row.gasoline != null ? Number(row.gasoline) : undefined,
      diesel: row.diesel != null ? Number(row.diesel) : undefined,
      kerosene: row.kerosene != null ? Number(row.kerosene) : undefined,
      diff: row.diff != null ? Number(row.diff) : undefined,
    }));
  }

  async getOilAvailableDates(): Promise<string[]> {
    const result = await db
      .selectDistinct({ date: oilPriceRaw.date })
      .from(oilPriceRaw)
      .orderBy(desc(oilPriceRaw.date))
      .limit(365);
    return result.map(r => r.date);
  }

  async getLastAnalysisTime(date: string): Promise<Date | null> {
    const result = await db.execute(
      sql`SELECT MAX(created_at) AS last_time FROM oil_price_analysis WHERE analysis_date = ${date}`
    );
    const val = (result.rows[0] as any)?.last_time;
    return val ? new Date(val) : null;
  }

  async hasSuccessfulMorningLog(targetDate: string, sinceUTC: Date): Promise<boolean> {
    const result = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM oil_collection_logs
          WHERE target_date = ${targetDate}
            AND status = 'success'
            AND job_type LIKE 'scheduled_morning%'
            AND created_at >= ${sinceUTC.toISOString()}`
    );
    const cnt = Number((result.rows[0] as any)?.cnt ?? 0);
    return cnt > 0;
  }

  async getUserPermittedRegions(userId: number): Promise<{ sidoList: string[]; regionList: string[] }> {
    const user = await this.getUserById(userId);
    if (!user) return { sidoList: [], regionList: [] };

    let perms;
    if (user.teamId) {
      // 팀 계정: 해당 팀 권한만 조회
      perms = await db
        .select()
        .from(hqTeamRegionPermissions)
        .where(and(
          eq(hqTeamRegionPermissions.teamId, user.teamId),
          eq(hqTeamRegionPermissions.enabled, true),
        ));
    } else if (user.headquartersId) {
      // 본부 계정: 해당 본부 소속 모든 팀의 권한 합산
      const hqTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.headquartersId, user.headquartersId));
      const teamIds = hqTeams.map(t => t.id);
      if (teamIds.length === 0) return { sidoList: [], regionList: [] };
      perms = await db
        .select()
        .from(hqTeamRegionPermissions)
        .where(and(
          inArray(hqTeamRegionPermissions.teamId, teamIds),
          eq(hqTeamRegionPermissions.enabled, true),
        ));
    } else {
      return { sidoList: [], regionList: [] };
    }

    const sidoList: string[] = [];
    const regionList: string[] = [];
    for (const p of perms) {
      const sigungu = p.guName || p.siName || p.gunName;
      if (sigungu) {
        const sidoAbbrev = p.doName ? (SIDO_ABBREV[p.doName] || p.doName) : '';
        const r = `${sidoAbbrev} ${sigungu}`.trim();
        if (!regionList.includes(r)) regionList.push(r);
      } else if (p.doName) {
        const s = SIDO_ABBREV[p.doName] || p.doName;
        if (!sidoList.includes(s)) sidoList.push(s);
      }
    }
    return { sidoList, regionList };
  }

  async getOilSubregions(date: string, permitted: { sidoList: string[]; regionList: string[] }): Promise<string[]> {
    const { sidoList, regionList } = permitted;
    const results: string[] = [];

    if (sidoList.length > 0) {
      const sidoIn = sql.join(sidoList.map(s => sql`${s}`), sql`, `);
      const rows = await db.execute(
        sql`SELECT DISTINCT region FROM oil_price_raw
            WHERE date = ${date} AND sido IN (${sidoIn})
            ORDER BY region`
      );
      rows.rows.forEach((r: any) => results.push(String(r.region)));
    }

    if (regionList.length > 0) {
      const regionIn = sql.join(regionList.map(s => sql`${s}`), sql`, `);
      const rows = await db.execute(
        sql`SELECT DISTINCT region FROM oil_price_raw
            WHERE date = ${date} AND region IN (${regionIn})
            ORDER BY region`
      );
      rows.rows.forEach((r: any) => {
        if (!results.includes(String(r.region))) results.push(String(r.region));
      });
    }

    return results.sort();
  }

  // ── 대시보드 유가 분석 ────────────────────────────────────────────────────
  async getOilNationalAverages(date: string, prevDate: string) {
    const avgSql = (d: string) => sql`
      SELECT
        ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS gasoline,
        ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END)) AS diesel,
        ROUND(AVG(CASE WHEN kerosene > 0 THEN kerosene END)) AS kerosene
      FROM oil_price_raw WHERE date = ${d}`;
    const [curr, prev] = await Promise.all([
      db.execute(avgSql(date)),
      db.execute(avgSql(prevDate)),
    ]);
    const c = curr.rows[0] as any;
    const p = prev.rows[0] as any;
    const gasoline = Number(c?.gasoline) || 0;
    const diesel = Number(c?.diesel) || 0;
    const kerosene = Number(c?.kerosene) || 0;
    const prevGasoline = Number(p?.gasoline) || 0;
    const prevDiesel = Number(p?.diesel) || 0;
    const prevKerosene = Number(p?.kerosene) || 0;
    return {
      gasoline, diesel, kerosene,
      gasolineChange: gasoline - prevGasoline,
      dieselChange: diesel - prevDiesel,
      keroseneChange: kerosene - prevKerosene,
    };
  }

  async getOilPriceSpread(date: string, sidoFilter?: string[], regionFilter?: string[]) {
    const hasSido = sidoFilter && sidoFilter.length > 0;
    const hasRegion = regionFilter && regionFilter.length > 0;
    let whereExpr: ReturnType<typeof sql>;
    if (hasSido && hasRegion) {
      const sidoArr = sql.raw(sidoFilter!.map(s => `'${s.replace(/'/g, "''")}'`).join(','));
      const regionArr = sql.raw(regionFilter!.map(r => `'${r.replace(/'/g, "''")}'`).join(','));
      whereExpr = sql`AND (sido = ANY(ARRAY[${sidoArr}]) OR region = ANY(ARRAY[${regionArr}]))`;
    } else if (hasSido) {
      whereExpr = sql`AND sido = ANY(ARRAY[${sql.raw(sidoFilter!.map(s => `'${s.replace(/'/g, "''")}'`).join(','))}])`;
    } else if (hasRegion) {
      whereExpr = sql`AND region = ANY(ARRAY[${sql.raw(regionFilter!.map(r => `'${r.replace(/'/g, "''")}'`).join(','))}])`;
    } else {
      whereExpr = sql``;
    }
    const spreadFor = async (fuel: 'gasoline' | 'diesel') => {
      const col = fuel === 'gasoline' ? sql`gasoline` : sql`diesel`;
      const spreadRes = await db.execute(sql`
        SELECT
          MAX(${col}) AS max_price,
          MIN(CASE WHEN ${col} > 0 THEN ${col} END) AS min_price,
          MAX(${col}) - MIN(CASE WHEN ${col} > 0 THEN ${col} END) AS spread
        FROM oil_price_raw WHERE date = ${date} AND ${col} > 0 ${whereExpr}`);
      const s = spreadRes.rows[0] as any;
      const maxPrice = Number(s?.max_price) || 0;
      const minPrice = Number(s?.min_price) || 0;
      if (!maxPrice || !minPrice) return null;
      const [maxRow, minRow] = await Promise.all([
        db.execute(sql`SELECT station_name, region FROM oil_price_raw WHERE date = ${date} AND ${col} = ${maxPrice} ${whereExpr} LIMIT 1`),
        db.execute(sql`SELECT station_name, region FROM oil_price_raw WHERE date = ${date} AND ${col} = ${minPrice} ${whereExpr} LIMIT 1`),
      ]);
      return {
        spread: Number(s?.spread) || 0,
        maxPrice,
        maxStation: (maxRow.rows[0] as any)?.station_name as string || '',
        maxRegion: (maxRow.rows[0] as any)?.region as string || '',
        minPrice,
        minStation: (minRow.rows[0] as any)?.station_name as string || '',
        minRegion: (minRow.rows[0] as any)?.region as string || '',
      };
    };
    const [gasoline, diesel] = await Promise.all([spreadFor('gasoline'), spreadFor('diesel')]);
    return { gasoline, diesel };
  }

  async getOilRegionalAverages(date: string, sidoFilter?: string[], regionFilter?: string[]) {
    const hasSido = sidoFilter && sidoFilter.length > 0;
    const hasRegion = regionFilter && regionFilter.length > 0;

    // 필터 조건 빌드
    let whereExpr: ReturnType<typeof sql>;
    if (hasSido && hasRegion) {
      const sidoArr = sql.raw(sidoFilter!.map(s => `'${s.replace(/'/g, "''")}'`).join(','));
      const regionArr = sql.raw(regionFilter!.map(r => `'${r.replace(/'/g, "''")}'`).join(','));
      whereExpr = sql`AND (sido = ANY(ARRAY[${sidoArr}]) OR region = ANY(ARRAY[${regionArr}]))`;
    } else if (hasSido) {
      whereExpr = sql`AND sido = ANY(ARRAY[${sql.raw(sidoFilter!.map(s => `'${s.replace(/'/g, "''")}'`).join(','))}])`;
    } else if (hasRegion) {
      whereExpr = sql`AND region = ANY(ARRAY[${sql.raw(regionFilter!.map(r => `'${r.replace(/'/g, "''")}'`).join(','))}])`;
    } else {
      whereExpr = sql``;
    }

    // 시도 권한 없고 시/군/구만 있으면 city-level 집계, 아니면 sido-level 집계
    const groupByRegion = !hasSido && hasRegion;

    if (groupByRegion) {
      // 시/군/구 단위로 집계 (담당 시/군/구만)
      const result = await db.execute(sql`
        SELECT
          region AS sido,
          ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS avg_price,
          ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END)) AS avg_diesel
        FROM oil_price_raw
        WHERE date = ${date} ${whereExpr}
        GROUP BY region
        HAVING AVG(CASE WHEN gasoline > 0 THEN gasoline END) IS NOT NULL
        ORDER BY avg_price DESC
        LIMIT 20`);
      return result.rows.map((r: any) => ({
        sido: r.sido as string,
        avgPrice: Number(r.avg_price),
        avgDiesel: r.avg_diesel != null ? Number(r.avg_diesel) : null,
      }));
    } else if (hasSido && sidoFilter!.length === 1 && !hasRegion) {
      // 단일 도, 시/군/구 없음: 해당 도 내 시/군/구 단위 집계
      const result = await db.execute(sql`
        SELECT
          region AS sido,
          ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS avg_price,
          ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END)) AS avg_diesel
        FROM oil_price_raw
        WHERE date = ${date} ${whereExpr}
        GROUP BY region
        HAVING AVG(CASE WHEN gasoline > 0 THEN gasoline END) IS NOT NULL
        ORDER BY avg_price DESC
        LIMIT 30`);
      return result.rows.map((r: any) => ({
        sido: r.sido as string,
        avgPrice: Number(r.avg_price),
        avgDiesel: r.avg_diesel != null ? Number(r.avg_diesel) : null,
      }));
    } else {
      // 전국 또는 여러 도 (또는 sido+region 혼합): 도 단위로 집계
      const result = await db.execute(sql`
        SELECT
          sido,
          ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS avg_price,
          ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END)) AS avg_diesel
        FROM oil_price_raw
        WHERE date = ${date} ${whereExpr}
        GROUP BY sido
        HAVING AVG(CASE WHEN gasoline > 0 THEN gasoline END) IS NOT NULL
        ORDER BY avg_price DESC
        LIMIT 20`);
      return result.rows.map((r: any) => ({
        sido: r.sido as string,
        avgPrice: Number(r.avg_price),
        avgDiesel: r.avg_diesel != null ? Number(r.avg_diesel) : null,
      }));
    }
  }

  async getOilDomesticHistory() {
    const result = await db.execute(sql`
      SELECT
        date,
        ROUND(gasoline_avg) AS gasoline,
        ROUND(diesel_avg) AS diesel
      FROM domestic_avg_price_history
      ORDER BY date ASC`);
    return result.rows.map((r: any) => ({
      date: r.date as string,
      gasoline: Number(r.gasoline),
      diesel: Number(r.diesel),
    }));
  }

  async getOilRegionalHistory(sidoFilter?: string[], regionFilter?: string[]) {
    const hasSido = sidoFilter && sidoFilter.length > 0;
    const hasRegion = regionFilter && regionFilter.length > 0;
    const hasFilter = hasSido || hasRegion;

    let filterExpr: ReturnType<typeof sql>;
    if (hasSido && hasRegion) {
      const sidoArr = sql.raw(sidoFilter!.map(s => `'${s.replace(/'/g, "''")}'`).join(','));
      const regionArr = sql.raw(regionFilter!.map(r => `'${r.replace(/'/g, "''")}'`).join(','));
      filterExpr = sql`WHERE (sido = ANY(ARRAY[${sidoArr}]) OR region = ANY(ARRAY[${regionArr}]))`;
    } else if (hasSido) {
      filterExpr = sql`WHERE sido = ANY(ARRAY[${sql.raw(sidoFilter!.map(s => `'${s.replace(/'/g, "''")}'`).join(','))}])`;
    } else if (hasRegion) {
      filterExpr = sql`WHERE region = ANY(ARRAY[${sql.raw(regionFilter!.map(r => `'${r.replace(/'/g, "''")}'`).join(','))}])`;
    } else {
      filterExpr = sql``;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoff = cutoffDate.toISOString().slice(0, 10).replace(/-/g, "");
    const result = await db.execute(sql`
      SELECT
        date,
        ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS gasoline,
        ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END)) AS diesel,
        ROUND(AVG(CASE WHEN kerosene > 0 THEN kerosene END)) AS kerosene
      FROM oil_price_raw
      ${filterExpr}
      ${hasFilter ? sql`AND date >= ${cutoff}` : sql`WHERE date >= ${cutoff}`}
      GROUP BY date
      ORDER BY date ASC`);
    return result.rows.map((r: any) => ({
      date: r.date as string,
      gasoline: r.gasoline != null ? Number(r.gasoline) : null,
      diesel: r.diesel != null ? Number(r.diesel) : null,
      kerosene: r.kerosene != null ? Number(r.kerosene) : null,
    }));
  }

  async getIntlVsDomestic(cutoffStr: string) {
    const [intlRows, domesticRows] = await Promise.all([
      db.execute(sql`
        SELECT date, gasoline::text, diesel::text, kerosene::text
        FROM intl_fuel_prices
        WHERE date >= ${cutoffStr}
        ORDER BY date ASC
      `),
      db.execute(sql`
        SELECT date,
               ROUND(gasoline_avg)::text AS domestic_gasoline,
               ROUND(diesel_avg)::text AS domestic_diesel,
               ROUND(kerosene_avg)::text AS domestic_kerosene
        FROM domestic_avg_price_history
        WHERE date >= ${cutoffStr}
        ORDER BY date ASC
      `),
    ]);

    interface IntlRow { date: string; gasoline: string | null; diesel: string | null; kerosene: string | null }
    interface DomesticRow { date: string; domestic_gasoline: string | null; domestic_diesel: string | null; domestic_kerosene: string | null }

    const intlMap = new Map<string, IntlRow>();
    for (const r of intlRows.rows as IntlRow[]) {
      intlMap.set(r.date, r);
    }
    const domesticMap = new Map<string, DomesticRow>();
    for (const r of domesticRows.rows as DomesticRow[]) {
      domesticMap.set(r.date, r);
    }

    const allDates = new Set([...Array.from(intlMap.keys()), ...Array.from(domesticMap.keys())]);
    const sorted = Array.from(allDates).sort();
    return sorted.map(date => {
      const intl = intlMap.get(date);
      const dom = domesticMap.get(date);
      return {
        date,
        intlGasoline: intl?.gasoline ? parseFloat(intl.gasoline) : null,
        intlDiesel: intl?.diesel ? parseFloat(intl.diesel) : null,
        intlKerosene: intl?.kerosene ? parseFloat(intl.kerosene) : null,
        domesticGasoline: dom?.domestic_gasoline ? parseFloat(dom.domestic_gasoline) : null,
        domesticDiesel: dom?.domestic_diesel ? parseFloat(dom.domestic_diesel) : null,
        domesticKerosene: dom?.domestic_kerosene ? parseFloat(dom.domestic_kerosene) : null,
      };
    });
  }

  // ── 푸시 구독 ─────────────────────────────────────────────────────────────
  async savePushSubscription(userId: number, sub: { endpoint: string; p256dh: string; auth: string }) {
    await db.insert(pushSubscriptions).values({ userId, ...sub })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
  }

  async deletePushSubscription(endpoint: string) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions);
  }

  async getMasterPushSubscriptions(): Promise<PushSubscription[]> {
    return db
      .select({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .innerJoin(users, eq(pushSubscriptions.userId, users.id))
      .where(eq(users.role, "MASTER"));
  }

  async getPushSubscriptionsByUserId(userId: number): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async incrementBadgeCount(userId: number): Promise<number> {
    const result = await db
      .update(users)
      .set({ badgeCount: sql`${users.badgeCount} + 1` })
      .where(eq(users.id, userId))
      .returning({ badgeCount: users.badgeCount });
    return result.length > 0 ? result[0].badgeCount : 1;
  }

  async resetBadgeCount(userId: number): Promise<void> {
    await db
      .update(users)
      .set({ badgeCount: 0 })
      .where(eq(users.id, userId));
  }

  async getBadgeCount(userId: number): Promise<number> {
    const result = await db
      .select({ badgeCount: users.badgeCount })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return result.length > 0 ? (result[0].badgeCount ?? 0) : 0;
  }

  // ── 석유 최고가격제 ───────────────────────────────────────────────────────
  async getCeilingPrices(): Promise<OilCeilingPrices[]> {
    return db.select().from(oilCeilingPrices).orderBy(desc(oilCeilingPrices.createdAt)).limit(2);
  }
  async getAllCeilingPrices(): Promise<OilCeilingPrices[]> {
    return db.select().from(oilCeilingPrices).orderBy(desc(oilCeilingPrices.effectiveDate));
  }
  async setCeilingPrices(data: InsertOilCeilingPrices): Promise<OilCeilingPrices> {
    const [row] = await db.insert(oilCeilingPrices).values(data).returning();
    return row;
  }

  async getCeilingTrendData(effectiveDate: string, sido?: string, sigungu?: string): Promise<CeilingTrendRow[]> {
    const d = new Date(effectiveDate);
    const startD = new Date(d); // 시작 = 선택한 공표일 당일
    const endD = new Date();    // 종료 = 오늘 + 4일
    endD.setDate(endD.getDate() + 4);
    const toYYYYMMDD = (dt: Date) =>
      `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    const startDate = toYYYYMMDD(startD);
    const endDate = toYYYYMMDD(endD);
    const effectiveDateStr = effectiveDate.replace(/-/g, '');

    const sidoCond = sido ? sql` AND r.sido = ${sido}` : sql``;
    const sigunguCond = sigungu ? sql` AND r.region LIKE ${'%' + sigungu + '%'}` : sql``;
    const bSidoCond = sido ? sql` AND sido = ${sido}` : sql``;
    const bSigunguCond = sigungu ? sql` AND region LIKE ${'%' + sigungu + '%'}` : sql``;

    const result = await db.execute(
      sql`WITH baseline AS (
            SELECT
              ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END))::int AS base_gas,
              ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END))::int    AS base_diesel,
              ROUND(AVG(CASE WHEN kerosene > 0 THEN kerosene END))::int AS base_kero
            FROM oil_price_raw
            WHERE date = ${effectiveDateStr}${bSidoCond}${bSigunguCond}
          )
          SELECT
            r.date,
            ROUND(AVG(CASE WHEN r.gasoline > 0 THEN r.gasoline END))::int AS gasoline_avg,
            ROUND(AVG(CASE WHEN r.diesel > 0 THEN r.diesel END))::int    AS diesel_avg,
            ROUND(AVG(CASE WHEN r.kerosene > 0 THEN r.kerosene END))::int AS kerosene_avg,
            COUNT(CASE WHEN r.gasoline > (SELECT base_gas     FROM baseline) THEN 1 END)::int AS gasoline_above,
            COUNT(CASE WHEN r.gasoline > 0 AND r.gasoline <= (SELECT base_gas     FROM baseline) THEN 1 END)::int AS gasoline_below,
            COUNT(CASE WHEN r.diesel   > (SELECT base_diesel  FROM baseline) THEN 1 END)::int AS diesel_above,
            COUNT(CASE WHEN r.diesel   > 0 AND r.diesel   <= (SELECT base_diesel  FROM baseline) THEN 1 END)::int AS diesel_below,
            COUNT(CASE WHEN r.kerosene > (SELECT base_kero    FROM baseline) THEN 1 END)::int AS kerosene_above,
            COUNT(CASE WHEN r.kerosene > 0 AND r.kerosene <= (SELECT base_kero    FROM baseline) THEN 1 END)::int AS kerosene_below,
            (SELECT base_gas     FROM baseline) AS base_gas,
            (SELECT base_diesel  FROM baseline) AS base_diesel,
            (SELECT base_kero    FROM baseline) AS base_kero
          FROM oil_price_raw r
          WHERE r.date BETWEEN ${startDate} AND ${endDate}${sidoCond}${sigunguCond}
          GROUP BY r.date
          ORDER BY r.date`
    );
    return (result.rows as any[]).map(row => ({
      date: row.date as string,
      gasolineAvg: row.gasoline_avg != null ? Number(row.gasoline_avg) : null,
      dieselAvg: row.diesel_avg != null ? Number(row.diesel_avg) : null,
      keroseneAvg: row.kerosene_avg != null ? Number(row.kerosene_avg) : null,
      gasolineAbove: Number(row.gasoline_above) || 0,
      gasolineBelow: Number(row.gasoline_below) || 0,
      dieselAbove: Number(row.diesel_above) || 0,
      dieselBelow: Number(row.diesel_below) || 0,
      keroseneAbove: Number(row.kerosene_above) || 0,
      keroseneBelow: Number(row.kerosene_below) || 0,
      baseGas: row.base_gas != null ? Number(row.base_gas) : null,
      baseDiesel: row.base_diesel != null ? Number(row.base_diesel) : null,
      baseKerosene: row.base_kero != null ? Number(row.base_kero) : null,
    }));
  }

  async getStationCeilingTrend(effectiveDate: string, stationId: string): Promise<StationTrendRow[]> {
    const d = new Date(effectiveDate);
    const startD = new Date(d); // 시작 = 선택한 공표일 당일
    const endD = new Date();    // 종료 = 오늘 + 4일
    endD.setDate(endD.getDate() + 4);
    const toYYYYMMDD = (dt: Date) =>
      `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    const startDate = toYYYYMMDD(startD);
    const endDate = toYYYYMMDD(endD);

    const result = await db.execute(
      sql`SELECT date,
            CASE WHEN gasoline > 0 THEN gasoline END AS gasoline,
            CASE WHEN diesel > 0 THEN diesel END AS diesel,
            CASE WHEN kerosene > 0 THEN kerosene END AS kerosene
          FROM oil_price_raw
          WHERE station_id = ${stationId}
            AND date BETWEEN ${startDate} AND ${endDate}
          ORDER BY date`
    );
    return (result.rows as any[]).map(row => ({
      date: row.date as string,
      gasoline: row.gasoline != null ? Number(row.gasoline) : null,
      diesel: row.diesel != null ? Number(row.diesel) : null,
      kerosene: row.kerosene != null ? Number(row.kerosene) : null,
    }));
  }

  async getCeilingStationsForExport(params: {
    effectiveDate: string;
    role: string;
    headquartersId?: number | null;
    teamId?: number | null;
  }): Promise<CeilingStationExportRow[]> {
    const { effectiveDate, role, headquartersId, teamId } = params;
    const effectiveDateStr = effectiveDate.replace(/-/g, '');
    const nextDay = new Date(effectiveDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    let regionCond = sql``;
    let bRegionCond = sql``;

    if (role !== 'MASTER' && headquartersId) {
      const conditions: any[] = [
        eq(hqTeamRegionPermissions.headquartersId, headquartersId),
        eq(hqTeamRegionPermissions.enabled, true),
      ];
      if (teamId) conditions.push(eq(hqTeamRegionPermissions.teamId, teamId));
      const perms = await db.select().from(hqTeamRegionPermissions).where(and(...conditions));
      if (perms.length === 0) return [];
      const regions = perms.map(p => toOilRegionName(p.doName, p.siName, p.gunName, p.guName)).filter(Boolean);
      if (regions.length === 0) return [];
      const regionSqlList = sql.join(regions.map(r => sql`${r}`), sql`, `);
      regionCond = sql` AND r.region IN (${regionSqlList})`;
      bRegionCond = sql` AND region IN (${regionSqlList})`;
    }

    const result = await db.execute(
      sql`SELECT
            r.date,
            r.station_id,
            r.station_name,
            r.region,
            r.sido,
            r.brand,
            r.is_self,
            CASE WHEN r.gasoline  > 0 THEN r.gasoline  END AS gasoline,
            CASE WHEN r.diesel    > 0 THEN r.diesel    END AS diesel,
            CASE WHEN r.kerosene  > 0 THEN r.kerosene  END AS kerosene,
            b.base_gas,
            b.base_diesel,
            b.base_kero,
            CASE WHEN r.gasoline  > 0 AND b.base_gas   IS NOT NULL THEN r.gasoline  - b.base_gas   END AS gas_diff,
            CASE WHEN r.diesel    > 0 AND b.base_diesel IS NOT NULL THEN r.diesel    - b.base_diesel END AS diesel_diff,
            CASE WHEN r.kerosene  > 0 AND b.base_kero  IS NOT NULL THEN r.kerosene  - b.base_kero  END AS kero_diff,
            (SELECT ROUND(gasoline::numeric)::int  FROM oil_ceiling_prices WHERE effective_date = ${effectiveDate} LIMIT 1) AS c_gas,
            (SELECT ROUND(diesel::numeric)::int    FROM oil_ceiling_prices WHERE effective_date = ${effectiveDate} LIMIT 1) AS c_diesel,
            (SELECT ROUND(kerosene::numeric)::int  FROM oil_ceiling_prices WHERE effective_date = ${effectiveDate} LIMIT 1) AS c_kero
          FROM oil_price_raw r
          LEFT JOIN (
            SELECT station_id,
              CASE WHEN gasoline  > 0 THEN gasoline  END AS base_gas,
              CASE WHEN diesel    > 0 THEN diesel    END AS base_diesel,
              CASE WHEN kerosene  > 0 THEN kerosene  END AS base_kero
            FROM oil_price_raw
            WHERE date = ${effectiveDateStr}${bRegionCond}
          ) b ON b.station_id = r.station_id
          WHERE r.date BETWEEN ${nextDayStr} AND ${todayStr}${regionCond}
          ORDER BY r.date, r.station_name`
    );
    return (result.rows as any[]).map(row => ({
      date: String(row.date),
      stationId: String(row.station_id),
      stationName: String(row.station_name),
      region: String(row.region ?? ''),
      sido: String(row.sido ?? ''),
      brand: row.brand ? String(row.brand) : null,
      isSelf: Boolean(row.is_self),
      gasoline: row.gasoline != null ? Number(row.gasoline) : null,
      diesel: row.diesel != null ? Number(row.diesel) : null,
      kerosene: row.kerosene != null ? Number(row.kerosene) : null,
      baseGasoline: row.base_gas != null ? Number(row.base_gas) : null,
      baseDiesel: row.base_diesel != null ? Number(row.base_diesel) : null,
      baseKerosene: row.base_kero != null ? Number(row.base_kero) : null,
      gasDiff: row.gas_diff != null ? Number(row.gas_diff) : null,
      dieselDiff: row.diesel_diff != null ? Number(row.diesel_diff) : null,
      keroDiff: row.kero_diff != null ? Number(row.kero_diff) : null,
      ceilingGasoline: row.c_gas != null ? Number(row.c_gas) : null,
      ceilingDiesel: row.c_diesel != null ? Number(row.c_diesel) : null,
      ceilingKerosene: row.c_kero != null ? Number(row.c_kero) : null,
    }));
  }

  // ── 유가 수집 이력 로그 ────────────────────────────────────────────────────
  async saveOilCollectionLog(log: InsertOilCollectionLog): Promise<void> {
    await db.insert(oilCollectionLogs).values(log);
  }

  async getOilCollectionLogs(params: { page?: number; pageSize?: number; status?: string; jobType?: string } = {}): Promise<{ data: OilCollectionLog[]; total: number; page: number; totalPages: number }> {
    const { page = 1, pageSize = 30, status, jobType } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (status) conditions.push(eq(oilCollectionLogs.status, status));
    if (jobType) conditions.push(eq(oilCollectionLogs.jobType, jobType));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(oilCollectionLogs).where(where).orderBy(desc(oilCollectionLogs.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(oilCollectionLogs).where(where),
    ]);
    return { data: rows, total: Number(total), page, totalPages: Math.ceil(Number(total) / pageSize) };
  }

  // ── 만족도 조사 ──────────────────────────────────────────────────────────
  async saveSatisfaction(userId: number, rating: string): Promise<void> {
    await db.insert(userSatisfactions).values({ userId, rating });
  }

  async savePublicSatisfaction(rating: string): Promise<void> {
    await db.insert(userSatisfactions).values({ userId: null, rating });
  }

  async getSatisfactionList({ page, pageSize, search }: { page: number; pageSize: number; search?: string }): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const searchCond = search
      ? sql` AND (u.username ILIKE ${'%' + search + '%'} OR u.display_name ILIKE ${'%' + search + '%'})`
      : sql``;
    const rows = await db.execute(
      sql`SELECT s.id, s.rating, s.created_at, u.username, u.display_name
          FROM user_satisfactions s
          LEFT JOIN users u ON u.id = s.user_id
          WHERE 1=1 ${searchCond}
          ORDER BY s.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}`
    );
    const countResult = await db.execute(
      sql`SELECT COUNT(*) AS cnt
          FROM user_satisfactions s
          LEFT JOIN users u ON u.id = s.user_id
          WHERE 1=1 ${searchCond}`
    );
    const total = Number((countResult.rows[0] as any)?.cnt ?? 0);
    return { data: rows.rows as any[], total };
  }

  async hasSatisfactionToday(userId: number): Promise<boolean> {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstMidnight = new Date(kstNow);
    kstMidnight.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(kstMidnight.getTime() - 9 * 60 * 60 * 1000);
    const result = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM user_satisfactions
          WHERE user_id = ${userId}
            AND created_at >= ${todayStartUTC.toISOString()}`
    );
    return Number((result.rows[0] as any)?.cnt ?? 0) > 0;
  }

  // ── 주유소 가격 검색 ──────────────────────────────────────────────────────
  async suggestStations(params: { q: string; sido?: string; region?: string }): Promise<string[]> {
    const { q, sido, region } = params;
    const filterCond = region
      ? sql` AND region = ${region}`
      : sido
        ? sql` AND sido = ${sido}`
        : sql``;
    const result = await db.execute(sql`
      SELECT DISTINCT station_name
      FROM gas_stations_master
      WHERE station_name ILIKE ${'%' + q + '%'}
      ${filterCond}
      ORDER BY station_name
      LIMIT 15
    `);
    return (result.rows as any[]).map(r => r.station_name as string);
  }

  async suggestStationsDetailed(params: { q: string; sido?: string; region?: string }): Promise<{ stationId: string; stationName: string; region: string }[]> {
    const { q, sido, region } = params;
    const filterCond = region
      ? sql` AND region = ${region}`
      : sido
        ? sql` AND sido = ${sido}`
        : sql``;
    const result = await db.execute(sql`
      SELECT DISTINCT ON (station_name) station_id, station_name, region
      FROM gas_stations_master
      WHERE station_name ILIKE ${'%' + q + '%'}
      ${filterCond}
      ORDER BY station_name
      LIMIT 15
    `);
    return (result.rows as any[]).map(r => ({
      stationId: r.station_id as string,
      stationName: r.station_name as string,
      region: r.region as string,
    }));
  }

  async getStationSubregions(sido: string): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT region
      FROM gas_stations_master
      WHERE sido = ${sido}
        AND region IS NOT NULL
        AND region != sido
      ORDER BY region
    `);
    return (result.rows as any[]).map(r => r.region as string);
  }

  async searchStations(params: { name: string; sido?: string; region?: string }): Promise<StationSearchRow[]> {
    const { name, sido, region } = params;
    const filterCond = region
      ? sql` AND region = ${region}`
      : sido
        ? sql` AND sido = ${sido}`
        : sql``;

    // Step 1: gas_stations_master(1만 행)에서 이름·지역 필터로 station_id 목록 조회
    const masterResult = await db.execute(sql`
      SELECT station_id
      FROM gas_stations_master
      WHERE station_name ILIKE ${'%' + name + '%'}
      ${filterCond}
    `);
    const stationIds = (masterResult.rows as any[]).map(r => r.station_id as string);
    if (stationIds.length === 0) return [];

    // Step 2: (station_id, date) 복합 인덱스를 활용해 최근 20일치 가격 조회
    // week_supply_avg는 조회된 날짜 범위의 주차만 필터링해 불필요한 전체 GROUP BY 제거
    const stationIdList = sql.join(stationIds.map(id => sql`${id}`), sql`, `);
    const result = await db.execute(sql`
      WITH latest_dates AS (
        SELECT DISTINCT date
        FROM oil_price_raw
        WHERE station_id IN (${stationIdList})
        ORDER BY date DESC
        LIMIT 20
      ),
      price_rows AS (
        SELECT r.*,
          TO_CHAR(TO_DATE(r.date, 'YYYYMMDD'), 'YYYYMM') ||
          LPAD(CEIL(EXTRACT(DAY FROM TO_DATE(r.date, 'YYYYMMDD')) / 7.0)::text, 2, '0')
          AS week_key
        FROM oil_price_raw r
        WHERE r.station_id IN (${stationIdList})
          AND r.date IN (SELECT date FROM latest_dates)
      ),
      distinct_weeks AS (
        SELECT DISTINCT week_key FROM price_rows
      ),
      week_supply_avg AS (
        SELECT week,
          ROUND(AVG(gasoline::numeric)) AS avg_gasoline,
          ROUND(AVG(diesel::numeric))   AS avg_diesel,
          ROUND(AVG(kerosene::numeric)) AS avg_kerosene
        FROM oil_weekly_supply_prices
        WHERE week IN (SELECT week_key FROM distinct_weeks)
        GROUP BY week
      )
      SELECT
        pr.date, pr.station_id, pr.station_name, pr.brand, pr.is_self,
        pr.address, pr.region, pr.sido,
        pr.gasoline, pr.diesel, pr.kerosene,
        COALESCE(w.gasoline::numeric, wa.avg_gasoline) AS supply_gasoline,
        COALESCE(w.diesel::numeric,   wa.avg_diesel)   AS supply_diesel,
        COALESCE(w.kerosene::numeric, wa.avg_kerosene) AS supply_kerosene
      FROM price_rows pr
      LEFT JOIN oil_weekly_supply_prices w
        ON w.week = pr.week_key AND w.company = pr.brand
      LEFT JOIN week_supply_avg wa
        ON wa.week = pr.week_key
      ORDER BY pr.date DESC, pr.station_name
    `);
    return (result.rows as any[]).map(row => ({
      date:           row.date,
      stationId:      row.station_id,
      stationName:    row.station_name,
      brand:          row.brand ?? null,
      isSelf:         row.is_self,
      address:        row.address ?? null,
      region:         row.region,
      sido:           row.sido,
      gasoline:       row.gasoline != null ? Number(row.gasoline) : null,
      diesel:         row.diesel   != null ? Number(row.diesel)   : null,
      kerosene:       row.kerosene != null ? Number(row.kerosene) : null,
      supplyGasoline: row.supply_gasoline != null ? Number(row.supply_gasoline) : null,
      supplyDiesel:   row.supply_diesel   != null ? Number(row.supply_diesel)   : null,
      supplyKerosene: row.supply_kerosene != null ? Number(row.supply_kerosene) : null,
    }));
  }

  // ── 대시보드 ──────────────────────────────────────────────────────────────
  async getDashboardStats() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [hqCount, teamCount, userCount, recentLogin] = await Promise.all([
      db.select({ total: count() }).from(headquarters),
      db.select({ total: count() }).from(teams),
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(loginLogs).where(sql`${loginLogs.loginAt} >= ${yesterday}`),
    ]);
    return {
      headquartersCount: Number(hqCount[0].total),
      teamsCount: Number(teamCount[0].total),
      usersCount: Number(userCount[0].total),
      recentLoginCount: Number(recentLogin[0].total),
    };
  }

  // ── 주간공급가격 ───────────────────────────────────────────────────────────
  async upsertWeeklySupplyPrices(rows: InsertOilWeeklySupplyPrice[]): Promise<void> {
    if (rows.length === 0) return;
    for (const row of rows) {
      await db
        .insert(oilWeeklySupplyPrices)
        .values(row)
        .onConflictDoUpdate({
          target: [oilWeeklySupplyPrices.week, oilWeeklySupplyPrices.company],
          set: {
            premiumGasoline: row.premiumGasoline,
            gasoline: row.gasoline,
            diesel: row.diesel,
            kerosene: row.kerosene,
            createdAt: new Date(),
          },
        });
    }
  }

  async upsertWeeklySupplyFuelColumn(
    rows: { week: string; company: string; price: number | null }[],
    fuelType: 'gasoline' | 'diesel' | 'kerosene'
  ): Promise<number> {
    if (rows.length === 0) return 0;
    for (const row of rows) {
      const base = { week: row.week, company: row.company };
      const strPrice = row.price !== null ? String(row.price) : null;
      if (fuelType === 'gasoline') {
        await db.insert(oilWeeklySupplyPrices)
          .values({ ...base, gasoline: strPrice })
          .onConflictDoUpdate({
            target: [oilWeeklySupplyPrices.week, oilWeeklySupplyPrices.company],
            set: { gasoline: strPrice, createdAt: new Date() },
          });
      } else if (fuelType === 'diesel') {
        await db.insert(oilWeeklySupplyPrices)
          .values({ ...base, diesel: strPrice })
          .onConflictDoUpdate({
            target: [oilWeeklySupplyPrices.week, oilWeeklySupplyPrices.company],
            set: { diesel: strPrice, createdAt: new Date() },
          });
      } else {
        await db.insert(oilWeeklySupplyPrices)
          .values({ ...base, kerosene: strPrice })
          .onConflictDoUpdate({
            target: [oilWeeklySupplyPrices.week, oilWeeklySupplyPrices.company],
            set: { kerosene: strPrice, createdAt: new Date() },
          });
      }
    }
    return rows.length;
  }

  async getWeeklySupplyPrices(limitWeeks = 10): Promise<OilWeeklySupplyPrice[]> {
    const recentWeeks = await db
      .selectDistinct({ week: oilWeeklySupplyPrices.week })
      .from(oilWeeklySupplyPrices)
      .orderBy(desc(oilWeeklySupplyPrices.week))
      .limit(limitWeeks);

    if (recentWeeks.length === 0) return [];

    const weeks = recentWeeks.map(r => r.week);
    return db
      .select()
      .from(oilWeeklySupplyPrices)
      .where(inArray(oilWeeklySupplyPrices.week, weeks))
      .orderBy(desc(oilWeeklySupplyPrices.week), asc(oilWeeklySupplyPrices.company));
  }

  async getLatestWeeklySupplyWeek(): Promise<string | null> {
    const rows = await db
      .selectDistinct({ week: oilWeeklySupplyPrices.week })
      .from(oilWeeklySupplyPrices)
      .orderBy(desc(oilWeeklySupplyPrices.week))
      .limit(1);
    return rows[0]?.week ?? null;
  }
}

export const storage = new PostgresStorage();
