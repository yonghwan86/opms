import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initDb } from "./initDb";
import { seedDatabase } from "./seed";
import { seedHistoricalData } from "./seedHistorical";
import { startOilScheduler } from "./services/oilScheduler";

process.on("unhandledRejection", (reason) => {
  console.error("[UnhandledRejection] 미처리 프로미스 거부 (서버 유지):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UncaughtException] 미처리 예외 (서버 유지):", err);
});

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "100mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// 즉시 요청 수신 로거 (응답 완료 전 기록)
app.use((req, _res, next) => {
  if (req.path.startsWith("/api") && req.method !== "GET") {
    console.log(`[INCOMING] ${req.method} ${req.path} content-type=${req.headers["content-type"] ?? "none"} content-length=${req.headers["content-length"] ?? "none"}`);
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // DB 테이블 초기화 및 시드 데이터 생성
  await initDb();
  await seedDatabase();
  await seedHistoricalData();

  await registerRoutes(httpServer, app);

  // 유가 수집 스케줄러 시작
  startOilScheduler();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
