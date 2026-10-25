package onlinecover

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/navidrome/navidrome/conf"
)

var entityID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

func RelativePath(kind, id string) (string, error) {
	if (kind != "song" && kind != "album") || !entityID.MatchString(id) {
		return "", ErrInvalidSelection
	}
	return filepath.Join("artwork", "online", kind, id+".jpg"), nil
}

func Path(kind, id string) string {
	rel, err := RelativePath(kind, id)
	if err != nil {
		return ""
	}
	return filepath.Join(conf.Server.DataFolder.String(), rel)
}

func noSymlinks(root *os.Root, name string) error {
	parts := strings.Split(filepath.Clean(name), string(filepath.Separator))
	current := ""
	for _, part := range parts {
		current = filepath.Join(current, part)
		info, err := root.Lstat(current)
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrInvalidSelection
		}
	}
	return nil
}

func Save(kind, id string, data []byte) error {
	rel, err := RelativePath(kind, id)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(conf.Server.DataFolder.String())
	if err != nil {
		return err
	}
	defer root.Close()
	if err := noSymlinks(root, rel); err != nil {
		return err
	}
	dir := filepath.Dir(rel)
	if err := root.MkdirAll(dir, 0700); err != nil {
		return err
	}
	if err := noSymlinks(root, rel); err != nil {
		return err
	}
	tmp := filepath.Join(dir, "."+id+"-"+uuid.NewString()+".tmp")
	f, err := root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = root.Remove(tmp) }()
	_, writeErr := f.Write(data)
	if writeErr == nil {
		writeErr = f.Sync()
	}
	closeErr := f.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		return err
	}
	if err := noSymlinks(root, rel); err != nil {
		return err
	}
	if err := root.Rename(tmp, rel); err != nil {
		return err
	}
	directory, err := root.Open(dir)
	if err != nil {
		return err
	}
	syncErr := syncDirectory(directory)
	closeErr = directory.Close()
	return errors.Join(syncErr, closeErr)
}
