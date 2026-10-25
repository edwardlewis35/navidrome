package cmd

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

type dailyAIFunc func(context.Context, time.Time) error

func (f dailyAIFunc) GenerateDaily(ctx context.Context, now time.Time) error { return f(ctx, now) }

func TestDailyAIWorkerStartsWithoutAWebRequestAndSurvivesFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	var calls atomic.Int32
	updated := make(chan struct{})
	worker := startDailyAIWorker(ctx, dailyAIFunc(func(ctx context.Context, now time.Time) error {
		if now.IsZero() {
			t.Error("worker did not provide generation time")
		}
		if calls.Add(1) == 1 {
			return errors.New("temporary fixture failure")
		}
		if calls.Load() == 2 {
			close(updated)
			cancel()
		}
		return nil
	}), time.Millisecond)
	select {
	case <-updated:
	case <-time.After(2 * time.Second):
		t.Fatal("background worker did not recover on the next check")
	}
	select {
	case <-worker:
	case <-time.After(2 * time.Second):
		t.Fatal("background worker did not stop")
	}
}

func TestDailyAIWorkerCancelsAnInFlightAnalysis(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	started := make(chan struct{})
	worker := startDailyAIWorker(ctx, dailyAIFunc(func(ctx context.Context, _ time.Time) error {
		close(started)
		<-ctx.Done()
		return ctx.Err()
	}), time.Hour)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("background analysis was not started")
	}
	cancel()
	select {
	case <-worker:
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown did not cancel the in-flight analysis")
	}
}
