/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runSnapshotJob, snapshotKindForCron, type SnapshotValuation } from "../lib/snapshot-scheduler";
import { loadPublicTechnicalData } from "../lib/public-technical-data";
import { runTechnicalAlertJob, TECHNICAL_ALERT_CRON } from "../lib/technical-alert-scheduler";
import { setRuntimeDatabase, setRuntimeMarketScanMode } from "../lib/runtime-env";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  MARKET_SCAN_MODE?: "live" | "snapshot";
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const runtimeEnv = (env ?? {}) as Env;
    setRuntimeDatabase(runtimeEnv.DB);
    setRuntimeMarketScanMode(runtimeEnv.MARKET_SCAN_MODE);
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      if (!runtimeEnv.ASSETS || !runtimeEnv.IMAGES) {
        return new Response("Image bindings are unavailable in local preview", { status: 503 });
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => runtimeEnv.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await runtimeEnv.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, runtimeEnv, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    setRuntimeDatabase(env.DB);
    if (controller.cron === TECHNICAL_ALERT_CRON) {
      ctx.waitUntil(runTechnicalAlertJob({
        database: env.DB,
        loadAnalysis: async (target) => (await loadPublicTechnicalData(target.ticker, target.market))?.technicalAnalysis ?? null,
      }));
      return;
    }
    const kind = snapshotKindForCron(controller.cron);
    ctx.waitUntil(runSnapshotJob(kind, {
      database: env.DB,
      invokeValuation: kind === "quarterly-financial"
        ? async (ticker, market) => {
          const request = new Request("https://snapshot.internal/api/valuation", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticker, market, refresh: true }),
          });
          const response = await handler.fetch(request, env, ctx);
          if (!response.ok) return null;
          const payload = await response.json() as { stock?: Record<string, unknown> };
          return payload.stock
            ? { ...payload.stock, ticker, market } as SnapshotValuation
            : null;
        }
        : undefined,
    }));
  },
};

export default worker;
