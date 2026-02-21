import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Model routing ─────────────────────────────────────────────────────────────
// Sonnet for tasks that require generating structured content + layout together
// (SWOT, retro, journey maps). Haiku for everything else (5× faster, 10× cheaper).

const REASONING_PATTERNS =
  /\b(swot|retrospective|retro|sprint|user.?journey|journey.?map|kanban|roadmap|org.?chart|mind.?map|matrix|framework|analysis|diagram|workflow)\b/i;

function selectModel(lastUserMessage: string): {
  model: string;
  tier: "fast" | "reasoning";
} {
  if (REASONING_PATTERNS.test(lastUserMessage)) {
    return { model: "claude-sonnet-4-6", tier: "reasoning" };
  }
  return { model: "claude-haiku-4-5", tier: "fast" };
}

// ── Dynamic max_tokens ────────────────────────────────────────────────────────
// generate_pattern collapses large batches to ~30 output tokens.
// Reasoning tier (SWOT, retro) needs room for rich text content in labels.

function selectMaxTokens(tier: "fast" | "reasoning"): number {
  return tier === "reasoning" ? 4096 : 1024;
}

// ── System prompt (static — eligible for prompt caching) ─────────────────────

const SYSTEM_PROMPT = `\
You are the CollabBoard AI Agent. You help users create and organize content on a collaborative whiteboard.

STRICT RULES — follow every time:
1. You MUST respond with tool calls only. Zero plain-text, zero preamble.
2. ALWAYS use create_bulk_layers when creating 2–10 objects. For 10+ identical objects use generate_pattern instead.
3. Omit every property that equals its default: rotation:0, opacity:1, scale:1, fontSize:16, fontWeight:"normal".
4. All colors must be CSS hex strings ("#fbbf24"). Never numbers.
5. No conversational filler. One tool call, done.

TOOL SELECTION:
- 1 object         → create_layer
- 2–10 objects     → create_bulk_layers
- 10+ identical    → generate_pattern   ← ALWAYS use this for "create N rectangles/circles"
- recolor/move     → update_layers  (use IDs from board state)
- remove           → delete_layers
- align/space      → arrange_grid   (executor computes coords)
- wrap frame       → resize_frame_to_fit

BOARD STATE (compact key reference):
  id=layerID  t=type  x=X  y=Y  w=width  h=height  f=fill/bgColor  c=textColor  tx=text  ti=frameTitle  r=rotation
Use the 'id' field when calling update_layers / delete_layers / arrange_grid.

BLUEPRINTS — emit exactly these coordinates when asked:

SWOT Analysis (use create_bulk_layers — 9 objects total):
  Frame:  x:0,   y:0,   width:860, height:860, title:"SWOT Analysis"
  Rects:  x:20,  y:20,  width:400, height:400, fill:"#bbf7d0"
          x:440, y:20,  width:400, height:400, fill:"#fecaca"
          x:20,  y:440, width:400, height:400, fill:"#bfdbfe"
          x:440, y:440, width:400, height:400, fill:"#fef08a"
  Text labels — use EXACTLY these coordinates, fontWeight:"bold", fontSize:18:
    Strengths label:     x:30,  y:30,  width:380, height:380
    Weaknesses label:    x:450, y:30,  width:380, height:380
    Opportunities label: x:30,  y:450, width:380, height:380
    Threats label:       x:450, y:450, width:380, height:380
  IMPORTANT: The text field of each label MUST contain 3–5 real bullet points
  (use "• " prefix) relevant to the company described in the user's request.
  Example for Strengths: "Strengths\n• Point one\n• Point two\n• Point three"

Retrospective (3 Frames, create_bulk_layers):
  x:0,   width:400, height:600, title:"What Went Well",  backgroundColor:"#f0fdf4"
  x:440, width:400, height:600, title:"What Didn't",     backgroundColor:"#fef2f2"
  x:880, width:400, height:600, title:"Action Items",    backgroundColor:"#eff6ff"

User Journey (5 Frames, create_bulk_layers):
  width:280, height:400, x: 0 / 320 / 640 / 960 / 1280. Add a text label in each.

Grid spacing: 20px between all elements.`;

// ── Tool schema ───────────────────────────────────────────────────────────────

const LAYER_ITEM_PROPERTIES = {
  type: {
    type: "string",
    enum: ["sticky", "rectangle", "circle", "text", "frame"],
    description: "Layer type.",
  },
  x:      { type: "number", description: "X (top-left)." },
  y:      { type: "number", description: "Y (top-left)." },
  width:  { type: "number", description: "Width px." },
  height: { type: "number", description: "Height px." },
  text:   { type: "string", description: "Text content (sticky / text)." },
  fill:   { type: "string", description: "CSS hex color." },
  title:  { type: "string", description: "Frame title." },
  fontSize:   { type: "number", description: "Font size px — omit if 16." },
  fontWeight: { type: "string", description: "Font weight — omit if 'normal'." },
  color:  { type: "string", description: "Explicit text color (text layer only)." },
};

const tools: Anthropic.Tool[] = [
  {
    name: "create_layer",
    description: "Create exactly 1 layer. Use create_bulk_layers for 2–10, generate_pattern for 10+.",
    input_schema: {
      type: "object" as const,
      properties: LAYER_ITEM_PROPERTIES,
      required: ["type", "x", "y"],
    },
  },
  {
    name: "create_bulk_layers",
    description: "Create 2–10 layers atomically. For 10+ identical items use generate_pattern instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        layers: {
          type: "array",
          items: {
            type: "object",
            properties: LAYER_ITEM_PROPERTIES,
            required: ["type", "x", "y"],
          },
        },
      },
      required: ["layers"],
    },
  },
  {
    name: "generate_pattern",
    description:
      "Generate N identical layers arranged in a grid — server expands them, no enumeration needed. " +
      "ALWAYS use this for 'create N rectangles/circles/stickies' when N >= 10.",
    input_schema: {
      type: "object" as const,
      properties: {
        type:         { type: "string", enum: ["rectangle", "circle", "sticky"], description: "Layer type." },
        count:        { type: "number", description: "Number of layers to create." },
        width:        { type: "number", description: "Width of each item (default: 120)." },
        height:       { type: "number", description: "Height of each item (default: 120)." },
        randomColors: { type: "boolean", description: "Assign a random color to every layer." },
        fill:         { type: "string", description: "Fixed CSS hex fill if not randomColors." },
        columns:      { type: "number", description: "Grid columns (default: 10)." },
        spacing:      { type: "number", description: "Gap between items px (default: 20)." },
        x:            { type: "number", description: "Grid origin X (default: 100)." },
        y:            { type: "number", description: "Grid origin Y (default: 100)." },
      },
      required: ["type", "count"],
    },
  },
  {
    name: "update_layers",
    description: "Update color, position, size, rotation, or text on existing layers by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" } },
        properties: {
          type: "object",
          properties: {
            x:        { type: "number" },
            y:        { type: "number" },
            width:    { type: "number" },
            height:   { type: "number" },
            fill:     { type: "string", description: "CSS hex. Auto-mapped per layer type." },
            text:     { type: "string" },
            title:    { type: "string" },
            rotation: { type: "number", description: "Degrees clockwise." },
          },
        },
      },
      required: ["ids", "properties"],
    },
  },
  {
    name: "delete_layers",
    description: "Delete layers by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "arrange_grid",
    description: "Reposition existing layers into a uniform grid. Executor computes coordinates.",
    input_schema: {
      type: "object" as const,
      properties: {
        ids:      { type: "array", items: { type: "string" }, description: "Ordered layer IDs." },
        columns:  { type: "number", description: "Columns (default 3)." },
        spacing:  { type: "number", description: "Gap px (default 20)." },
        origin_x: { type: "number", description: "Grid origin X (default: first item's x)." },
        origin_y: { type: "number", description: "Grid origin Y (default: first item's y)." },
      },
      required: ["ids"],
    },
  },
  {
    name: "resize_frame_to_fit",
    description: "Resize a Frame to wrap its children with padding.",
    input_schema: {
      type: "object" as const,
      properties: {
        frame_id:  { type: "string" },
        child_ids: { type: "array", items: { type: "string" } },
        padding:   { type: "number", description: "Padding px (default 40)." },
      },
      required: ["frame_id", "child_ids"],
    },
    // Cache all preceding tools + this one.
    cache_control: { type: "ephemeral" },
  },
];

// ── Streaming SSE helper ──────────────────────────────────────────────────────

function sse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { messages, boardState } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "A valid messages array is required." },
        { status: 400 },
      );
    }

    const lastUserMessage: string =
      [...messages].reverse().find(
        (m: { role: string }) => m.role === "user",
      )?.content ?? "";

    const { model, tier } = selectModel(lastUserMessage);
    const maxTokens = selectMaxTokens(tier);

    const systemBlocks: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ];

    if (boardState?.length) {
      systemBlocks.push({
        type: "text",
        text: `CURRENT BOARD STATE:\n${JSON.stringify(boardState)}`,
      });
    }

    // Stream the Anthropic response and forward each complete tool call
    // as an SSE event so the client can execute them immediately.
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      tools,
      tool_choice: { type: "any" },
      messages,
    });

    const readable = new ReadableStream({
      async start(controller) {
        // Map of content-block index → accumulated tool call data.
        const pending = new Map<number, { name: string; jsonAccum: string }>();

        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              pending.set(event.index, {
                name: event.content_block.name,
                jsonAccum: "",
              });
            } else if (
              event.type === "content_block_delta" &&
              event.delta.type === "input_json_delta"
            ) {
              const block = pending.get(event.index);
              if (block) block.jsonAccum += event.delta.partial_json;
            } else if (event.type === "content_block_stop") {
              const block = pending.get(event.index);
              if (block !== undefined) {
                try {
                  const input: Record<string, unknown> = block.jsonAccum
                    ? JSON.parse(block.jsonAccum)
                    : {};
                  controller.enqueue(
                    sse({ type: "tool_call", name: block.name, input }),
                  );
                } catch {
                  console.error("[ai/route] Failed to parse streamed tool JSON");
                }
                pending.delete(event.index);
              }
            } else if (event.type === "message_stop") {
              controller.enqueue(sse({ type: "done", tier }));
            }
          }
        } catch (err) {
          console.error("[ai/route] Stream error:", err);
          const msg =
            err instanceof Anthropic.APIError ? err.message : "Stream error";
          controller.enqueue(sse({ type: "error", message: msg }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ai/route] error:", error);

    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: error.message }, { status: error.status ?? 500 });
    }

    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
