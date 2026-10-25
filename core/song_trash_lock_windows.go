//go:build windows

package core

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

func trashLockFile(file *os.File) error {
	return windows.LockFileEx(windows.Handle(file.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, &windows.Overlapped{})
}

func trashUnlockFile(file *os.File) error {
	return windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, &windows.Overlapped{})
}

func trashSyncDirectory(file *os.File) error {
	err := file.Sync()
	// Windows commonly rejects FlushFileBuffers on directory handles. Payload
	// and journal files are still flushed normally. Tolerate only these known
	// directory-handle limitations, never arbitrary file or I/O errors.
	if errors.Is(err, windows.ERROR_INVALID_HANDLE) || errors.Is(err, windows.ERROR_ACCESS_DENIED) || errors.Is(err, windows.ERROR_NOT_SUPPORTED) {
		info, statErr := file.Stat()
		if statErr == nil && info.IsDir() {
			return nil
		}
	}
	return err
}
