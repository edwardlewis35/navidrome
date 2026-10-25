//go:build windows

package onlinecover

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

func syncDirectory(file *os.File) error {
	err := file.Sync()
	// Windows rejects FlushFileBuffers on directory handles on common filesystems.
	// Only tolerate known directory-handle limitations; payload sync errors remain fatal.
	if errors.Is(err, windows.ERROR_INVALID_HANDLE) || errors.Is(err, windows.ERROR_ACCESS_DENIED) || errors.Is(err, windows.ERROR_NOT_SUPPORTED) {
		info, statErr := file.Stat()
		if statErr == nil && info.IsDir() {
			return nil
		}
	}
	return err
}
