package postgresql

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type DBPool interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}
