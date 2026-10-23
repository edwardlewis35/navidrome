//go:build !windows

package core

import (
	"os"

	"golang.org/x/sys/unix"
)

func trashLockFile(file *os.File) error   { return unix.Flock(int(file.Fd()), unix.LOCK_EX) }
func trashUnlockFile(file *os.File) error { return unix.Flock(int(file.Fd()), unix.LOCK_UN) }

func trashSyncDirectory(file *os.File) error { return file.Sync() }
