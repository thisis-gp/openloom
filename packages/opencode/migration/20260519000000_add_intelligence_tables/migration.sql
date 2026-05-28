-- =============================================================================
-- Migration: 20260519000000_add_intelligence_tables
-- Adds all tables for the intelligence, memory, graph, and cron subsystems.
-- Also alters `session` and `message` to add new nullable columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. router_outcomes — Thompson sampling priors per (model_id, provider_id)
-- -----------------------------------------------------------------------------
CREATE TABLE `router_outcomes` (
  `model_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `alpha` real DEFAULT 1.0 NOT NULL,
  `beta` real DEFAULT 1.0 NOT NULL,
  `total_calls` integer DEFAULT 0 NOT NULL,
  `last_cost_usd` real,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  PRIMARY KEY (`model_id`, `provider_id`)
);
--> statement-breakpoint
CREATE INDEX `router_outcomes_provider_idx` ON `router_outcomes` (`provider_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 2. curator_runs — Audit log of curator executions
-- -----------------------------------------------------------------------------
CREATE TABLE `curator_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `trigger` text NOT NULL,
  `messages_classified` integer DEFAULT 0 NOT NULL,
  `messages_archived` integer DEFAULT 0 NOT NULL,
  `messages_pruned` integer DEFAULT 0 NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `curator_runs_session_idx` ON `curator_runs` (`session_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 3. memory_archive — Curator-classified compressed messages
-- -----------------------------------------------------------------------------
CREATE TABLE `memory_archive` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `message_id` text NOT NULL,
  `tier` text NOT NULL,
  `importance` text NOT NULL,
  `content` text NOT NULL,
  `embedding_id` text,
  `curator_run_id` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `memory_archive_session_idx` ON `memory_archive` (`session_id`);
--> statement-breakpoint
CREATE INDEX `memory_archive_tier_idx` ON `memory_archive` (`tier`);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_archive_message_id_idx` ON `memory_archive` (`message_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 4. vector_embeddings — Embedding vectors for archived messages
-- -----------------------------------------------------------------------------
CREATE TABLE `vector_embeddings` (
  `id` text PRIMARY KEY NOT NULL,
  `archive_id` text NOT NULL,
  `session_id` text NOT NULL,
  `model` text NOT NULL,
  `vector` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`archive_id`) REFERENCES `memory_archive`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `vector_embeddings_session_idx` ON `vector_embeddings` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `vector_embeddings_archive_id_idx` ON `vector_embeddings` (`archive_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 5. graph_nodes — Knowledge graph entities
-- -----------------------------------------------------------------------------
CREATE TABLE `graph_nodes` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `type` text NOT NULL,
  `label` text NOT NULL,
  `pagerank_score` real DEFAULT 0.0 NOT NULL,
  `community_id` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `graph_nodes_session_idx` ON `graph_nodes` (`session_id`);
--> statement-breakpoint
CREATE INDEX `graph_nodes_type_idx` ON `graph_nodes` (`type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `graph_nodes_session_type_label_idx` ON `graph_nodes` (`session_id`, `type`, `label`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 6. graph_edges — Knowledge graph relationships
-- -----------------------------------------------------------------------------
CREATE TABLE `graph_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `from_node_id` text NOT NULL,
  `to_node_id` text NOT NULL,
  `relation` text NOT NULL,
  `weight` real DEFAULT 1.0 NOT NULL,
  `session_id` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`from_node_id`) REFERENCES `graph_nodes`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`to_node_id`) REFERENCES `graph_nodes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `graph_edges_from_node_idx` ON `graph_edges` (`from_node_id`);
--> statement-breakpoint
CREATE INDEX `graph_edges_to_node_idx` ON `graph_edges` (`to_node_id`);
--> statement-breakpoint
CREATE INDEX `graph_edges_session_idx` ON `graph_edges` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `graph_edges_from_to_relation_idx` ON `graph_edges` (`from_node_id`, `to_node_id`, `relation`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 7. cron_jobs — Scheduled agentic task definitions
-- -----------------------------------------------------------------------------
CREATE TABLE `cron_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `name` text NOT NULL,
  `schedule` text NOT NULL,
  `goal` text NOT NULL,
  `agent` text DEFAULT 'build' NOT NULL,
  `toolset_blocklist` text,
  `auto_approve` integer DEFAULT 0 NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `last_run` integer,
  `next_run` integer,
  `last_session_id` text,
  `running_session_id` text,
  `last_error` text,
  `run_count` integer DEFAULT 0 NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `cron_jobs_project_idx` ON `cron_jobs` (`project_id`);
--> statement-breakpoint
CREATE INDEX `cron_jobs_next_run_idx` ON `cron_jobs` (`next_run`);
--> statement-breakpoint
CREATE INDEX `cron_jobs_enabled_next_run_idx` ON `cron_jobs` (`enabled`, `next_run`);
--> statement-breakpoint

-- =============================================================================
-- ALTER existing tables
-- =============================================================================

ALTER TABLE `session` ADD COLUMN `cron_job_id` text;
--> statement-breakpoint

ALTER TABLE `message` ADD COLUMN `compressed` integer DEFAULT 0;
--> statement-breakpoint

ALTER TABLE `message` ADD COLUMN `memory_tier` text;
--> statement-breakpoint

ALTER TABLE `message` ADD COLUMN `curator_run_id` text;
