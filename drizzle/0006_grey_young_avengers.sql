CREATE TABLE "guild_feature_flags" (
	"guild_id" text NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_feature_flags_guild_id_feature_pk" PRIMARY KEY("guild_id","feature")
);
