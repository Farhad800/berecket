-- Salaries are shown only to people with the "see money" rule (owner, 31 Oct 2026).
-- The built-in Accountant and Manager roles get "Safe: view" (cash:view) so they keep seeing payroll.
-- Data only: two permission rows added if missing; nothing else changes.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'cash:view' FROM "Role" r WHERE r."name" IN ('Accountant', 'Manager')
ON CONFLICT DO NOTHING;
