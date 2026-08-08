package job

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusQueued     Status = "queued"
	StatusParsing    Status = "parsing"
	StatusComparing  Status = "comparing"
	StatusCompleted  Status = "completed"
	StatusFailed     Status = "failed"
	StatusCancelled  Status = "cancelled"
)

type Options struct {
	Mode             string // "rows"
	OriginalSheet    string
	ChangedSheet     string
	HeaderRow        int
	RowKeyColumn     string
	IgnoreWhitespace bool
	IgnoreCase       bool
	HideUnchangedRows    bool
	HideUnchangedColumns bool
	PreserveFormatting   bool
}

type Job struct {
	ID            string    `json:"id"`
	Status        Status    `json:"status"`
	Mode          string    `json:"mode"`
	OriginalName  string    `json:"originalName"`
	ChangedName   string    `json:"changedName"`
	OriginalPath  string    `json:"-"`
	ChangedPath   string    `json:"-"`
	Options       Options   `json:"-"`
	Progress      float64   `json:"progress"`
	ProgressLabel string    `json:"progressLabel"`
	Error         string    `json:"error,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	CompletedAt   time.Time `json:"completedAt,omitempty"`
	Summary       Summary   `json:"summary"`
	StorePath     string    `json:"-"`
	cancel        context.CancelFunc
}

type Summary struct {
	MatchedRows   int `json:"matchedRows"`
	ModifiedRows  int `json:"modifiedRows"`
	AddedRows     int `json:"addedRows"`
	DeletedRows   int `json:"deletedRows"`
	ModifiedCells int `json:"modifiedCells"`
}

// Registry holds jobs in memory, keyed by ID.
type Registry struct {
	mu   sync.RWMutex
	jobs map[string]*Job
}

func NewRegistry() *Registry {
	return &Registry{jobs: make(map[string]*Job)}
}

func (r *Registry) New(opts Options, origName, changedName, origPath, changedPath, storePath string) *Job {
	j := &Job{
		ID:           uuid.NewString(),
		Status:       StatusQueued,
		Mode:         opts.Mode,
		OriginalName: origName,
		ChangedName:  changedName,
		OriginalPath: origPath,
		ChangedPath:  changedPath,
		Options:      opts,
		CreatedAt:    time.Now(),
		StorePath:    storePath,
	}
	r.mu.Lock()
	r.jobs[j.ID] = j
	r.mu.Unlock()
	return j
}

func (r *Registry) Get(id string) (*Job, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	j, ok := r.jobs[id]
	return j, ok
}

func (r *Registry) Update(id string, fn func(*Job)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if j, ok := r.jobs[id]; ok {
		fn(j)
	}
}

func (r *Registry) Cancel(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if j, ok := r.jobs[id]; ok {
		if j.Status == StatusQueued || j.Status == StatusParsing || j.Status == StatusComparing {
			j.Status = StatusCancelled
			j.CompletedAt = time.Now()
			if j.cancel != nil {
				j.cancel()
			}
		}
	}
}

func (r *Registry) Delete(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.jobs, id)
}

// Cancellable returns a context that is cancelled when the job is cancelled.
func (r *Registry) Cancellable(jobID string) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	r.mu.Lock()
	if j, ok := r.jobs[jobID]; ok {
		j.cancel = cancel
	}
	r.mu.Unlock()
	return ctx, cancel
}

// completed ctx wiring
func (r *Registry) init() {}

var _ = context.Background
