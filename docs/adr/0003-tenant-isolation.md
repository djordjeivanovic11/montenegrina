# ADR 0003: Tenant isolation

Status: accepted.

Require organization context in application repositories, place organization
IDs on tenant data, and use composite constraints for same-tenant relationships.
RLS is deferred until operational evidence justifies its pooled-connection and
migration cost. Cross-tenant integration tests are release-blocking.

