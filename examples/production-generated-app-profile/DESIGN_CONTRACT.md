# Production Generated App Design Contract

This scaffold uses `impeccable` product-register rules. The generated app is an operator workflow surface, so design must serve repeated work rather than marketing expression.

## Scene

A release lead uses this board on a laptop during a normal workday to see risk, ownership, status, and release readiness without reading framework evidence first. Light mode is the correct default because the app is used in bright office/browser contexts and should feel like reliable business software.

## Visual Rules

- Use a restrained light product UI.
- Use tinted neutrals, not pure `#000` or `#fff`.
- Use one accent color for primary actions, active filters, focus, and selected rows.
- Use lucide icons for recognisable actions.
- Use shadcn-style local primitives for buttons, badges, fields, inputs, segmented controls, panels, and tabs.
- No browser-native unstyled `select` controls.
- Every data workflow needs loading, empty, success, error, disabled, hover, and focus states before production.
- Tables, lists, forms, and detail panels should be dense but calm.

## Generated-App UI Acceptance

The generated app is not acceptable if:

- the first screen looks like a wireframe;
- the user cannot tell what object is selected;
- a primary action is available in a lifecycle state where it cannot work;
- status, priority, and risk have inconsistent visual vocabularies;
- data entry uses raw browser controls;
- the page relies on explanatory story panels instead of the app itself making the task clear.
