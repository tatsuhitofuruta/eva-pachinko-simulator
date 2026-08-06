CREATE TABLE leaderboard_runs (
    id TEXT PRIMARY KEY,
    ip_hash TEXT NOT NULL,
    machine_key TEXT NOT NULL CHECK (
        machine_key IN (
            'eva15',
            'eva17',
            'garo',
            'garo12',
            'ghoul',
            'oumi5',
            'hokuto4',
            'rezero2',
            'shigotonin6'
        )
    ),
    spins INTEGER NOT NULL CHECK (spins IN (500, 1000, 2000, 3000)),
    rotation_1k INTEGER NOT NULL CHECK (rotation_1k BETWEEN 16 AND 20),
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
);

CREATE INDEX leaderboard_runs_ip_started
    ON leaderboard_runs (ip_hash, started_at DESC);

CREATE INDEX leaderboard_runs_expiry
    ON leaderboard_runs (expires_at);

CREATE TABLE leaderboard_entries (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 24),
    machine_key TEXT NOT NULL,
    balls INTEGER NOT NULL CHECK (balls BETWEEN 0 AND 1000000),
    spins INTEGER NOT NULL,
    rotation_1k INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (run_id) REFERENCES leaderboard_runs (id)
);

CREATE INDEX leaderboard_entries_machine_score
    ON leaderboard_entries (machine_key, balls DESC, created_at ASC);

CREATE INDEX leaderboard_entries_ip_created
    ON leaderboard_entries (ip_hash, created_at DESC);
