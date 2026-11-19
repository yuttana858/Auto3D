# Auto3D 0.97.0 candidate: recorded object lifetimes

Recorded macros support object duplication, duplication at a position and removal. Copies are created immediately and appear at the end of their step. Recorded deletion adds a visibility key at the step end, retaining objects in the session so earlier frames remain available. Ordinary macro deletion removes objects from the session. See [agent-interface.md](agent-interface.md) for agent workflow and inspection semantics.

The app’s configured lighting is preserved. Other model creation, material animation and overlapping steps remain future work. Not deployed.
