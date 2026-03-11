import { db } from "./db";
import { eq, and, ilike, or, desc, asc, count, sql, inArray } from "drizzle-orm";
import {
  headquarters, teams, users, hqTeamRegionPermissions,
  loginLogs, auditLogs,
  oilPriceRaw, oilPriceAnalysis,
  pushSubscriptions,
  type Headquarters, type InsertHeadquarters,
  type Team, type InsertTeam,
  type User, type InsertUser,
  type HqTeamRegionPermission, type InsertHqTeamRegionPermission,
  type LoginLog, type AuditLog,
  type InsertOilPriceRaw, type OilPriceRaw,
  type InsertOilPriceAnalysis, type OilPriceAnalysis,
  type PushSubscription, type InsertPushSubscription,
} from "@shared/schema";

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
  createHeadquarters(data: InsertHeadquarters): Promise<Headquarters>;
  updateHeadquarters(id: number, data: Partial<InsertHeadquarters>): Promise<Headquarters>;
  deleteHeadquarters(id: number): Promise<void>;

  // 팀
  getTeams(params?: { search?: string; headquartersId?: number; page?: number; pageSize?: number; enabled?: boolean }): Promise<PaginatedResult<Team>>;
  getTeamsAll(headquartersId?: number): Promise<Team[]>;
  getTeamById(id: number): Promise<Team | undefined>;
  getTeamByCode(code: string): Promise<Team | undefined>;
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

  // 대시보드 통계
  getDashboardStats(): Promise<{
    headquartersCount: number;
    teamsCount: number;
    usersCount: number;
    recentLoginCount: number;
  }>;

  // 유가 원본 데이터
  saveOilPriceRaw(rows: InsertOilPriceRaw[]): Promise<void>;
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
    type: 'HIGH' | 'LOW' | 'RISE' | 'FALL' | 'WIDE';
    fuelType: 'gasoline' | 'diesel' | 'kerosene';
    date: string;
    prevDate?: string;
    regions: { sidoList: string[]; regionList: string[] } | null;
    sido?: string;
  }): Promise<OilTopStation[]>;
  getOilAvailableDates(): Promise<string[]>;
  getUserPermittedRegions(userId: number): Promise<{ sidoList: string[]; regionList: string[] }>;
  getOilSubregions(date: string, permitted: { sidoList: string[]; regionList: string[] }): Promise<string[]>;

  // 대시보드 유가 분석
  getOilNationalAverages(date: string, prevDate: string): Promise<{
    gasoline: number; diesel: number; kerosene: number;
    gasolineChange: number; dieselChange: number; keroseneChange: number;
  }>;
  getOilPriceSpread(date: string): Promise<{
    spread: number; maxPrice: number; maxStation: string; maxRegion: string;
    minPrice: number; minStation: string; minRegion: string;
  }>;
  getOilRegionalAverages(date: string): Promise<{ sido: string; avgPrice: number }[]>;
  getOilDomesticHistory(): Promise<{ date: string; gasoline: number; diesel: number }[]>;

  // 푸시 구독
  savePushSubscription(userId: number, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  getPushSubscriptionsByUserId(userId: number): Promise<PushSubscription[]>;
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
      ilike(users.email, `%${search}%`),
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
          },
        });
    }
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
    type: 'HIGH' | 'LOW' | 'RISE' | 'FALL' | 'WIDE';
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

    } else {
      // WIDE: fuelType에 따라 분기
      if (fuelType === 'diesel') {
        // 경유-등유 가격차
        const result = await db.execute(
          sql`SELECT station_id, station_name, region, sido, brand, is_self,
                     diesel, kerosene, (diesel - kerosene) AS diff
              FROM oil_price_raw
              WHERE date = ${date} AND diesel > 0 AND kerosene > 0${sidoCond}${regionCond}
              ORDER BY (diesel - kerosene) DESC LIMIT 10`
        );
        rawRows = result.rows as any[];
      } else {
        // 휘발유-경유 가격차 (default)
        const result = await db.execute(
          sql`SELECT station_id, station_name, region, sido, brand, is_self,
                     gasoline, diesel, (gasoline - diesel) AS diff
              FROM oil_price_raw
              WHERE date = ${date} AND gasoline > 0 AND diesel > 0${sidoCond}${regionCond}
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
      .limit(60);
    return result.map(r => r.date);
  }

  async getUserPermittedRegions(userId: number): Promise<{ sidoList: string[]; regionList: string[] }> {
    const user = await this.getUserById(userId);
    if (!user || !user.teamId) return { sidoList: [], regionList: [] };
    const perms = await db
      .select()
      .from(hqTeamRegionPermissions)
      .where(and(
        eq(hqTeamRegionPermissions.teamId, user.teamId),
        eq(hqTeamRegionPermissions.enabled, true),
      ));
    const sidoList: string[] = [];
    const regionList: string[] = [];
    for (const p of perms) {
      const sigungu = p.guName || p.siName || p.gunName;
      if (sigungu) {
        const sidoAbbrev = p.doName ? (SIDO_ABBREV[p.doName] || p.doName) : '';
        regionList.push(`${sidoAbbrev} ${sigungu}`.trim());
      } else if (p.doName) {
        sidoList.push(SIDO_ABBREV[p.doName] || p.doName);
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

  async getOilPriceSpread(date: string) {
    const spreadRes = await db.execute(sql`
      SELECT
        MAX(gasoline) AS max_price,
        MIN(CASE WHEN gasoline > 0 THEN gasoline END) AS min_price,
        MAX(gasoline) - MIN(CASE WHEN gasoline > 0 THEN gasoline END) AS spread
      FROM oil_price_raw WHERE date = ${date} AND gasoline > 0`);
    const s = spreadRes.rows[0] as any;
    const maxPrice = Number(s?.max_price) || 0;
    const minPrice = Number(s?.min_price) || 0;
    const [maxRow, minRow] = await Promise.all([
      db.execute(sql`SELECT station_name, region FROM oil_price_raw WHERE date = ${date} AND gasoline = ${maxPrice} LIMIT 1`),
      db.execute(sql`SELECT station_name, region FROM oil_price_raw WHERE date = ${date} AND gasoline = ${minPrice} LIMIT 1`),
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
  }

  async getOilRegionalAverages(date: string) {
    const result = await db.execute(sql`
      SELECT sido, ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS avg_price
      FROM oil_price_raw
      WHERE date = ${date}
      GROUP BY sido
      HAVING AVG(CASE WHEN gasoline > 0 THEN gasoline END) IS NOT NULL
      ORDER BY avg_price DESC
      LIMIT 10`);
    return result.rows.map((r: any) => ({ sido: r.sido as string, avgPrice: Number(r.avg_price) }));
  }

  async getOilDomesticHistory() {
    const result = await db.execute(sql`
      SELECT
        date,
        ROUND(AVG(CASE WHEN gasoline > 0 THEN gasoline END)) AS gasoline,
        ROUND(AVG(CASE WHEN diesel > 0 THEN diesel END)) AS diesel
      FROM oil_price_raw
      GROUP BY date
      ORDER BY date ASC`);
    return result.rows.map((r: any) => ({
      date: r.date as string,
      gasoline: Number(r.gasoline),
      diesel: Number(r.diesel),
    }));
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

  async getPushSubscriptionsByUserId(userId: number): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
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
}

export const storage = new PostgresStorage();
