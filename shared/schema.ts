import { pgTable, text, varchar, boolean, timestamp, integer, serial } from "drizzle-orm/pg-core";
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
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  positionName: text("position_name"),
  departmentName: text("department_name"),
  role: varchar("role", { length: 20 }).notNull().default("HQ_USER"),
  headquartersId: integer("headquarters_id").references(() => headquarters.id),
  teamId: integer("team_id").references(() => teams.id),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── 본부+팀 지역 권한 (HQ+Team Region Permissions) ──────────────────────────
export const hqTeamRegionPermissions = pgTable("hq_team_region_permissions", {
  id: serial("id").primaryKey(),
  headquartersId: integer("headquarters_id").notNull().references(() => headquarters.id),
  teamId: integer("team_id").notNull().references(() => teams.id),
  sidoCode: varchar("sido_code", { length: 20 }),
  sigunCode: varchar("sigun_code", { length: 20 }),
  regionName: text("region_name").notNull(),
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
