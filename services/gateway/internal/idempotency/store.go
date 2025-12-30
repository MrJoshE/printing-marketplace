package idempotency

import (
	"context"
	"gateway/internal/cache"
	"gateway/internal/errors"
	"time"
)

const (
	lockSuffix = ":lock"
	dataSuffix = ":data"
	lockTTL    = 10 * time.Second   // How long to block for a running request
	dataTTL    = 24 * 7 * time.Hour // How long to remember the success response
)

type Store struct {
	cache *cache.RedisClient
}

func NewStore(c *cache.RedisClient) *Store {
	return &Store{cache: c}
}

func (s *Store) SaveResponse(ctx context.Context, key string, resp IdempotencyResponse) error {
	dataKey := key + dataSuffix
	lockKey := key + lockSuffix

	// 1. Save the actual response data (Long TTL)
	if err := cache.Set(s.cache, ctx, dataKey, resp, dataTTL); err != nil {
		return errors.New(errors.ErrInternal, "Internal error. Please contact support.", err)
	}

	// 2. Delete the lock key immediately so waiting requests can now read the data
	// We ignore the error here because if the data is saved, the transaction is effectively done.
	_ = cache.Del(s.cache, ctx, lockKey)

	return nil
}

func (s *Store) GetResponse(ctx context.Context, key string) (*IdempotencyResponse, bool, error) {
	dataKey := key + dataSuffix

	// Use your generic cache.Get to retrieve the specific struct
	resp, found, err := cache.Get[IdempotencyResponse](s.cache, ctx, dataKey)
	if err != nil {
		return nil, false, err
	}

	return resp, found, nil
}

func (s *Store) Lock(ctx context.Context, key string) (bool, error) {
	// 1. Check if we already have a finished response
	_, found, err := s.GetResponse(ctx, key)
	if err != nil {
		return false, err
	}
	if found {
		// If data exists, we act as if the lock failed so the middleware
		// falls through to the "B. LOCK FAILED" block, finds the data, and returns it.
		return false, nil
	}

	// 2. If no data, try to acquire lock
	return cache.SetNX(s.cache, ctx, key+lockSuffix, "1", lockTTL)
}

func (s *Store) Delete(ctx context.Context, key string) error {
	_ = cache.Del(s.cache, ctx, key+lockSuffix)
	_ = cache.Del(s.cache, ctx, key+dataSuffix)
	return nil
}
