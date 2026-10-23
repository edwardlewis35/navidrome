-- +goose Up
ALTER TABLE media_file ADD COLUMN trashed BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE media_file DROP COLUMN trashed;
