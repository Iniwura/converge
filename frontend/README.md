# Converge frontend

This is the reviewer-facing frontend for the Converge GenLayer Intelligent Contract.

It reads the live Studio Dev deployment at `0xc5594aA7c35d36279755F459d2aE083c2a226700` and exposes:

- `/` — editorial overview of the live synthesis mechanism
- `/app` — objective registry
- `/app/objectives/:id` — objective dossier and lifecycle actions
- `/app/objectives/:id/plans` — submitted-plan comparison
- `/app/objectives/:id/synthesis` — persisted canonical output and provenance
- `/app/demo` — read-only live walkthrough

## Local commands

~~~text
npm ci
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run start
~~~

The interface does not hardcode synthesis results. Reads use the authoritative latest non-final Studio Dev state; writes estimate fees, simulate, submit, wait for consensus, and reread the resulting contract state.
