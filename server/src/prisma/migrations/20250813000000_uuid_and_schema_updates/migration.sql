-- Drop game tables first (they reference User and Game)
DROP TABLE IF EXISTS "GameInstancePlayer";
DROP TABLE IF EXISTS "GameInstance";
DROP TABLE IF EXISTS "Game";

-- Recreate User with UUID id
CREATE TABLE "User_new" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "User_new_email_key" ON "User_new"("email");
CREATE UNIQUE INDEX "User_new_googleId_key" ON "User_new"("googleId");

INSERT INTO "User_new" ("id", "email", "name", "passwordHash", "googleId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "email", "name", "passwordHash", "googleId", "createdAt", "updatedAt"
FROM "User";

DROP TABLE "User";
ALTER TABLE "User_new" RENAME TO "User";

-- Create Game with UUID and options (not optionsSchema)
CREATE TABLE "Game" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- Create GameInstance with UUID, no status column, no requiredPlayerCount (status in gameState)
CREATE TABLE "GameInstance" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "hostUserId" UUID NOT NULL,
    "joinCode" TEXT NOT NULL,
    "gameState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "GameInstance_joinCode_key" ON "GameInstance"("joinCode");
CREATE INDEX "GameInstance_joinCode_idx" ON "GameInstance"("joinCode");

ALTER TABLE "GameInstance" ADD CONSTRAINT "GameInstance_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameInstance" ADD CONSTRAINT "GameInstance_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create GameInstancePlayer with UUID
CREATE TABLE "GameInstancePlayer" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "gameInstanceId" UUID NOT NULL,
    "userId" UUID,
    "screenName" TEXT NOT NULL,
    "playerOrder" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GameInstancePlayer_gameInstanceId_playerOrder_key" ON "GameInstancePlayer"("gameInstanceId", "playerOrder");
CREATE INDEX "GameInstancePlayer_gameInstanceId_idx" ON "GameInstancePlayer"("gameInstanceId");

ALTER TABLE "GameInstancePlayer" ADD CONSTRAINT "GameInstancePlayer_gameInstanceId_fkey" FOREIGN KEY ("gameInstanceId") REFERENCES "GameInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameInstancePlayer" ADD CONSTRAINT "GameInstancePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed Tic-Tac-Toe game type
INSERT INTO "Game" ("slug", "name", "options", "createdAt", "updatedAt")
VALUES ('tic-tac-toe', 'Tic-Tac-Toe', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
