"use client";

import { useAwareness } from "@/lib/useAwareness";
import styles from "./Avatars.module.css";

export function Avatars() {
  const users = useAwareness();

  return (
    <div className={styles.container}>
      {users.map((user) => {
        const { name, avatar, clientId } = user;
        return (
          <div
            key={clientId}
            className={styles.avatar}
            title={name}
          >
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
            {/* Hover tooltip with name */}
            <span className={styles.tooltip}>
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
