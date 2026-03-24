infra aws "Quantum Analytics Platform":
  user client label="Researcher"
  gateway edge label="API Gateway"
  service api label="Orchestrator"
  queue jobs label="Job Queue"
  database results label="Results DB"
  storage reports label="Report Bucket"
  client -> edge
  edge -> api
  api -> jobs label="dispatch"
  api -> results label="write"
  results -> reports label="export"
