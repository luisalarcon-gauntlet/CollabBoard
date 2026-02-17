"use client";

import { useAwareness } from "@/lib/useAwareness";

export function Avatars() {
  const users = useAwareness();

  return (
    <div className="absolute right-4 top-4 flex -space-x-2">
      {users.map((user) => {
        const { name, avatar, clientId } = user;
        return (
          <div
            key={clientId}
            className="group relative h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white bg-zinc-200 shadow"
            title={name}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-600">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            {/* Hover tooltip with name */}
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
