ALTER TABLE leaderboard_entries
    ADD COLUMN max_drought INTEGER NOT NULL DEFAULT 0
    CHECK (max_drought BETWEEN 0 AND 3000);

CREATE INDEX leaderboard_entries_machine_drought
    ON leaderboard_entries (machine_key, max_drought DESC, created_at ASC);
