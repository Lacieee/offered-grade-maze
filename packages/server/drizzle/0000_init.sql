CREATE TABLE "game_transitions" (
	"game_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"from_room" text NOT NULL,
	"door" text NOT NULL,
	"to_room" text NOT NULL,
	"client_elapsed_ms" integer NOT NULL,
	"server_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_transitions_game_id_seq_pk" PRIMARY KEY("game_id","seq")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seed_code" text NOT NULL,
	"difficulty" text NOT NULL,
	"generator_version" integer NOT NULL,
	"level_hash" text NOT NULL,
	"status" text NOT NULL,
	"current_room" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"sent_rooms" text[] NOT NULL,
	"debug_used" boolean DEFAULT false NOT NULL,
	"integrity" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"seed_code" text NOT NULL,
	"difficulty" text NOT NULL,
	"generator_version" integer NOT NULL,
	"completion_ms" integer NOT NULL,
	"time_source" text NOT NULL,
	"transitions" integer NOT NULL,
	"debug_used" boolean NOT NULL,
	"integrity" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "results_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
ALTER TABLE "game_transitions" ADD CONSTRAINT "game_transitions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "results_seed_code_idx" ON "results" USING btree ("seed_code");--> statement-breakpoint
CREATE INDEX "results_difficulty_completion_idx" ON "results" USING btree ("difficulty","completion_ms");