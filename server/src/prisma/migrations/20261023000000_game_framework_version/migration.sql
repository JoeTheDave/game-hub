-- Game module framework (spec 1792780973323): optimistic-concurrency version counter.
ALTER TABLE "GameInstance" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- gameState now has the shape { phase, state }. Pre-framework instances were throwaway test
-- games, so close them out rather than converting them.
UPDATE "GameInstance" SET "gameState" = '{"phase":"finished"}'::jsonb;
