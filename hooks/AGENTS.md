# Guidance for hook files

- Type the options object accepted by a hook as `<HookWithoutUse>Options` (for example, `useSomething(options: SomethingOptions)`).
- Hooks directly under `hooks/` should be generic and reusable across multiple contexts. Put a hook intended for a specific context in the matching subfolder.
- Give each custom hook one JSDoc block immediately above its declaration. Briefly describe its purpose, document every parameter with `@param`, specify the result as `@returns {type} description`, and include a useful `@example` showing how to use it.
- Make `@returns` clear without reading the implementation: describe the exact value or shape returned, what array entries represent, and what object fields contain. Document meaningful alternatives such as `null`, `undefined`, unchanged input, or thrown errors. For primitive results, state what the value represents.
- Prefer a single JSDoc block on the hook over separate `@typedef` documentation. Keep TypeScript types in the signature and define named types when they are useful to the code.
- Leave a blank line after the final import and between function, type, and interface declarations.
F