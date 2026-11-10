-- Initial schema for NexTerm
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS host_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) > 0 AND length(name) <= 64),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0 AND length(name) <= 128),
    hostname TEXT NOT NULL CHECK(length(trim(hostname)) > 0 AND length(hostname) <= 255),
    port INTEGER NOT NULL DEFAULT 22 CHECK(port >= 1 AND port <= 65535),
    username TEXT NOT NULL CHECK(length(trim(username)) > 0 AND length(username) <= 128),
    auth_method TEXT NOT NULL CHECK(auth_method IN ('password', 'private_key')),
    credential_reference TEXT,
    private_key_path TEXT,
    group_id TEXT REFERENCES host_groups(id) ON DELETE SET NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hosts_group_id ON hosts(group_id);
CREATE INDEX IF NOT EXISTS idx_hosts_name ON hosts(name);

CREATE TABLE IF NOT EXISTS known_hosts (
    id TEXT PRIMARY KEY NOT NULL,
    host_identity TEXT NOT NULL UNIQUE,
    key_algorithm TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    trusted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_known_hosts_identity ON known_hosts(host_identity);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

