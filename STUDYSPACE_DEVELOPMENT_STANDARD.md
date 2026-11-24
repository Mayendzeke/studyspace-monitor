# Study Space Development Standard

## Mandatory design and experience rule

Every development change, bug fix, refactor, integration, and upgrade must preserve a consistent Study Space look, feel, and interaction model. This is a release requirement, not an optional polish step.

The Student app, Monitor, and Study Space website should feel like parts of the same product family. They may retain their platform-specific visual treatments (the Student experience uses its established glass design; Monitor uses its established dimensional/neumorphic treatment), but typography, brand assets, icon language, interaction patterns, spacing discipline, accessibility, and quality must remain coherent.

## Required checks for every change

1. **Use the existing design system.** Reuse established design tokens, components, typography, icon sizes, radii, shadows, and interaction states. Do not introduce arbitrary colors, fonts, or one-off visual treatments where an existing token or component applies.
2. **Preserve product identity.** Keep the Study Space logo, wordmark, purple/mint brand language, and platform-specific visual identity consistent. The Study Space brand control must navigate to the workspace home page.
3. **Check every supported viewport.** Review desktop, tablet, and mobile layouts. Prevent clipped content, horizontal overflow, hidden controls, and unusable scroll regions.
4. **Check both themes.** Verify readable contrast, field surfaces, icons, borders, disabled states, errors, and overlays in light and dark themes wherever the app supports them.
5. **Keep interactions consistent.** Buttons, menus, tabs, dialogs, loading states, empty states, and error recovery must follow existing Study Space patterns and be keyboard accessible.
6. **Respect accessibility and motion preferences.** Provide accessible names and focus states, sensible touch targets, semantic controls, and reduced-motion support.
7. **Do not trade function for appearance.** Visual improvements must not break offline behavior, student privacy, guardian safeguards, account access, data integrity, or existing learning workflows.
8. **Verify before handoff.** Run the repository tests and production build. Inspect the affected experience at relevant viewport sizes and record any checks that could not be performed.
9. **No silent deployment drift.** When an Edge Function, schema contract, or other backend component is changed, verify that its source, tests, and deployment instructions agree. Do not claim production is updated unless deployment has actually been performed and verified.

## Pull-request requirement

Every pull request must state the affected apps, confirm adherence to this standard, report desktop/mobile and light/dark checks, list automated tests and builds, and identify any remaining limitations. A change that is functionally correct but visually inconsistent is not ready for release.
