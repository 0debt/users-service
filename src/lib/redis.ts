import Redis from "ioredis";

const isTest = Bun.env.TEST === "true";

// Si estamos en test, Redis se desactiva
if (isTest) {
  console.log("⚠️ Redis desactivado en modo TEST");
}

let redis: Redis | null = null;

if (!isTest) {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 2000);
    },
  });

  redis.on("error", (err) => {
    console.warn("⚠️ Redis error (ignorado en dev/test):", err.message);
  });
}

export { redis };
