import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Model routing ─────────────────────────────────────────────────────────────
// Sonnet only when the request requires spatial/conceptual planning.
// Everything else goes to Haiku (5× faster, 10× cheaper).

const REASONING_PATTERNS =
  /\b(swot|retrospective|retro|sprint|user.?journey|journey.?map|kanban|roadmap|org.?chart|mind.?map|matrix|framework|template|analysis|diagram|workflow)\b/i;

function selectModel(lastUserMessage: string): {
  model: string;
  tier: "fast" | "reasoning";
} {
  if (REASONING_PATTERNS.test(lastUserMessage)) {
    return { model: "claude-sonnet-4-6", tier: "reasoning" };
  }
  return { model: "claude-haiku-4-5", tier: "fast" };
}

// ── System prompt (static — eligible for prompt caching) ─────────────────────

const SYSTEM_PROMPT = `\
You are the CollabBoard AI Agent. You help users create and organize content on a collaborative whiteboard.

STRICT RULES — follow every time:
1. You MUST respond with tool calls only. Zero plain-text, zero preamble.
2. ALWAYS use create_bulk_layers when creating 2 or more objects. Never call create_layer multiple times.
3. Omit every property that equals its default: rotation:0, opacity:1, scale:1, fontSize:16, fontWeight:"normal".
4. All colors must be CSS hex strings ("#fbbf24"). Never numbers.
5. No conversational filler. One tool call, done.

TOOL SELECTION:
- 1 object         → create_layer
- 2+ objects       → create_bulk_layers
- recolor/move     → update_layers  (use IDs from board state)
- remove           → delete_layers
- align/space      → arrange_grid   (executor computes coords)
- wrap frame       → resize_frame_to_fit

BLUEPRINTS — emit exactly these coordinates when asked:

SWOT Analysis (use create_bulk_layers — 9 objects total):
  Frame:  x:0,   y:0,   width:860, height:860, title:"SWOT Analysis"
  Rects:  x:20,  y:20,  width:400, height:400, fill:"#bbf7d0"   (Strengths)
          x:440, y:20,  width:400, height:400, fill:"#fecaca"   (Weaknesses)
          x:20,  y:440, width:400, height:400, fill:"#bfdbfe"   (Opportunities)
          x:440, y:440, width:400, height:400, fill:"#fef08a"   (Threats)
  Labels: text layers centered in each rect, fontWeight:"bold", fontSize:18.

Retrospective (3 Frames, create_bulk_layers):
  x:0,   width:400, height:600, title:"What Went Well",  backgroundColor:"#f0fdf4"
  x:440, width:400, height:600, title:"What Didn't",     backgroundColor:"#fef2f2"
  x:880, width:400, height:600, title:"Action Items",    backgroundColor:"#eff6ff"

User Journey (5 Frames, create_bulk_layers):
  width:280, height:400, x: 0 / 320 / 640 / 960 / 1280. Add a text label in each.

Grid spacing: 20px between all elements.`;

// ── Tool schema ───────────────────────────────────────────────────────────────
// Shared property block reused in both create_layer and create_bulk_layers items.

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
  fill:   { type: "string", description: "CSS hex color. Maps to bgColor (sticky), backgroundColor (frame), fill (rect/circle), color (text)." },
  title:  { type: "string", description: "Frame title." },
  fontSize:   { type: "number", description: "Font size px — omit if 16." },
  fontWeight: { type: "string", description: "Font weight — omit if 'normal'." },
  color:  { type: "string", description: "Explicit text color (text layer only)." },
};

const tools: Anthropic.Tool[] = [
  {
    name: "create_layer",
    description: "Create exactly 1 layer. Use create_bulk_layers for 2+.",
    input_schema: {
      type: "object" as const,
      properties: LAYER_ITEM_PROPERTIES,
      required: ["type", "x", "y"],
    },
  },
  {
    name: "create_bulk_layers",
    description: "Create 2+ layers atomically. ALWAYS prefer this over multiple create_layer calls.",
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
    name: "update_layers",
    description: "Update color, position, size, or text on existing layers by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" } },
        properties: {
          type: "object",
          properties: {
            x:      { type: "number" },
            y:      { type: "number" },
            width:  { type: "number" },
            height: { type: "number" },
            fill:   { type: "string", description: "CSS hex. Auto-mapped per layer type." },
            text:   { type: "string" },
            title:  { type: "string" },
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
    // Cache the schema — tools don't change between requests.
    cache_control: { type: "ephemeral" },
  },
];

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { messages, boardState } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "A valid messages array is required." },
        { status: 400 }
      );
    }

    // Derive the model from the latest user turn.
    const lastUserMessage: string =
      [...messages].reverse().find(
        (m: { role: string }) => m.role === "user",
      )?.content ?? "";
    const { model, tier } = selectModel(lastUserMessage);

    // Build system blocks:
    // - Block 1: static instructions → cache_control so they are only
    //   tokenised once per cache TTL (~5 min), slashing TTFT by ~800 ms.
    // - Block 2: dynamic board state → no cache (changes every request).
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
        text: `CURRENT BOARD STATE (reference IDs for update/delete/arrange):\n${JSON.stringify(boardState)}`,
      });
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemBlocks,
      tools,
      messages,
    });

    const toolCalls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    return NextResponse.json({
      toolCalls,
      stopReason: response.stop_reason,
      tier,
    });
  } catch (error) {
    console.error("[ai/route] error:", error);

    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 500 },
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
