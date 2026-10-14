import { runCompilePipeline } from "@/lib/compiler/pipeline";
import type { CompileEvent } from "@/shared/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (ping) clearInterval(ping);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
      ping = setInterval(() => write(": ping\n\n"), 10_000);
      write(": connected\n\n");

      const emit = (event: CompileEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
      runCompilePipeline(id, emit)
        .catch((e) => emit({ type: "error", message: e instanceof Error ? e.message : String(e) }))
        .finally(close);
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
