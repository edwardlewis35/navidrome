//go:build !windows

package onlinecover

import "os"

func syncDirectory(file *os.File) error { return file.Sync() }
