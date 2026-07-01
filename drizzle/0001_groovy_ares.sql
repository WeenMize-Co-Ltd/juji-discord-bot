CREATE TABLE "guild_dj_configs" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"voice_channel_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
