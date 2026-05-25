-- =============================================================================
-- Migration: 20260524000000_advanced_features
-- Adds SONA (Self-Optimizing Neural Adapter) tables for trajectory tracking
-- and the reasoning bank.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. sona_trajectories — per-session tool call sequences with outcomes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sona_trajectories` (
  `id` text NOT NULL PRIMARY KEY,
  `session_id` text NOT NULL,
  `tool_sequence` text NOT NULL,
  `model_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `success` integer NOT NULL DEFAULT 0,
  `cost_usd` real,
  `duration_ms` integer,
  `task_type` text,
  `time_created` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `time_updated` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sona_trajectories_session_idx` ON `sona_trajectories` (`session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sona_trajectories_model_idx` ON `sona_trajectories` (`model_id`, `provider_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 2. sona_reasoning_bank — distilled successful patterns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sona_reasoning_bank` (
  `id` text NOT NULL PRIMARY KEY,
  `pattern_hash` text NOT NULL UNIQUE,
  `tool_sequence` text NOT NULL,
  `best_model_id` text NOT NULL,
  `best_provider_id` text NOT NULL,
  `success_count` integer NOT NULL DEFAULT 1,
  `avg_cost_usd` real,
  `task_type` text,
  `time_created` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `time_updated` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sona_bank_hash_idx` ON `sona_reasoning_bank` (`pattern_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sona_bank_task_idx` ON `sona_reasoning_bank` (`task_type`);
