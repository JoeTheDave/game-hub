-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "optionsSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameInstance" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "hostUserId" INTEGER NOT NULL,
    "joinCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "requiredPlayerCount" INTEGER NOT NULL,
    "gameState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameInstancePlayer" (
    "id" SERIAL NOT NULL,
    "gameInstanceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "screenName" TEXT NOT NULL,
    "playerOrder" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameInstancePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GameInstance_joinCode_key" ON "GameInstance"("joinCode");

-- CreateIndex
CREATE INDEX "GameInstance_joinCode_idx" ON "GameInstance"("joinCode");

-- CreateIndex
CREATE INDEX "GameInstance_status_idx" ON "GameInstance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GameInstancePlayer_gameInstanceId_playerOrder_key" ON "GameInstancePlayer"("gameInstanceId", "playerOrder");

-- CreateIndex
CREATE INDEX "GameInstancePlayer_gameInstanceId_idx" ON "GameInstancePlayer"("gameInstanceId");

-- AddForeignKey
ALTER TABLE "GameInstance" ADD CONSTRAINT "GameInstance_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInstance" ADD CONSTRAINT "GameInstance_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInstancePlayer" ADD CONSTRAINT "GameInstancePlayer_gameInstanceId_fkey" FOREIGN KEY ("gameInstanceId") REFERENCES "GameInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInstancePlayer" ADD CONSTRAINT "GameInstancePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
