-- Add example users for development
INSERT INTO "public"."User" ("email", "name", "createdAt", "updatedAt") 
VALUES 
  ('alice@example.com', 'Alice Smith', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bob@example.com', 'Bob Johnson', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;