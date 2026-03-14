-- Seed Tic-Tac-Toe game type (no configurable options)
INSERT INTO "Game" ("slug", "name", "optionsSchema", "createdAt", "updatedAt")
VALUES ('tic-tac-toe', 'Tic-Tac-Toe', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
