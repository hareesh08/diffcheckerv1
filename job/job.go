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
	Mode                 string `json:"mode"`
	OriginalSheet        string `json:"originalSheet"`
	ChangedSheet         string `json:"changedSheet"`
	HeaderRow            int    `json:"headerRow"`
	RowKeyColumn         string `json:"rowKeyColumn"`
	IgnoreWhitespace     bool   `json:"ignoreWhitespace"`
	IgnoreCase           bool   `json:"ignoreCase"`
	HideUnchangedRows    bool   `json:"hideUnchangedRows"`
	HideUnchangedColumns bool   `json:"hideUnchangedColumns"`
	PreserveFormatting   bool   `json:"preserveFormatting"`
}

type Job struct {
	mu            sync.RWMutex
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

// Update applies fn to the job under its own lock, so field writes from the
// run goroutine can never race with status reads from the HTTP handlers.
func (j *Job) Update(fn func(*Job)) {
	j.mu.Lock()
	defer j.mu.Unlock()
	fn(j)
}

// Snapshot returns a detached copy of the job for lock-free JSON encoding.
func (j *Job) Snapshot() *Job {
	j.mu.RLock()
	defer j.mu.RUnlock()
	c := Job{
		ID:            j.ID,
		Status:        j.Status,
		Mode:          j.Mode,
		OriginalName:  j.OriginalName,
		ChangedName:   j.ChangedName,
		OriginalPath:  j.OriginalPath,
		ChangedPath:   j.ChangedPath,
		Options:       j.Options,
		Progress:      j.Progress,
		ProgressLabel: j.ProgressLabel,
		Error:         j.Error,
		CreatedAt:     j.CreatedAt,
		CompletedAt:   j.CompletedAt,
		Summary:       j.Summary,
		StorePath:     j.StorePath,
	}
	return &c
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
	j, ok := r.jobs[id]
	r.mu.Unlock()
	if !ok {
		return
	}
	if j.Status == StatusQueued || j.Status == StatusParsing || j.Status == StatusComparing {
		j.Update(func(jj *Job) {
			jj.Status = StatusCancelled
			jj.CompletedAt = time.Now()
		})
		if j.cancel != nil {
			j.cancel()
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
