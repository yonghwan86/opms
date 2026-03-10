import { db } from "./db";
import { eq, and, ilike, or, desc, asc, count, sql } from "drizzle-orm";
import {
  headquarters, teams, users, hqTeamRegionPermissions,
  loginLogs, auditLogs,
  type Headquarters, type InsertHeadquarters,
  type Team, type InsertTeam,
  type User, type InsertUser,
  type HqTeamRegionPermission, type InsertHqTeamRegionPermission,
  type LoginLog, type AuditLog,
} from "@shared/schema";

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
    return db.select().from(headquarters).orderBy(asc(headquarters.name));
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
