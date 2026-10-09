CREATE TABLE "added_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "added_tracks" ADD CONSTRAINT "added_tracks_discord_user_id_users_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "added_tracks" ADD CONSTRAINT "added_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "added_tracks_user_track_idx" ON "added_tracks" USING btree ("guild_id","discord_user_id","track_id");--> statement-breakpoint
CREATE INDEX "added_tracks_user_added_idx" ON "added_tracks" USING btree ("guild_id","discord_user_id","added_at");