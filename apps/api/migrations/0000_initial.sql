CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`purged_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);

CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
CREATE TABLE `source` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`source_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`title` text,
	`channel` text,
	`length_ms` integer,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `source_normalized_url_content_hash_unique` ON `source` (`normalized_url`,`content_hash`);
CREATE TABLE `source_span` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`start_ms` integer,
	`end_ms` integer,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`text_hash` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `source_span_source_id_ordinal_unique` ON `source_span` (`source_id`,`ordinal`);
CREATE TABLE `artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`source_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model_id` text NOT NULL,
	`content_r2_key` text NOT NULL,
	`entry_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `generation_job`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `artifact_user_id_idx` ON `artifact` (`user_id`);
CREATE INDEX `artifact_job_id_idx` ON `artifact` (`job_id`);
CREATE TABLE `artifact_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`output_type` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model_id` text NOT NULL,
	`canonical_job_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_job_id`) REFERENCES `generation_job`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `artifact_cache_source_id_content_hash_output_type_prompt_version_model_id_unique` ON `artifact_cache` (`source_id`,`content_hash`,`output_type`,`prompt_version`,`model_id`);
CREATE TABLE `citation` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`span_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`span_id`) REFERENCES `source_span`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `citation_owner_idx` ON `citation` (`owner_type`,`owner_id`);
CREATE TABLE `generation_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text,
	`requested_url` text NOT NULL,
	`output_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text,
	`error_code` text,
	`error_message` text,
	`workflow_instance_id` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `generation_job_workflow_instance_id_unique` ON `generation_job` (`workflow_instance_id`);
CREATE INDEX `generation_job_user_id_idx` ON `generation_job` (`user_id`);
CREATE INDEX `generation_job_created_at_idx` ON `generation_job` (`created_at`);
CREATE TABLE `generation_metric` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`model_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`stage_durations_ms` text NOT NULL,
	`failure_stage` text,
	`claims_generated` integer NOT NULL,
	`claims_rejected` integer NOT NULL,
	`claims_rewritten` integer DEFAULT 0 NOT NULL,
	`concepts_unsupported` integer DEFAULT 0 NOT NULL,
	`concepts_rewritten` integer DEFAULT 0 NOT NULL,
	`steps_unsupported` integer DEFAULT 0 NOT NULL,
	`steps_rewritten` integer DEFAULT 0 NOT NULL,
	`citations_invalid` integer DEFAULT 0 NOT NULL,
	`verifier_calls` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `generation_job`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `generation_metric_job_id_unique` ON `generation_metric` (`job_id`);
CREATE TABLE `provider_key` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`last4` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `qa_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`source_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model_id` text NOT NULL,
	`removed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `generation_job`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `qa_item_user_id_idx` ON `qa_item` (`user_id`);
CREATE INDEX `qa_item_job_id_idx` ON `qa_item` (`job_id`);
CREATE TABLE `reminder_setting` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`last_sent_on` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `review_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`qa_item_id` text NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`last_rated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`qa_item_id`) REFERENCES `qa_item`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `review_schedule_user_id_qa_item_id_unique` ON `review_schedule` (`user_id`,`qa_item_id`);
CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `collection_user_id_idx` ON `collection` (`user_id`);
CREATE TABLE `collection_item` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifact`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `collection_item_artifact_id_idx` ON `collection_item` (`artifact_id`);
CREATE UNIQUE INDEX `collection_item_collection_id_artifact_id_unique` ON `collection_item` (`collection_id`,`artifact_id`);
CREATE TABLE `demo_budget` (
	`period` text PRIMARY KEY NOT NULL,
	`transcript_credits_left` integer NOT NULL,
	`verifier_micro_usd_left` integer NOT NULL
);

CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`last_event_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `subscription_user_id_unique` ON `subscription` (`user_id`);
CREATE TABLE `usage_record` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`slot` integer NOT NULL,
	`job_id` text NOT NULL,
	`returned_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `generation_job`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `usage_record_job_id_unique` ON `usage_record` (`job_id`);
CREATE INDEX `usage_record_user_period_idx` ON `usage_record` (`user_id`,`period`);
CREATE UNIQUE INDEX `usage_record_open_slot_idx` ON `usage_record` (`user_id`,`period`,`slot`) WHERE "usage_record"."returned_at" is null;
CREATE TABLE `webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`payload_r2_key` text NOT NULL,
	`processed_at` integer,
	`created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `webhook_event_provider_event_id_unique` ON `webhook_event` (`provider_event_id`);