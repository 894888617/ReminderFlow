package customer

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Customer struct {
	ID         int64     `json:"id"`
	CalendarID int64     `json:"calendar_id"`
	Name       string    `json:"name"`
	Phone      string    `json:"phone"`
	Remark     string    `json:"remark"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Repository struct{ db *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) List(ctx context.Context, calendarID int64, keyword string) ([]Customer, error) {
	q := `SELECT id,calendar_id,name,COALESCE(phone,''),COALESCE(remark,''),updated_at FROM customers WHERE calendar_id=$1 AND deleted_at IS NULL`
	args := []any{calendarID}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		q += ` AND (name ILIKE $2 OR phone ILIKE $2 OR remark ILIKE $2)`
		args = append(args, "%"+keyword+"%")
	}
	q += ` ORDER BY updated_at DESC,id DESC`
	rows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Customer
	for rows.Next() {
		var c Customer
		if err := rows.Scan(&c.ID, &c.CalendarID, &c.Name, &c.Phone, &c.Remark, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func (r *Repository) Get(ctx context.Context, id int64) (*Customer, error) {
	var c Customer
	err := r.db.QueryRow(ctx, `SELECT id,calendar_id,name,COALESCE(phone,''),COALESCE(remark,''),updated_at FROM customers WHERE id=$1 AND deleted_at IS NULL`, id).Scan(&c.ID, &c.CalendarID, &c.Name, &c.Phone, &c.Remark, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}
func (r *Repository) Create(ctx context.Context, c Customer, uid int64) (*Customer, error) {
	var out Customer
	err := r.db.QueryRow(ctx, `INSERT INTO customers(calendar_id,name,phone,remark,created_by) VALUES($1,$2,NULLIF($3,''),$4,$5) RETURNING id,calendar_id,name,COALESCE(phone,''),COALESCE(remark,''),updated_at`, c.CalendarID, strings.TrimSpace(c.Name), strings.TrimSpace(c.Phone), strings.TrimSpace(c.Remark), uid).Scan(&out.ID, &out.CalendarID, &out.Name, &out.Phone, &out.Remark, &out.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &out, nil
}
func (r *Repository) Update(ctx context.Context, id int64, c Customer) (*Customer, error) {
	var out Customer
	err := r.db.QueryRow(ctx, `UPDATE customers SET name=$1,phone=NULLIF($2,''),remark=$3,updated_at=NOW() WHERE id=$4 AND deleted_at IS NULL RETURNING id,calendar_id,name,COALESCE(phone,''),COALESCE(remark,''),updated_at`, strings.TrimSpace(c.Name), strings.TrimSpace(c.Phone), strings.TrimSpace(c.Remark), id).Scan(&out.ID, &out.CalendarID, &out.Name, &out.Phone, &out.Remark, &out.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &out, nil
}
func (r *Repository) SoftDelete(ctx context.Context, id int64) error {
	_, err := r.db.Exec(ctx, `UPDATE customers SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id)
	return err
}
func (r *Repository) FindByPhone(ctx context.Context, calendarID int64, phone string, excludeID int64) (*Customer, error) {
	var c Customer
	err := r.db.QueryRow(ctx, `SELECT id,calendar_id,name,COALESCE(phone,''),COALESCE(remark,''),updated_at FROM customers WHERE calendar_id=$1 AND phone=$2 AND deleted_at IS NULL AND ($3=0 OR id<>$3) LIMIT 1`, calendarID, strings.TrimSpace(phone), excludeID).Scan(&c.ID, &c.CalendarID, &c.Name, &c.Phone, &c.Remark, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}
