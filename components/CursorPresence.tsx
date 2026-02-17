"use client";

import { useAwareness } from "@/lib/useAwareness";
import { useBoardTransform } from "@/lib/board-transform";

export function CursorPresence() {
  const users = useAwareness();
  const { worldToScreen } = useBoardTransform();

  return (
    <>
      {users.map((user) => {
        const { cursor, name, clientId } = user;
        if (!cursor) return null;
        const screen = worldToScreen(cursor.x, cursor.y);

        return (
          <div
            key={clientId}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: screen.x, top: screen.y }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-md"
            >
              <path
                d="M5.653 4.133L4.018 20.358a.5.5 0 00.928.216l3.887-7.776 2.474 2.474 2.474-5.303L5.653 4.133z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <div className="ml-4 mt-1 rounded bg-zinc-800 px-2 py-0.5 text-xs font-medium text-white shadow">
              {name}
            </div>
          </div>
        );
      })}
    </>
  );
}
