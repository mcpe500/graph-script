erd "Quantum Experiment DB":
  table experiments:
    id: int pk
    name: string
    created_at: timestamp
  table runs:
    id: int pk
    experiment_id: int fk
    energy: float
  table measurements:
    id: int pk
    run_id: int fk
    basis: string
    count: int
  experiments.id -> runs.experiment_id one-to-many
  runs.id -> measurements.run_id one-to-many
