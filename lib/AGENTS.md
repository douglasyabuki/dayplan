# Guidance for `lib` files

- Leave a blank line after the final import and between function, type, and interface declarations.
- Give each function one JSDoc block immediately above its declaration. Describe its purpose, document each parameter with `@param`, specify the result as `@returns {type} description` (for example, `@returns {boolean} True when the task matches the filter; otherwise false.`), and include a useful `@example`. Use the function's declared TypeScript return type when possible; use an explicit object, tuple, or union shape when the inferred return type adds useful details.
- Make `@returns` useful without reading the implementation: state the exact value or shape returned, what array entries represent, and what object fields contain. Document meaningful alternatives such as `null`, `undefined`, unchanged input, or thrown errors. For primitive results, state the condition that makes the result `true` or what the number/string represents.
- Prefer a single JSDoc block on the function over separate `@typedef` documentation. Keep TypeScript types in the function signature and define named types when they are useful to the code.
- When a broad task asks to document or reformat files under `lib`, skip `utils.ts` unless the task explicitly includes it.
