package cmd

import (
	"context"
	"time"

	"github.com/navidrome/navidrome/log"
)

type dailyAIService interface {
	GenerateDaily(context.Context, time.Time) error
}

// The service's persisted daily claim limits model calls. Minute checks allow
// new settings and newly created users to receive their first result promptly.
func startDailyAIWorker(ctx context.Context, service dailyAIService, interval time.Duration) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		log.Info(ctx, "Daily AI recommendations scheduled", "schedule", "03:00 Asia/Shanghai")
		for {
			if ctx.Err() != nil {
				return
			}
			if err := service.GenerateDaily(ctx, time.Now()); err != nil && ctx.Err() == nil {
				log.Warn(ctx, "Daily AI recommendation update did not finish", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	return done
}
