import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`Conectando a Redis en ${redisUrl}...`);

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on("connect", () => console.log("Conectado a Redis"));
redis.on("error", (err) => console.error("error Redis:", err));
