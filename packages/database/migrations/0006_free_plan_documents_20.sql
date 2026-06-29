UPDATE plan_entitlements pe
SET limit_value = 20
FROM plans p
WHERE pe.plan_id = p.id
  AND p.slug = 'free'
  AND pe.metric = 'DOCUMENTS'
  AND pe.limit_value < 20;
