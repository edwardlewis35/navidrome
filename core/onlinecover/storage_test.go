package onlinecover

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/navidrome/navidrome/conf"
)

func storageFixture(t *testing.T) string {
	t.Helper()
	t.Cleanup(conf.SnapshotConfig())
	directory := t.TempDir()
	conf.Server.DataFolder = conf.NewDir(directory)
	return directory
}

func TestSaveKeepsCoversPrivateAndNeverChangesAudio(t *testing.T) {
	data := storageFixture(t)
	original := filepath.Join(t.TempDir(), "original.mp3")
	music := []byte("original audio must not be modified")
	if err := os.WriteFile(original, music, 0600); err != nil {
		t.Fatal(err)
	}
	cover := []byte("fixture-only already-reencoded cover bytes")
	if err := Save("song", "track-one", cover); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(data, "artwork", "online", "song", "track-one.jpg")
	got, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(got, cover) {
		t.Fatalf("cover not saved: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatalf("cover not private: %v", info.Mode())
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	// Even a mistaken pre-existing hard link is replaced by name, never opened for writing.
	if err := os.Link(original, path); err != nil {
		t.Skipf("hard links unavailable: %v", err)
	}
	if err := Save("song", "track-one", []byte("replacement cover")); err != nil {
		t.Fatal(err)
	}
	got, err = os.ReadFile(original)
	if err != nil || !bytes.Equal(got, music) {
		t.Fatal("cover save changed original audio")
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".tmp") {
			t.Fatal("temporary cover not cleaned")
		}
	}
}

func TestSaveRejectsTraversalAndUnsupportedKinds(t *testing.T) {
	directory := storageFixture(t)
	for _, input := range []struct{ kind, id string }{{"playlist", "one"}, {"song", "../original.mp3"}, {"album", "/absolute"}, {"song", "a/b"}, {"song", ""}, {"song", strings.Repeat("a", 129)}} {
		if err := Save(input.kind, input.id, []byte("x")); !errors.Is(err, ErrInvalidSelection) {
			t.Errorf("unsafe storage accepted: %+v %v", input, err)
		}
	}
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) != 0 {
		t.Fatal("invalid selection created files")
	}
}

func TestSaveRefusesSymlinkDirectoriesAndDestinations(t *testing.T) {
	for _, component := range []string{"artwork", "artwork/online", "artwork/online/song", "artwork/online/song/track.jpg"} {
		t.Run(component, func(t *testing.T) {
			directory := storageFixture(t)
			outside := t.TempDir()
			secret := filepath.Join(outside, "secret.mp3")
			if err := os.WriteFile(secret, []byte("untouched audio"), 0600); err != nil {
				t.Fatal(err)
			}
			link := filepath.Join(directory, filepath.FromSlash(component))
			if err := os.MkdirAll(filepath.Dir(link), 0700); err != nil {
				t.Fatal(err)
			}
			target := outside
			if strings.HasSuffix(component, ".jpg") {
				target = secret
			}
			if err := os.Symlink(target, link); err != nil {
				t.Skipf("symlinks unavailable: %v", err)
			}
			if err := Save("song", "track", []byte("cover")); !errors.Is(err, ErrInvalidSelection) {
				t.Fatalf("symlink accepted: %v", err)
			}
			bytes, err := os.ReadFile(secret)
			if err != nil || string(bytes) != "untouched audio" {
				t.Fatal("save followed symlink into music")
			}
			entries, err := os.ReadDir(outside)
			if err != nil || len(entries) != 1 {
				t.Fatal("save wrote outside private artwork directory")
			}
		})
	}
}
