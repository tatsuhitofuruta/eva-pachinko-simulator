# Contributing

Thanks for helping maintain the simulator.

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install ruff
```

## Validation

Run the same checks used by CI before opening a pull request:

```bash
ruff check .
python -m compileall eva_simulator.py tests scripts
python -m unittest discover -s tests -v
python scripts/validate_static_site.py
```

For UI changes, also open `index.html` in a browser and confirm the main simulation flow still works.

## Machine Spec Changes

When adding or changing a machine spec, include the source used for probabilities, payout distributions, and mode names. Keep probability tables auditable by making each distribution sum to `1.0` where applicable.
