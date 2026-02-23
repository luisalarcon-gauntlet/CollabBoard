# CollabBoard Testing Guide

Enterprise-grade test suite for the CollabBoard collaborative whiteboard application.

## Test Structure

```
├── lib/__tests__/           # Unit tests (utils, yjs-store, actions, etc.)
├── components/__tests__/    # Integration tests (Whiteboard, shapes, connectors, frames)
├── app/dashboard/__tests__/ # Dashboard component tests
├── e2e/                     # Playwright E2E tests
└── lib/__tests__/setup.ts   # Global test setup (polyfills, console checks)
```

## Running Tests

### Unit & Integration Tests (Vitest)

```bash
npm test                    # Run all Vitest tests
npm test -- --watch         # Watch mode
npm test -- components/     # Run only component tests
```

### E2E Tests (Playwright)

```bash
npm run test:e2e            # Run all E2E tests (starts dev server)
npm run test:e2e:ui         # Run with Playwright UI for debugging
npx playwright test e2e/landing.spec.ts  # Run specific file
```

**Board E2E tests** require an authenticated session and existing board. Set `E2E_BOARD_ID` to a valid board UUID:

```bash
E2E_BOARD_ID=<uuid> npx playwright test e2e/board.spec.ts
```

## Test Coverage

### Unit Tests
- **lib/utils** — `getElementsInFrame`, `cn`, `isValidUUID`
- **lib/yjs-store** — Yjs document management, layer types
- **lib/useYjsStore** — React hook, observer race conditions
- **lib/supabase-yjs-provider** — Load/save, loaded promise
- **lib/actions** — createBoard, deleteBoard server actions
- **lib/cursorThrottle** — Throttling behavior

### Integration Tests (Whiteboard)
- **Add shapes** — Sticky, rectangle, circle, text
- **Movement** — Selection, drag, multi-select, Delete key
- **Connectors** — Create between shapes, orphan cleanup
- **Frames** — Create, containment, cascading delete, batch move

### E2E Tests
- **Landing** — Branding, auth buttons, console errors
- **Auth flow** — Redirect behavior
- **Board** — Toolbar, add sticky, console errors (requires E2E_BOARD_ID)

## Console Error Detection

Unit tests fail on unexpected `console.error` calls. Allowed patterns:
- React `act()` warnings
- `Warning:` messages
- App error logging (`[createBoard]`, `[deleteBoard]`, etc.)

E2E tests capture browser console errors and fail on critical ones.

## CI/CD

Run both test suites in CI:

```yaml
- run: npm test
- run: npm run test:e2e
```

For board E2E tests, provision a test board and set `E2E_BOARD_ID` in CI secrets.
