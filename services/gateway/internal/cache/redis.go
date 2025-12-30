package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps the raw Redis client
type RedisClient struct {
	rdb *redis.Client
}

type Config struct {
	Addr         string
	Password     string
	DB           int
	PoolSize     int
	MinIdleConns int
}

func NewRedisClient(cfg Config) (*RedisClient, error) {
	// defaults if not set
	if cfg.PoolSize == 0 {
		cfg.PoolSize = 100 // Production default
	}
	if cfg.MinIdleConns == 0 {
		cfg.MinIdleConns = 10 // Always keep 10 ready
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,

		// Maximum number of socket connections.
		// Rule of thumb: Start with 100. If you see "pool timeout" errors, increase it.
		PoolSize: cfg.PoolSize,

		// Minimum number of idle connections which is useful when
		// dealing with bursty traffic.
		MinIdleConns: cfg.MinIdleConns,

		// Amount of time to wait for a connection if all are busy.
		// Default is ReadTimeout + 1. If your Redis is slow, don't let
		// the app hang forever waiting for a slot.
		PoolTimeout: 4 * time.Second,

		// Close connections that have been idle for this long.
		// Prevents stale connections from accumulating.
		ConnMaxIdleTime: 5 * time.Minute,
	})

	// Ping to verify connection immediately
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &RedisClient{rdb: rdb}, nil
}

// Set stores ANY struct by marshaling it to JSON
// T can be IdempotencyResponse, []Design, or anything else.
func Set[T any](c *RedisClient, ctx context.Context, key string, value T, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, key, data, ttl).Err()
}

// Get retrieves data and unmarshals it into the provided pointer
func Get[T any](c *RedisClient, ctx context.Context, key string) (*T, bool, error) {
	val, err := c.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}

	var result T
	if err := json.Unmarshal(val, &result); err != nil {
		return nil, false, err
	}

	return &result, true, nil
}

func SetNX(c *RedisClient, ctx context.Context, key string, value any, ttl time.Duration) (bool, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return false, err
	}

	return c.rdb.SetNX(ctx, key, data, ttl).Result()
}

func Del(c *RedisClient, ctx context.Context, key string) error {
	return c.rdb.Del(ctx, key).Err()
}

func (c *RedisClient) Close() error {
	return c.rdb.Close()
}
