DROP INDEX "listen_events_guild_created_idx";--> statement-breakpoint
CREATE INDEX "listen_events_guild_created_user_idx" ON "listen_events" USING btree ("guild_id","created_at","discord_user_id","listened_sec");--> statement-breakpoint
CREATE INDEX "play_events_guild_source_started_idx" ON "play_events" USING btree ("guild_id","request_source","started_at");