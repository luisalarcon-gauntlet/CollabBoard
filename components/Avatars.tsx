"use client";

import { useAwareness } from "@/lib/useAwareness";
import styles from "./Avatars.module.css";

export function Avatars({
  boardId,
  inline,
}: {
  boardId: string;
  inline?: boolean;
}) {
  const users = useAwareness(boardId);

  return (
    <div
      className={inline ? styles.containerInline : styles.container}
      aria-label="Collaborators present"
    >
      {users.map((user) => {
        const { name, avatar, clientId } = user;
        return (
          <div
            key={clientId}
            className={styles.userCard}
          >
            <div className={styles.avatar}>
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  className={styles.avatarImage}
                />
              ) : (
                <span className={styles.avatarInitial}>
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className={styles.userName}>
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
