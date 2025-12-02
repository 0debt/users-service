import Redis from "ioredis";

const isTestEnv =
  Bun.env.TEST === "true" ||
  process.env.CI === "true" ||
  Bun.env.NODE_ENV === "test";

let redis: Redis | null = null;

// En tests, CI o entornos sin Redis → desactivado
if (!isTestEnv) {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 1) return null;
        return 50;
      },
      lazyConnect: true,
    });

    redis.connect().catch(() => {
      console.warn("⚠️ Redis no disponible, desactivando cliente.");
      redis = null;
    });

    redis.on("error", () => {
      console.warn("⚠️ Redis error, desactivando cliente.");
      redis = null;
    });

  } catch (e) {
    console.warn("⚠️ Redis no se pudo inicializar:", e);
    redis = null;
  }
} else {
  console.log("⚠️ Redis desactivado en modo test/CI");
}

export { redis };
