# Zerant Browser vs WebMCP

WebMCP is one of the most interesting developments in the agentic web story. It
deserves attention.

It also does **not** make Zerant Browser redundant, because the two projects solve
different layers of the problem.

## Short version

- **WebMCP** helps websites become more agent-readable.
- **Zerant Browser** helps humans and agents work together in the real browser.

Those can complement each other, but they are not the same category.

## What WebMCP is trying to do

WebMCP gives websites a way to expose structured tools to browser agents.
Instead of forcing agents to click, scrape, and guess through a UI, a site can
register explicit actions with descriptions, schemas, and JavaScript handlers.

That is valuable because it can make agent interactions:

- more reliable
- more direct
- less dependent on DOM actuation
- easier for the website developer to control

If the web adopts WebMCP widely, the agentic web gets better.

## What Zerant Browser is trying to do

Zerant Browser starts from a different place.

The core problem is not just "how does an agent call a site tool?" It is:

- how does a human stay in the loop?
- how do human and agent share the same browser state?
- how do they work across multiple sites, tabs, and sessions?
- how do you keep that safe when the agent is operating in a real browser?

Zerant Browser answers that by making the **browser itself** the shared workspace.

## Comparison

| | WebMCP | Zerant Browser |
|---|---|---|
| Main scope | Individual websites expose structured agent actions | The browser becomes a shared human-AI workspace |
| Integration point | Site/page level | Browser-wide |
| Adoption model | Requires site support | Works on the existing web today |
| Strength | Site-defined, structured actions | Shared context, real sessions, security, handoffs, governance |
| Best fit | Sites that want to become more agent-ready | Users and teams doing real browser work with human oversight |

## Where WebMCP is strong

WebMCP is strongest when:

- a site wants explicit control over what agents can do
- the workflow is mostly inside that site
- the site can define cleaner actions than raw UI navigation

That is a good and legitimate direction.

## Where Zerant Browser is strong

Zerant Browser is strongest when:

- the work spans multiple websites
- the user is already browsing in a real authenticated session
- the agent needs shared context, not just a callable site tool
- human judgment, consent, or intervention matters
- security and governance are product requirements, not afterthoughts

Examples:

- research across many tabs
- authenticated SaaS workflows
- handoff-heavy tasks with CAPTCHAs or approvals
- live browser assistance where the human and agent can both see progress

## Why Zerant Browser does not depend on WebMCP adoption

This is the practical difference that matters most today.

WebMCP becomes useful where websites adopt it.
Zerant Browser is useful on the web as it already exists.

That makes Zerant Browser a browser-layer product, not a bet on future protocol
coverage.

## The strategic framing

If you only describe Zerant Browser as:

- an MCP server
- a browser automation tool
- a big HTTP API

then you undersell what it actually is.

The better framing is:

> WebMCP helps websites become agent-readable.
>
> Zerant Browser helps humans and agents work together in the real browser, across the web.

That is the difference in one sentence.

## Final take

WebMCP is good for the ecosystem.
It validates the idea that browser-based agent work needs better primitives.

Zerant Browser sits at a different layer:

- local-first
- browser-wide
- human-in-the-loop
- security-conscious
- built around shared context instead of detached execution

That is the category Zerant Browser should own.
