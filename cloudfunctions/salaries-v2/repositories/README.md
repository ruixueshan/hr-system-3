# Salaries V2 Repositories

Repository extraction is intentionally staged. The current action split keeps the legacy data-access code inside `services/legacy-service.js` so behavior stays unchanged. Move collection-specific reads and writes here when each salary action is refactored further.
