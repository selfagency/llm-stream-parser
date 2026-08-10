# @agentsy/renderers

Composable output renderers for stream-driven UIs.

## Purpose

`@agentsy/renderers` provides plain-text, CLI, and Ink renderer building blocks for streamed assistant output.

## Role in Agentsy

This package sits downstream of `@agentsy/processor` and `@agentsy/agent` to present model output in terminal and programmatic UI surfaces.

## Status

- Published `@agentsy` package.

## When to install it

Install this package when you need plain-text rendering today or when you are extending renderer surfaces in the monorepo.

Typical neighbors:

- `@agentsy/processor`
- `@agentsy/formatting`
- `@agentsy/ui`
- `@agentsy/vscode`

## API overview

- `createPlainTextRenderer`
- shared renderer utilities and types

Source contains additional CLI, Ink, and streaming Markdown implementations, but the documented stable entry point is the package root surface.

## Usage

```ts
import { normalizeOpenAIChatChunk } from "@agentsy/normalizers";
import { LLMStreamProcessor } from "@agentsy/processor";
import { createPlainTextRenderer } from "@agentsy/renderers";

const processor = new LLMStreamProcessor();
const renderer = createPlainTextRenderer({
  output: (text) => process.stdout.write(text),
});

processor.on("text", (text) => void renderer.write(text));

for await (const rawChunk of openAiStream) {
  processor.process(normalizeOpenAIChatChunk(rawChunk));
}

await renderer.end();
```

## Learn more

- [Package page](https://agentsy.self.agency/packages/renderers)

## Development

```bash
cd packages/renderers
pnpm build
pnpm check-types
pnpm test
```
