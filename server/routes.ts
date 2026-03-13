import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import bcrypt from "bcrypt";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import connectPgSimple from "connect-pg-simple";
import { initPush, getVapidPublicKey, sendPush, sendPushToAll } from "./services/pushService";

const PgStore = connectPgSimple(session);

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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// multer 오류를 JSON으로 변환하는 래퍼
function handleUpload(middleware: ReturnType<typeof multer>["array"] | ReturnType<typeof multer>["single"]) {
  return (req: Request, res: Response, next: NextFunction) => {
    (middleware as any)(req, res, (err: any) => {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE"
          ? "파일 크기가 너무 큽니다. 파일당 최대 50MB까지 업로드 가능합니다."
          : err.message || "파일 업로드 중 오류가 발생했습니다.";
        return res.status(400).json({ message: msg });
      }
      next();
    });
  };
}

// ─── 라우트 등록 ──────────────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // 푸시 알림 초기화
  initPush();

  // 세션 미들웨어 설정
  app.use(session({
    secret: process.env.SESSION_SECRET || "fuel-admin-secret-2024",
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      ttl: 7 * 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  // ── 인증 ─────────────────────────────────────────────────────────────────

  // POST /api/auth/check-user (아이디 존재 여부 + 비밀번호 설정 필요 여부 확인)
  app.post("/api/auth/check-user", async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ message: "아이디를 입력해주세요." });
      }
      const user = await storage.getUserByUsername(username.trim().toLowerCase());
      if (!user || !user.enabled) {
        return res.json({ exists: false });
      }
      return res.json({
        exists: true,
        needsPasswordSetup: !user.passwordHash || user.mustChangePassword,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  // POST /api/auth/check-email (하위 호환 — 기존 세션 유지용)
  app.post("/api/auth/check-email", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "이메일을 입력해주세요." });
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user || !user.enabled) return res.json({ exists: false });
      return res.json({ exists: true, needsPasswordSetup: !user.passwordHash || user.mustChangePassword });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  // POST /api/auth/login (아이디 로그인)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "아이디와 비밀번호를 입력해주세요." });
      }
      const user = await storage.getUserByUsername(username.trim().toLowerCase());
      if (!user) {
        return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }
      if (!user.enabled) {
        return res.status(403).json({ message: "비활성화된 계정입니다. 관리자에게 문의하세요." });
      }

      // 비밀번호 미설정 또는 최초 로그인 필요 시 → 비밀번호 설정 화면으로
      if (!user.passwordHash || user.mustChangePassword) {
        return res.json({ needsPasswordSetup: true });
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

  // POST /api/auth/setup-password (최초 비밀번호 설정 / 초기화 후 재설정)
  app.post("/api/auth/setup-password", async (req, res) => {
    try {
      const { username, newPassword } = req.body;
      if (!username || !newPassword) {
        return res.status(400).json({ message: "아이디와 새 비밀번호를 입력해주세요." });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "비밀번호는 8자 이상이어야 합니다." });
      }
      const user = await storage.getUserByUsername(username.trim().toLowerCase());
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      }
      if (!user.enabled) {
        return res.status(403).json({ message: "비활성화된 계정입니다. 관리자에게 문의하세요." });
      }
      if (user.passwordHash && !user.mustChangePassword) {
        return res.status(400).json({ message: "비밀번호가 이미 설정되어 있습니다." });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, passwordHash);

      // 비밀번호 설정 후 자동 로그인
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.headquartersId = user.headquartersId;
      req.session.teamId = user.teamId;

      const ip = req.ip || req.socket.remoteAddress;
      const ua = req.headers["user-agent"];
      await storage.createLoginLog(user.id, ip, ua);
      await storage.createAuditLog(user.id, "SET_PASSWORD", "user", user.id, { username: user.username });

      const updatedUser = await storage.getUserById(user.id);
      const { passwordHash: _, ...safeUser } = updatedUser!;
      res.json({ user: safeUser });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req, res) => {
    const userId = req.session.userId;
    if (userId) {
      await storage.createAuditLog(userId, "LOGOUT", "user", userId, {});
    }
    req.session.destroy(() => {
      res.clearCookie("connect.sid", { path: "/" });
      res.json({ message: "로그아웃 되었습니다." });
    });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      const { passwordHash: _, ...safeUser } = user;
      let headquartersCode: string | null = null;
      if (user.headquartersId) {
        const hq = await storage.getHeadquartersById(user.headquartersId);
        headquartersCode = hq?.code ?? null;
      }
      res.json({ ...safeUser, headquartersCode });
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
      const { username: rawUsername, email: rawEmail, positionName, departmentName, role, headquartersId, teamId, enabled } = req.body;
      if (!rawUsername) {
        return res.status(400).json({ message: "아이디(ID)는 필수입니다." });
      }
      const username = rawUsername.trim().toLowerCase().replace(/[^a-zA-Z0-9._-]/g, "");
      if (!username) {
        return res.status(400).json({ message: "아이디(ID)는 영문/숫자/점/하이픈만 사용할 수 있습니다." });
      }
      const dupUser = await storage.getUserByUsername(username);
      if (dupUser) return res.status(409).json({ message: "이미 사용 중인 아이디입니다." });

      const emailVal = rawEmail ? String(rawEmail).trim().toLowerCase() || null : null;
      const user = await storage.createUser({
        username,
        passwordHash: null,
        displayName: username,
        email: emailVal,
        positionName,
        departmentName,
        role: role || "HQ_USER",
        headquartersId: headquartersId ? Number(headquartersId) : null,
        teamId: teamId ? Number(teamId) : null,
        enabled: enabled !== false,
        mustChangePassword: true,
      });
      await storage.createAuditLog(req.session.userId!, "CREATE", "user", user.id, { username, role });
      const { passwordHash: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (e) {
      console.error(e);
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

  // POST /api/users/:id/reset-password (비밀번호 초기화 → 다음 로그인 시 본인이 재설정)
  app.post("/api/users/:id/reset-password", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.resetUserPassword(id);
      await storage.createAuditLog(req.session.userId!, "RESET_PASSWORD", "user", id, {});
      res.json({ message: "비밀번호가 초기화되었습니다. 사용자가 다음 로그인 시 비밀번호를 직접 설정합니다." });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // DELETE /api/users/:id (사용자 삭제, MASTER only)
  app.delete("/api/users/:id", requireMaster, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const target = await storage.getUserById(id);
      if (!target) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      }
      if (target.role === "MASTER") {
        const masters = await storage.getUsers({ role: "MASTER", pageSize: 999 });
        if (masters.total <= 1) {
          return res.status(400).json({ message: "마스터 계정이 하나뿐이라 삭제할 수 없습니다." });
        }
      }
      await storage.deleteUser(id);
      await storage.createAuditLog(req.session.userId!, "DELETE", "user", id, {});
      res.json({ message: "사용자가 삭제되었습니다." });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/users/upload-template (샘플 엑셀 템플릿 다운로드)
  app.get("/api/users/upload-template", requireMaster, async (req, res) => {
    try {
      const wb = XLSX.utils.book_new();
      const headers = ["ID", "이메일(선택)", "부서", "직위", "역할(선택-값있으면마스터)"];
      const sampleData = [
        ["honggildong", "", "수도권남부본부 검사1팀", "사원", ""],
        ["kimcheolsu", "", "수도권북부본부 검사2팀", "팀장", ""],
        ["leeyounghee", "lee@company.com", "기획처 기획예산팀", "처장", ""],
        ["adminuser", "", "감사실", "실장", "마스터"],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, ws, "사용자_업로드");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", "attachment; filename=user_upload_template.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/users/upload-excel (엑셀 업로드 - 새 양식: ID/이메일/부서/직위/역할)
  app.post("/api/users/upload-excel", requireMaster, handleUpload(upload.single("file")), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요." });
      if (!req.file.originalname.endsWith(".xlsx")) {
        return res.status(400).json({ message: "xlsx 파일만 업로드 가능합니다." });
      }
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) return res.status(400).json({ message: "데이터가 없습니다." });

      const firstRow = rows[0];
      const missingCols = ["ID", "부서", "직위"].filter(c => !(c in firstRow));
      if (missingCols.length > 0) {
        return res.status(400).json({ message: `필수 컬럼이 없습니다: ${missingCols.join(", ")} (필요: ID, 부서, 직위)` });
      }

      const results: { row: number; status: "success" | "updated" | "fail"; reason?: string }[] = [];
      const idsInFile = new Set<string>();
      let insertedCount = 0;
      let updatedCount = 0;
      let failCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const userId = String(row["ID"] || "").trim().toLowerCase().replace(/[^a-zA-Z0-9._-]/g, "");
        const emailRaw = String(row["이메일(선택)"] || row["이메일"] || row["email"] || "").trim().toLowerCase();
        const emailVal = emailRaw || null;
        const deptRaw = String(row["부서"] || "").trim();
        const positionName = String(row["직위"] || "").trim();
        const roleRaw = String(row["역할(선택-값있으면마스터)"] || row["역할"] || "").trim();
        const role = roleRaw ? "MASTER" : "HQ_USER";

        // 빈 행 건너뜀
        if (!userId) {
          results.push({ row: rowNum, status: "fail", reason: "빈 행 또는 ID 누락" });
          failCount++;
          continue;
        }
        if (!deptRaw) {
          results.push({ row: rowNum, status: "fail", reason: "부서 누락" });
          failCount++;
          continue;
        }

        // 파일 내 ID 중복
        if (idsInFile.has(userId)) {
          results.push({ row: rowNum, status: "fail", reason: "파일 내 ID 중복" });
          failCount++;
          continue;
        }
        idsInFile.add(userId);

        // 부서 파싱: 본부 포함 여부
        let hqId: number | null = null;
        let teamId: number | null = null;
        let departmentName: string = deptRaw;

        if (deptRaw.includes("본부")) {
          const spaceIdx = deptRaw.indexOf(" ");
          const hqName = spaceIdx > -1 ? deptRaw.slice(0, spaceIdx) : deptRaw;
          const teamName = spaceIdx > -1 ? deptRaw.slice(spaceIdx + 1) : "";

          const hq = await storage.getHeadquartersByName(hqName);
          if (!hq) {
            results.push({ row: rowNum, status: "fail", reason: `본부 없음: ${hqName}` });
            failCount++;
            continue;
          }
          hqId = hq.id;

          if (teamName) {
            const team = await storage.getTeamByName(teamName, hq.id);
            if (!team) {
              results.push({ row: rowNum, status: "fail", reason: `팀 없음: ${teamName} (${hqName})` });
              failCount++;
              continue;
            }
            teamId = team.id;
          }
        }

        // upsert: 기존 사용자 확인
        const existing = await storage.getUserByUsername(userId);
        if (existing) {
          await storage.updateUser(existing.id, {
            departmentName,
            positionName,
            headquartersId: hqId ?? undefined,
            teamId: teamId ?? undefined,
            role,
          });
          results.push({ row: rowNum, status: "updated" });
          updatedCount++;
        } else {
          await storage.createUser({
            username: userId,
            passwordHash: null,
            displayName: userId,
            email: emailVal,
            positionName,
            departmentName,
            role,
            headquartersId: hqId ?? undefined,
            teamId: teamId ?? undefined,
            enabled: true,
            mustChangePassword: true,
          });
          results.push({ row: rowNum, status: "success" });
          insertedCount++;
        }
      }

      await storage.createAuditLog(req.session.userId!, "EXCEL_UPLOAD", "user", undefined, { insertedCount, updatedCount, failCount });
      res.json({ insertedCount, updatedCount, failCount, results });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── 지역 권한 ─────────────────────────────────────────────────────────────

  // GET /api/hq-team-region-permissions/upload-template (본부 권한 엑셀 템플릿)
  app.get("/api/hq-team-region-permissions/upload-template", requireMaster, async (req, res) => {
    try {
      const wb = XLSX.utils.book_new();
      const headers = ["본부명", "팀명", "도", "시", "군", "구"];
      const sampleData = [
        ["서울본부", "서울1팀", "서울특별시", "", "", "종로구"],
        ["서울본부", "서울1팀", "경기도", "수원시", "", "팔달구"],
        ["부산본부", "부산1팀", "부산광역시", "", "", "중구"],
        ["서울본부", "서울2팀", "강원특별자치도", "", "양구군", ""],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      ws["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, "본부권한_업로드");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", "attachment; filename=region_permission_template.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/hq-team-region-permissions/upload-excel (본부 권한 엑셀 일괄 등록)
  app.post("/api/hq-team-region-permissions/upload-excel", requireMaster, handleUpload(upload.single("file")), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요." });
      if (!req.file.originalname.endsWith(".xlsx")) {
        return res.status(400).json({ message: "xlsx 파일만 업로드 가능합니다." });
      }
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) return res.status(400).json({ message: "데이터가 없습니다." });

      // 모든 본부/팀 미리 로드 (이름 → ID 매핑)
      const allHq = await storage.getHeadquartersAll();
      const allTeams = await storage.getTeamsAll();
      const hqByName = new Map(allHq.map(h => [h.name, h]));
      const teamByNameAndHq = new Map(allTeams.map(t => [`${t.headquartersId}:${t.name}`, t]));

      const results: { row: number; status: "success" | "fail"; reason?: string }[] = [];
      let addedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        const hqName = String(row["본부명"] || "").trim();
        const teamName = String(row["팀명"] || "").trim();
        const doName = String(row["도"] || "").trim() || null;
        const siName = String(row["시"] || "").trim() || null;
        const gunName = String(row["군"] || "").trim() || null;
        const guName = String(row["구"] || "").trim() || null;

        // 빈 행 건너뜀
        if (!hqName && !teamName && !doName) {
          skippedCount++;
          continue;
        }

        if (!hqName) { results.push({ row: rowNum, status: "fail", reason: "본부명 누락" }); skippedCount++; continue; }
        if (!teamName) { results.push({ row: rowNum, status: "fail", reason: "팀명 누락" }); skippedCount++; continue; }
        if (!doName) { results.push({ row: rowNum, status: "fail", reason: "도 누락 (필수)" }); skippedCount++; continue; }

        const hq = hqByName.get(hqName);
        if (!hq) { results.push({ row: rowNum, status: "fail", reason: `본부 없음: ${hqName}` }); skippedCount++; continue; }

        const team = teamByNameAndHq.get(`${hq.id}:${teamName}`);
        if (!team) { results.push({ row: rowNum, status: "fail", reason: `팀 없음: ${teamName}` }); skippedCount++; continue; }

        const regionName = [doName, siName, gunName, guName].filter(Boolean).join(" ");

        await storage.createRegionPermission({
          headquartersId: hq.id,
          teamId: team.id,
          doName,
          siName,
          gunName,
          guName,
          regionName,
          enabled: true,
        });
        results.push({ row: rowNum, status: "success" });
        addedCount++;
      }

      await storage.createAuditLog(req.session.userId!, "EXCEL_UPLOAD", "region_permission", undefined, { addedCount, skippedCount });
      res.json({ addedCount, skippedCount, results });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류" });
    }
  });

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
      const { headquartersId, teamId, doName, siName, gunName, guName, sidoCode, sigunCode, regionName, enabled } = req.body;
      if (!headquartersId || !teamId || !regionName) {
        return res.status(400).json({ message: "본부, 팀, 지역명은 필수입니다." });
      }
      const perm = await storage.createRegionPermission({
        headquartersId: Number(headquartersId), teamId: Number(teamId),
        doName: doName || null, siName: siName || null, gunName: gunName || null, guName: guName || null,
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

  // ── 페이지 뷰 로그 ─────────────────────────────────────────────────────

  // POST /api/logs/page-view (로그인 사용자 전용 — 자동 기록)
  app.post("/api/logs/page-view", requireAuth, async (req, res) => {
    try {
      const { page, device } = req.body;
      if (!page || typeof page !== "string") return res.status(400).json({ message: "page is required" });
      const safePage = page.slice(0, 50).replace(/[^\p{L}\p{N}\s/\-_()]/gu, "");
      const safeDevice = device === "mobile" ? "mobile" : "pc";
      await storage.createPageView(req.session.userId!, safePage, safeDevice);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/logs/page-view (MASTER 전용 — 목록 조회)
  app.get("/api/logs/page-view", requireMaster, async (req, res) => {
    try {
      const { userId, pageFilter, device, page, pageSize } = req.query;
      const result = await storage.getPageViews({
        userId: userId ? Number(userId) : undefined,
        page: pageFilter as string,
        device: device as string,
        page_num: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ── CSV 다운로드 (MASTER 전용) ─────────────────────────────────────────

  function formatDateKr(d: Date | string | null): string {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  }

  function detectDevice(ua?: string | null): string {
    if (!ua) return "알 수 없음";
    if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "모바일";
    return "PC";
  }

  function csvSafe(val: string): string {
    let s = String(val ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  }

  function csvRow(cells: string[]): string {
    return cells.map(c => csvSafe(c)).join(",");
  }

  // GET /api/logs/login/csv
  app.get("/api/logs/login/csv", requireMaster, async (_req, res) => {
    try {
      const rows = await storage.getAllLoginLogsForCsv();
      const BOM = "\uFEFF";
      const header = csvRow(["ID", "사용자ID", "아이디", "이름", "IP주소", "기기", "로그인시각"]);
      const lines = rows.map(r => csvRow([
        String(r.id), String(r.userId), r.username, r.displayName,
        r.ipAddress || "", detectDevice(r.userAgent),
        formatDateKr(r.loginAt),
      ]));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=login_logs_${new Date().toISOString().slice(0,10)}.csv`);
      res.send(BOM + [header, ...lines].join("\r\n"));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/logs/audit/csv
  app.get("/api/logs/audit/csv", requireMaster, async (_req, res) => {
    try {
      const rows = await storage.getAllAuditLogsForCsv();
      const BOM = "\uFEFF";
      const header = csvRow(["ID", "사용자", "액션", "대상유형", "대상ID", "상세", "발생시각"]);
      const lines = rows.map(r => csvRow([
        String(r.id), r.username || "시스템", r.actionType,
        r.targetType || "", r.targetId ? String(r.targetId) : "", r.detailJson || "",
        formatDateKr(r.createdAt),
      ]));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=audit_logs_${new Date().toISOString().slice(0,10)}.csv`);
      res.send(BOM + [header, ...lines].join("\r\n"));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/logs/page-view/csv
  app.get("/api/logs/page-view/csv", requireMaster, async (_req, res) => {
    try {
      const rows = await storage.getAllPageViewsForCsv();
      const BOM = "\uFEFF";
      const header = csvRow(["ID", "사용자ID", "아이디", "이름", "페이지", "기기", "조회시각"]);
      const lines = rows.map(r => csvRow([
        String(r.id), String(r.userId), r.username, r.displayName,
        r.page, r.device === "mobile" ? "모바일" : "PC",
        formatDateKr(r.createdAt),
      ]));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=page_views_${new Date().toISOString().slice(0,10)}.csv`);
      res.send(BOM + [header, ...lines].join("\r\n"));
    } catch (e) {
      console.error(e);
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

  // ─── 유가 분석 API ───────────────────────────────────────────────────────────

  // POST /api/oil-prices/refresh — MASTER 전용 수동 수집
  app.post("/api/oil-prices/refresh", requireMaster, async (req, res) => {
    try {
      const { runOilPriceJob } = await import("./services/oilScheduler");
      const { today, yesterday } = req.body as { today?: string; yesterday?: string };
      const result = await runOilPriceJob(today, yesterday);
      if (!result.success) {
        return res.status(502).json({ message: result.error || "수집 실패" });
      }
      // 수집 성공 시 구독자 전원 푸시 (유저별 배지 카운트 증가)
      try {
        const subs = await storage.getAllPushSubscriptions();
        if (subs.length > 0) {
          // 유저별로 배지 카운트 증가 후 발송
          const userIds = [...new Set(subs.map(s => s.userId))];
          const badgeByUser = new Map<number, number>();
          await Promise.all(userIds.map(async uid => {
            const count = await storage.incrementBadgeCount(uid);
            badgeByUser.set(uid, count);
          }));

          let sent = 0, failed = 0;
          await Promise.all(subs.map(async sub => {
            const badgeCount = badgeByUser.get(sub.userId) ?? 1;
            const payload = {
              title: "유가 모니터링",
              body: "오늘의 유가 데이터가 업데이트되었습니다.",
              icon: "/icon-192.png",
              url: "/oil-prices",
              badgeCount,
            };
            const ok = await sendPush(sub, payload);
            if (ok) sent++; else failed++;
          }));
          console.log(`푸시 발송 완료: 성공 ${sent}건, 실패 ${failed}건`);
        }
      } catch (pushErr) {
        console.error("푸시 발송 오류 (수집은 성공):", pushErr);
      }
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "서버 오류";
      res.status(500).json({ message: msg });
    }
  });

  // GET /api/oil-prices/latest-date — 최근 분석 날짜 조회
  app.get("/api/oil-prices/latest-date", requireAuth, async (req, res) => {
    try {
      const date = await storage.getOilPriceLatestDate();
      res.json({ date });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/oil-prices/analysis — 분석 결과 조회
  app.get("/api/oil-prices/analysis", requireAuth, async (req, res) => {
    try {
      const { analysisDate, analysisType, subType, fuelType, sido } = req.query as Record<string, string>;
      const results = await storage.getOilPriceAnalysis({
        analysisDate: analysisDate || undefined,
        analysisType: analysisType || undefined,
        subType: subType || undefined,
        fuelType: fuelType || undefined,
        sido: sido || undefined,
      });
      res.json(results);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/oil-prices/available-dates — 데이터 있는 날짜 목록
  app.get("/api/oil-prices/available-dates", requireAuth, async (req, res) => {
    try {
      const dates = await storage.getOilAvailableDates();
      res.json(dates);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/oil-prices/subregions?date=YYYYMMDD — HQ_USER 관할 내 시/군/구 목록
  app.get("/api/oil-prices/subregions", requireAuth, async (req, res) => {
    try {
      const { date } = req.query as Record<string, string>;
      if (!date) return res.status(400).json({ message: "date 파라미터가 필요합니다." });
      if (req.session.role === "MASTER") {
        return res.json([]); // MASTER는 sido 드롭다운 유지
      }
      const permitted = await storage.getUserPermittedRegions(req.session.userId!);
      const subregions = await storage.getOilSubregions(date, permitted);
      res.json(subregions);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/users/my-permitted-regions — 내 관할 지역 목록
  app.get("/api/users/my-permitted-regions", requireAuth, async (req, res) => {
    try {
      if (req.session.role === "MASTER") {
        res.json(null); // null = 전국 전체
      } else {
        const { sidoList, regionList } = await storage.getUserPermittedRegions(req.session.userId!);
        // 프론트엔드 드롭다운용: sido 단위는 "서울 전체" 식으로, region 단위는 그대로 결합
        res.json([...sidoList, ...regionList]);
      }
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/oil-prices/top-stations — 실시간 유가 분석
  app.get("/api/oil-prices/top-stations", requireAuth, async (req, res) => {
    try {
      const { type, fuel, date, region, sido } = req.query as Record<string, string>;
      if (!type || !fuel || !date) {
        return res.status(400).json({ message: "type, fuel, date 파라미터가 필요합니다." });
      }
      const validTypes = ['HIGH', 'LOW', 'RISE', 'FALL', 'WIDE', 'CEILING'];
      const validFuels = ['gasoline', 'diesel', 'kerosene'];
      if (!validTypes.includes(type) || !validFuels.includes(fuel)) {
        return res.status(400).json({ message: "잘못된 파라미터입니다." });
      }

      // 이전 날짜 계산 (RISE/FALL용)
      let prevDate: string | undefined;
      if (type === 'RISE' || type === 'FALL') {
        const dates = await storage.getOilAvailableDates();
        const idx = dates.indexOf(date);
        prevDate = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1] : undefined;
      }

      // 지역 필터 결정
      let regions: { sidoList: string[]; regionList: string[] } | null;
      if (req.session.role === "MASTER") {
        // 마스터: sido 파라미터 또는 region 파라미터가 있으면 해당 지역만, 없으면 전국
        regions = null;
      } else {
        // HQ_USER: 관할 지역 자동 주입, region 쿼리가 있으면 그 값만
        const permitted = await storage.getUserPermittedRegions(req.session.userId!);
        // 본부·팀 미지정(전국) HQ_USER는 MASTER와 동일하게 전국 처리
        if (permitted.sidoList.length === 0 && permitted.regionList.length === 0) {
          regions = null;
        } else if (region) {
          if (permitted.sidoList.includes(region)) {
            // sido 전체 선택 (e.g. "충북")
            regions = { sidoList: [region], regionList: [] };
          } else if (permitted.regionList.includes(region)) {
            // 허용된 시/군 직접 선택
            regions = { sidoList: [], regionList: [region] };
          } else {
            // sido 하위 시/군/구 선택 (e.g. "충북 청주시" → sido "충북" 권한 확인)
            const regionSido = region.split(' ')[0];
            if (permitted.sidoList.includes(regionSido)) {
              regions = { sidoList: [], regionList: [region] };
            } else {
              regions = permitted;
            }
          }
        } else {
          regions = permitted;
        }
      }

      const stations = await storage.getOilTopStations({
        type: type as any,
        fuelType: fuel as any,
        date,
        prevDate,
        regions,
        sido: sido || undefined,
      });
      res.json(stations);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ─── 대시보드 유가 분석 API ─────────────────────────────────────────────────

  // GET /api/dashboard/wti — WTI 국제 유가 (Yahoo Finance)
  app.get("/api/dashboard/wti", requireAuth, async (_req, res) => {
    try {
      const { getWtiData, getWtiHistory } = await import("./services/externalData");
      const [current, history] = await Promise.all([getWtiData(), getWtiHistory()]);
      res.json({ current, history });
    } catch (e) {
      res.status(500).json({ message: "WTI 조회 실패" });
    }
  });

  // GET /api/dashboard/exchange-rate — KRW/USD 환율
  app.get("/api/dashboard/exchange-rate", requireAuth, async (_req, res) => {
    try {
      const { getExchangeRate } = await import("./services/externalData");
      const data = await getExchangeRate();
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: "환율 조회 실패" });
    }
  });

  // GET /api/dashboard/ceiling-prices — 석유 최고가격제 (최신 2개)
  app.get("/api/dashboard/ceiling-prices", requireAuth, async (_req, res) => {
    try {
      const rows = await storage.getCeilingPrices();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "석유 최고가격제 조회 실패" });
    }
  });

  // POST /api/admin/ceiling-prices — 석유 최고가격제 등록 (MASTER 전용)
  app.post("/api/admin/ceiling-prices", requireMaster, async (req, res) => {
    try {
      const { gasoline, diesel, kerosene, effectiveDate, note } = req.body;
      if (!effectiveDate) return res.status(400).json({ message: "적용일 필수" });
      const row = await storage.setCeilingPrices({
        gasoline: gasoline ? String(gasoline) : null,
        diesel: diesel ? String(diesel) : null,
        kerosene: kerosene ? String(kerosene) : null,
        effectiveDate,
        note: note || null,
        createdBy: req.session.userId!,
      });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: "석유 최고가격제 저장 실패" });
    }
  });

  // GET /api/dashboard/fuel-stats — 국내 유류 평균 + 전국 편차
  app.get("/api/dashboard/fuel-stats", requireAuth, async (req, res) => {
    try {
      const { getCachedFuelAverages } = await import("./services/opinetApi");
      const cached = getCachedFuelAverages();

      const isCacheFresh = cached !== null;

      const dates = await storage.getOilAvailableDates();

      let averages;
      let averagesDate: string | null = null;

      if (isCacheFresh && cached) {
        averages = {
          gasoline: cached.gasoline,
          diesel: cached.diesel,
          kerosene: cached.kerosene,
          gasolineChange: cached.gasolineChange,
          dieselChange: cached.dieselChange,
          keroseneChange: cached.keroseneChange,
        };
        averagesDate = cached.tradeDate;
      } else if (dates.length > 0) {
        const prevDate = dates[1] ?? dates[0];
        averages = await storage.getOilNationalAverages(dates[0], prevDate);
        averagesDate = dates[0];
      } else {
        return res.json({ averages: null, spread: null });
      }

      let spread = null;
      if (dates.length > 0) {
        let sidoFilter: string[] | undefined;
        let regionFilter: string[] | undefined;
        if (req.session.role !== "MASTER") {
          const permitted = await storage.getUserPermittedRegions(req.session.userId!);
          if (permitted.sidoList.length > 0) sidoFilter = permitted.sidoList;
          if (permitted.regionList.length > 0) regionFilter = permitted.regionList;
        }
        spread = await storage.getOilPriceSpread(dates[0], sidoFilter, regionFilter);
      }

      res.json({ date: averagesDate, averages, spread });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/dashboard/regional-averages — 시/도별 평균 유가
  app.get("/api/dashboard/regional-averages", requireAuth, async (req, res) => {
    try {
      const dates = await storage.getOilAvailableDates();
      if (dates.length === 0) return res.json([]);
      let sidoFilter: string[] | undefined;
      let regionFilter: string[] | undefined;
      if (req.session.role !== "MASTER") {
        const permitted = await storage.getUserPermittedRegions(req.session.userId!);
        if (permitted.sidoList.length > 0) sidoFilter = permitted.sidoList;
        if (permitted.regionList.length > 0) regionFilter = permitted.regionList;
      }
      const data = await storage.getOilRegionalAverages(dates[0], sidoFilter, regionFilter);
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/dashboard/regional-price-history — 본부 지역 시계열 (지역별 추이 탭용)
  app.get("/api/dashboard/regional-price-history", requireAuth, async (req, res) => {
    try {
      let sidoFilter: string[] | undefined;
      let regionFilter: string[] | undefined;
      if (req.session.role !== "MASTER") {
        const permitted = await storage.getUserPermittedRegions(req.session.userId!);
        if (permitted.sidoList.length > 0) sidoFilter = permitted.sidoList;
        if (permitted.regionList.length > 0) regionFilter = permitted.regionList;
      }
      const data = await storage.getOilRegionalHistory(sidoFilter, regionFilter);
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // GET /api/dashboard/domestic-history — 국내 유가 시계열
  app.get("/api/dashboard/domestic-history", requireAuth, async (_req, res) => {
    try {
      const data = await storage.getOilDomesticHistory();
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ─── 유가 CSV 업로드 API ─────────────────────────────────────────────────────

  // ─── CSV 청크 업로드 (프록시 크기 제한 우회) ────────────────────────────────
  // 업로드 세션을 메모리에 임시 보관 (sessionId → { fileName, chunks[], totalChunks })
  const csvUploadSessions = new Map<string, {
    fileName: string;
    chunks: Map<number, string>; // chunkIndex → base64
    totalChunks: number;
    createdAt: number;
  }>();

  // 30분 이상 된 세션 자동 정리
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, s] of csvUploadSessions) {
      if (s.createdAt < cutoff) csvUploadSessions.delete(id);
    }
  }, 5 * 60 * 1000);

  // POST /api/oil-prices/upload-csv/init — 세션 시작
  app.post("/api/oil-prices/upload-csv/init", requireMaster, async (req, res) => {
    const { fileName, totalChunks } = req.body as { fileName: string; totalChunks: number };
    if (!fileName || !totalChunks || totalChunks < 1) {
      return res.status(400).json({ message: "fileName과 totalChunks가 필요합니다." });
    }
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    csvUploadSessions.set(sessionId, { fileName, chunks: new Map(), totalChunks, createdAt: Date.now() });
    res.json({ sessionId });
  });

  // POST /api/oil-prices/upload-csv/chunk — 청크 전송
  app.post("/api/oil-prices/upload-csv/chunk", requireMaster, async (req, res) => {
    const { sessionId, chunkIndex, data } = req.body as { sessionId: string; chunkIndex: number; data: string };
    const session = csvUploadSessions.get(sessionId);
    if (!session) return res.status(404).json({ message: "업로드 세션이 존재하지 않습니다." });
    session.chunks.set(chunkIndex, data);
    res.json({ ok: true, received: session.chunks.size, total: session.totalChunks });
  });

  // POST /api/oil-prices/upload-csv/finalize — 청크 합산 후 처리
  app.post("/api/oil-prices/upload-csv/finalize", requireMaster, async (req, res) => {
    try {
      const { parseOilPriceCSV, toInsertOilPriceRaw } = await import("./services/oilParser");
      const { runAnalysis } = await import("./services/oilAnalyzer");

      const { sessionId } = req.body as { sessionId: string };
      const session = csvUploadSessions.get(sessionId);
      if (!session) return res.status(404).json({ message: "업로드 세션이 존재하지 않습니다." });

      if (session.chunks.size !== session.totalChunks) {
        return res.status(400).json({ message: `청크 누락: ${session.chunks.size}/${session.totalChunks}` });
      }

      // 청크를 순서대로 합산해서 Buffer 생성
      const parts: Buffer[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        parts.push(Buffer.from(session.chunks.get(i)!, "base64"));
      }
      const buf = Buffer.concat(parts);
      csvUploadSessions.delete(sessionId);

      const rows = parseOilPriceCSV(buf);
      if (rows.length === 0) {
        return res.status(400).json({ message: "파싱된 데이터가 없습니다. CSV 파일 형식을 확인해주세요." });
      }

      const insertRows = toInsertOilPriceRaw(rows);
      await storage.saveOilPriceRaw(insertRows);

      const processedDates = new Set<string>();
      let totalAnalysis = 0;
      const uniqueDates = [...new Set(rows.map((r) => r.date))].sort();
      for (let i = 0; i < uniqueDates.length; i++) {
        const today = uniqueDates[i];
        const yesterday = i > 0 ? uniqueDates[i - 1] : String(Number(today) - 1).padStart(8, "0");
        const analysisResults = runAnalysis(rows, today, yesterday);
        if (analysisResults.length > 0) {
          await storage.saveOilPriceAnalysis(analysisResults);
          totalAnalysis += analysisResults.length;
          processedDates.add(today);
        }
      }

      res.json({
        success: true,
        fileName: session.fileName,
        totalRows: insertRows.length,
        analysisCount: totalAnalysis,
        dates: [...processedDates].sort(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "서버 오류";
      console.error("CSV finalize 오류:", e);
      res.status(500).json({ message: msg });
    }
  });

  // POST /api/oil-prices/upload-csv — (레거시, 사용 안 함, 호환성 유지)
  app.post("/api/oil-prices/upload-csv", requireMaster, async (req, res) => {
    try {
      const msg = "이 엔드포인트는 더 이상 사용되지 않습니다. 청크 업로드를 사용하세요.";
      res.status(400).json({ message: msg });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "서버 오류";
      console.error("CSV 업로드 오류:", e);
      res.status(500).json({ message: msg });
    }
  });

  // ─── 푸시 알림 API ──────────────────────────────────────────────────────────

  // GET /api/push/vapid-public-key — VAPID 공개키 반환
  app.get("/api/push/vapid-public-key", requireAuth, (_req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
  });

  // POST /api/push/subscribe — 구독 저장
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { endpoint, p256dh, auth } = req.body as { endpoint: string; p256dh: string; auth: string };
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ message: "endpoint, p256dh, auth 필드가 필요합니다." });
      }
      await storage.savePushSubscription(userId, { endpoint, p256dh, auth });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // DELETE /api/push/subscribe — 구독 삭제
  app.delete("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body as { endpoint: string };
      if (!endpoint) return res.status(400).json({ message: "endpoint 필드가 필요합니다." });
      await storage.deletePushSubscription(endpoint);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/push/badge-reset — 배지 카운트 초기화 (앱 열릴 때 호출)
  app.post("/api/push/badge-reset", requireAuth, async (req, res) => {
    try {
      await storage.resetBadgeCount(req.session.userId!);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // POST /api/push/send-test — MASTER 전용 테스트 푸시
  app.post("/api/push/send-test", requireMaster, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const subs = await storage.getPushSubscriptionsByUserId(userId);
      if (subs.length === 0) {
        return res.status(404).json({ message: "구독 정보가 없습니다. 먼저 알림을 구독해주세요." });
      }
      const badgeCount = await storage.incrementBadgeCount(userId);
      const payload = {
        title: "유가 모니터링 테스트",
        body: "푸시 알림이 정상적으로 동작하고 있습니다.",
        icon: "/icon-192.png",
        url: "/oil-prices",
        badgeCount,
      };
      const { sent, failed } = await sendPushToAll(subs, payload);
      res.json({ ok: true, sent, failed });
    } catch (e) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  return httpServer;
}
