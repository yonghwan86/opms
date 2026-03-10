import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import bcrypt from "bcrypt";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import MemoryStore from "memorystore";

const MemStore = MemoryStore(session);

// ─── 세션 타입 확장 ───────────────────────────────────────────────────────────
declare module "express-session" {
  interface SessionData {
    userId?: number;
    username?: string;
    role?: string;
    headquartersId?: number | null;
    teamId?: number | null;
  }
}

// ─── 인증 미들웨어 ─────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "로그인이 필요합니다." });
  }
  next();
}

// ─── MASTER 전용 미들웨어 ──────────────────────────────────────────────────────
function requireMaster(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "로그인이 필요합니다." });
  }
  if (req.session.role !== "MASTER") {
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  }
  next();
}

// ─── 멀티파트 업로드 설정 (메모리에 저장) ─────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── 라우트 등록 ──────────────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // 세션 미들웨어 설정
  app.use(session({
    secret: process.env.SESSION_SECRET || "fuel-admin-secret-2024",
    resave: false,
    saveUninitialized: false,
    store: new MemStore({ checkPeriod: 86400000 }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));

  // ── 인증 ─────────────────────────────────────────────────────────────────

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "아이디와 비밀번호를 입력해주세요." });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }
      if (!user.enabled) {
        return res.status(403).json({ message: "비활성화된 계정입니다. 관리자에게 문의하세요." });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.headquartersId = user.headquartersId;
      req.session.teamId = user.teamId;

      // 로그인 로그 기록
      const ip = req.ip || req.socket.remoteAddress;
      const ua = req.headers["user-agent"];
      await storage.createLoginLog(user.id, ip, ua);
      await storage.createAuditLog(user.id, "LOGIN", "user", user.id, { username: user.username });

      const { passwordHash: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    await storage.createAuditLog(userId, "LOGOUT", "user", userId, {});
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "로그아웃 되었습니다." });
    });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 본부 ─────────────────────────────────────────────────────────────────

  // GET /api/headquarters
  app.get("/api/headquarters", requireAuth, async (req, res) => {
    try {
      const { search, page, pageSize, enabled, all } = req.query;
      if (all === "true") {
        const data = await storage.getHeadquartersAll();
        return res.json(data);
      }
      const result = await storage.getHeadquarters({
        search: search as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
        enabled: enabled === "true" ? true : enabled === "false" ? false : undefined,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/headquarters
  app.post("/api/headquarters", requireMaster, async (req, res) => {
    try {
      const { name, code, enabled } = req.body;
      if (!name || !code) return res.status(400).json({ message: "이름과 코드는 필수입니다." });
      const existing = await storage.getHeadquartersByCode(code);
      if (existing) return res.status(409).json({ message: "이미 사용 중인 코드입니다." });
      const hq = await storage.createHeadquarters({ name, code, enabled: enabled !== false });
      await storage.createAuditLog(req.session.userId!, "CREATE", "headquarters", hq.id, { name, code });
      res.status(201).json(hq);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // PATCH /api/headquarters/:id
  app.patch("/api/headquarters/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const hq = await storage.updateHeadquarters(id, req.body);
      await storage.createAuditLog(req.session.userId!, "UPDATE", "headquarters", id, req.body);
      res.json(hq);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // DELETE /api/headquarters/:id
  app.delete("/api/headquarters/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteHeadquarters(id);
      await storage.createAuditLog(req.session.userId!, "DELETE", "headquarters", id, {});
      res.json({ message: "삭제되었습니다." });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 팀 ───────────────────────────────────────────────────────────────────

  // GET /api/teams
  app.get("/api/teams", requireAuth, async (req, res) => {
    try {
      const { search, headquartersId, page, pageSize, enabled, all } = req.query;
      if (all === "true") {
        const data = await storage.getTeamsAll(headquartersId ? Number(headquartersId) : undefined);
        return res.json(data);
      }
      const result = await storage.getTeams({
        search: search as string,
        headquartersId: headquartersId ? Number(headquartersId) : undefined,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
        enabled: enabled === "true" ? true : enabled === "false" ? false : undefined,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/teams
  app.post("/api/teams", requireMaster, async (req, res) => {
    try {
      const { name, code, headquartersId, enabled } = req.body;
      if (!name || !code || !headquartersId) return res.status(400).json({ message: "이름, 코드, 본부 ID는 필수입니다." });
      const existing = await storage.getTeamByCode(code);
      if (existing) return res.status(409).json({ message: "이미 사용 중인 코드입니다." });
      const team = await storage.createTeam({ name, code, headquartersId: Number(headquartersId), enabled: enabled !== false });
      await storage.createAuditLog(req.session.userId!, "CREATE", "team", team.id, { name, code });
      res.status(201).json(team);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // PATCH /api/teams/:id
  app.patch("/api/teams/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const team = await storage.updateTeam(id, req.body);
      await storage.createAuditLog(req.session.userId!, "UPDATE", "team", id, req.body);
      res.json(team);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // DELETE /api/teams/:id
  app.delete("/api/teams/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteTeam(id);
      await storage.createAuditLog(req.session.userId!, "DELETE", "team", id, {});
      res.json({ message: "삭제되었습니다." });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 사용자 ──────────────────────────────────────────────────────────────

  // GET /api/users
  app.get("/api/users", requireMaster, async (req, res) => {
    try {
      const { search, headquartersId, teamId, role, page, pageSize } = req.query;
      const result = await storage.getUsers({
        search: search as string,
        headquartersId: headquartersId ? Number(headquartersId) : undefined,
        teamId: teamId ? Number(teamId) : undefined,
        role: role as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      const safeData = result.data.map(({ passwordHash: _, ...u }) => u);
      res.json({ ...result, data: safeData });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/users
  app.post("/api/users", requireMaster, async (req, res) => {
    try {
      const { username, password, displayName, email, positionName, departmentName, role, headquartersId, teamId, enabled } = req.body;
      if (!username || !password || !displayName || !email) {
        return res.status(400).json({ message: "아이디, 비밀번호, 이름, 이메일은 필수입니다." });
      }
      const dupUser = await storage.getUserByUsername(username);
      if (dupUser) return res.status(409).json({ message: "이미 사용 중인 아이디입니다." });
      const dupEmail = await storage.getUserByEmail(email);
      if (dupEmail) return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username, passwordHash, displayName, email, positionName, departmentName,
        role: role || "HQ_USER",
        headquartersId: headquartersId ? Number(headquartersId) : null,
        teamId: teamId ? Number(teamId) : null,
        enabled: enabled !== false,
      });
      await storage.createAuditLog(req.session.userId!, "CREATE", "user", user.id, { username, email, role });
      const { passwordHash: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // PATCH /api/users/:id
  app.patch("/api/users/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { password, ...rest } = req.body;
      const updateData: any = { ...rest };
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }
      const user = await storage.updateUser(id, updateData);
      await storage.createAuditLog(req.session.userId!, "UPDATE", "user", id, { ...rest });
      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/users/:id/reset-password
  app.post("/api/users/:id/reset-password", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const newPassword = req.body.password || Math.random().toString(36).slice(-8) + "A1!";
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(id, { passwordHash });
      await storage.createAuditLog(req.session.userId!, "RESET_PASSWORD", "user", id, {});
      res.json({ message: "비밀번호가 초기화되었습니다.", temporaryPassword: newPassword });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/users/upload-template (샘플 엑셀 템플릿 다운로드)
  app.get("/api/users/upload-template", requireMaster, async (req, res) => {
    try {
      const wb = XLSX.utils.book_new();
      const headers = ["username", "display_name", "email", "position_name", "department_name", "headquarters_code", "team_code", "role", "enabled", "initial_password"];
      const sampleData = [
        ["user001", "홍길동", "hong@example.com", "사원", "영업부", "HQ_SEOUL", "SEOUL_T1", "HQ_USER", "TRUE", "Pass1234!"],
        ["user002", "김철수", "kim@example.com", "주임", "마케팅부", "HQ_BUSAN", "BUSAN_T1", "HQ_USER", "TRUE", "Pass1234!"],
        ["user003", "이영희", "lee@example.com", "대리", "IT운영부", "HQ_DAEGU", "DAEGU_T1", "HQ_USER", "TRUE", ""],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      XLSX.utils.book_append_sheet(wb, ws, "사용자_업로드");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", "attachment; filename=user_upload_template.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/users/upload-excel (엑셀 업로드)
  app.post("/api/users/upload-excel", requireMaster, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요." });
      if (!req.file.originalname.endsWith(".xlsx")) {
        return res.status(400).json({ message: "xlsx 파일만 업로드 가능합니다." });
      }
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const requiredCols = ["username", "display_name", "email", "position_name", "department_name", "headquarters_code", "team_code", "role", "enabled", "initial_password"];
      if (rows.length === 0) return res.status(400).json({ message: "데이터가 없습니다." });

      const firstRow = rows[0];
      const missingCols = requiredCols.filter(c => !(c in firstRow));
      if (missingCols.length > 0) {
        return res.status(400).json({ message: `필수 컬럼이 없습니다: ${missingCols.join(", ")}` });
      }

      const results: { row: number; status: "success" | "fail"; reason?: string }[] = [];
      const usernamesInFile = new Set<string>();
      const emailsInFile = new Set<string>();
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        const username = String(row.username || "").trim();
        const displayName = String(row.display_name || "").trim();
        const email = String(row.email || "").trim();
        const positionName = String(row.position_name || "").trim();
        const departmentName = String(row.department_name || "").trim();
        const hqCode = String(row.headquarters_code || "").trim();
        const teamCode = String(row.team_code || "").trim();
        const role = String(row.role || "HQ_USER").trim();
        const enabled = String(row.enabled || "TRUE").toUpperCase() !== "FALSE";
        const initialPassword = String(row.initial_password || "").trim();

        // 빈 행 건너뜀
        if (!username && !email) {
          results.push({ row: rowNum, status: "fail", reason: "빈 행" });
          failCount++;
          continue;
        }

        // 유효성 검사
        if (!username) { results.push({ row: rowNum, status: "fail", reason: "username 누락" }); failCount++; continue; }
        if (!email) { results.push({ row: rowNum, status: "fail", reason: "email 누락" }); failCount++; continue; }
        if (!["MASTER", "HQ_USER"].includes(role)) { results.push({ row: rowNum, status: "fail", reason: `role 값 오류: ${role}` }); failCount++; continue; }

        // 파일 내 중복
        if (usernamesInFile.has(username)) { results.push({ row: rowNum, status: "fail", reason: "파일 내 username 중복" }); failCount++; continue; }
        if (emailsInFile.has(email)) { results.push({ row: rowNum, status: "fail", reason: "파일 내 email 중복" }); failCount++; continue; }

        // DB 중복
        const dupUser = await storage.getUserByUsername(username);
        if (dupUser) { results.push({ row: rowNum, status: "fail", reason: "username 이미 사용 중" }); failCount++; continue; }
        const dupEmail = await storage.getUserByEmail(email);
        if (dupEmail) { results.push({ row: rowNum, status: "fail", reason: "email 이미 사용 중" }); failCount++; continue; }

        // 본부 코드 확인
        const hq = await storage.getHeadquartersByCode(hqCode);
        if (!hq) { results.push({ row: rowNum, status: "fail", reason: `본부 코드 없음: ${hqCode}` }); failCount++; continue; }

        // 팀 코드 확인
        const team = await storage.getTeamByCode(teamCode);
        if (!team) { results.push({ row: rowNum, status: "fail", reason: `팀 코드 없음: ${teamCode}` }); failCount++; continue; }
        if (team.headquartersId !== hq.id) { results.push({ row: rowNum, status: "fail", reason: "팀이 해당 본부에 속하지 않음" }); failCount++; continue; }

        // 비밀번호 생성
        const password = initialPassword || Math.random().toString(36).slice(-8) + "A1!";
        const passwordHash = await bcrypt.hash(password, 10);

        await storage.createUser({ username, passwordHash, displayName: displayName || username, email, positionName, departmentName, role, headquartersId: hq.id, teamId: team.id, enabled });
        usernamesInFile.add(username);
        emailsInFile.add(email);
        results.push({ row: rowNum, status: "success" });
        successCount++;
      }

      await storage.createAuditLog(req.session.userId!, "EXCEL_UPLOAD", "user", undefined, { successCount, failCount });
      res.json({ successCount, failCount, results });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 지역 권한 ─────────────────────────────────────────────────────────────

  // GET /api/hq-team-region-permissions
  app.get("/api/hq-team-region-permissions", requireAuth, async (req, res) => {
    try {
      const { headquartersId, teamId, search, page, pageSize } = req.query;
      const role = req.session.role;

      // HQ_USER는 자신의 본부+팀 조합만 조회 가능
      let hqId = headquartersId ? Number(headquartersId) : undefined;
      let tId = teamId ? Number(teamId) : undefined;
      if (role !== "MASTER") {
        hqId = req.session.headquartersId ?? undefined;
        tId = req.session.teamId ?? undefined;
        if (!hqId || !tId) return res.status(403).json({ message: "권한이 없습니다." });
      }

      const result = await storage.getRegionPermissions({
        headquartersId: hqId,
        teamId: tId,
        search: search as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/hq-team-region-permissions
  app.post("/api/hq-team-region-permissions", requireMaster, async (req, res) => {
    try {
      const { headquartersId, teamId, sidoCode, sigunCode, regionName, enabled } = req.body;
      if (!headquartersId || !teamId || !regionName) {
        return res.status(400).json({ message: "본부, 팀, 지역명은 필수입니다." });
      }
      const perm = await storage.createRegionPermission({
        headquartersId: Number(headquartersId), teamId: Number(teamId),
        sidoCode, sigunCode, regionName, enabled: enabled !== false,
      });
      await storage.createAuditLog(req.session.userId!, "CREATE", "region_permission", perm.id, { regionName });
      res.status(201).json(perm);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // PATCH /api/hq-team-region-permissions/:id
  app.patch("/api/hq-team-region-permissions/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const perm = await storage.updateRegionPermission(id, req.body);
      await storage.createAuditLog(req.session.userId!, "UPDATE", "region_permission", id, req.body);
      res.json(perm);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // DELETE /api/hq-team-region-permissions/:id
  app.delete("/api/hq-team-region-permissions/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteRegionPermission(id);
      await storage.createAuditLog(req.session.userId!, "DELETE", "region_permission", id, {});
      res.json({ message: "삭제되었습니다." });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 로그인 로그 ──────────────────────────────────────────────────────────

  // GET /api/login-logs
  app.get("/api/login-logs", requireMaster, async (req, res) => {
    try {
      const { userId, search, page, pageSize } = req.query;
      const result = await storage.getLoginLogs({
        userId: userId ? Number(userId) : undefined,
        search: search as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 감사 로그 ────────────────────────────────────────────────────────────

  // GET /api/audit-logs
  app.get("/api/audit-logs", requireMaster, async (req, res) => {
    try {
      const { userId, actionType, targetType, search, page, pageSize } = req.query;
      const result = await storage.getAuditLogs({
        userId: userId ? Number(userId) : undefined,
        actionType: actionType as string,
        targetType: targetType as string,
        search: search as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 대시보드 ─────────────────────────────────────────────────────────────

  // GET /api/dashboard/stats
  app.get("/api/dashboard/stats", requireMaster, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  return httpServer;
}
