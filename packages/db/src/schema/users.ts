/**
 * users (T78, arch §15.1) — profil użytkownika zalogowanego przez Discord.
 *
 * Dlaczego osobna tabela, skoro `subscriptions` też ma `discord_id`:
 *   `subscriptions` opisuje **uprawnienia** (kto ma premium), a `users` —
 *   **tożsamość i profil** (jak się nazywa, jak wygląda). Rozdzielenie
 *   pozwala:
 *     - trzymać wiersz `subscriptions` tylko dla płacących / z grantem,
 *     - kasować profil bez utraty historii rozliczeń,
 *     - zmieniać dostawcę płatności bez dotykania tożsamości.
 *
 * `discordId` (snowflake) jest kluczem głównym i **jedyną** tożsamością —
 * plan nie przewiduje logowania e-mail/hasło (T78). Długość 32 znaków
 * pokrywa snowflake z dużym zapasem (obecnie 17-19 cyfr), spójnie
 * z `subscriptions.discordId`.
 *
 * Zakresy OAuth: `identify` (id, username, global_name, avatar).
 * `email` jest opcjonalny — wypełniamy tylko jeśli użytkownik go udostępni
 * (scope `email`), dlatego kolumna jest nullable.
 */
import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    /** Discord user ID (snowflake) — PK i jedyna tożsamość. */
    discordId: varchar('discord_id', { length: 32 }).primaryKey(),
    /** Handle, np. `atlas_dev` (unikalny w Discordzie, ale może się zmieniać). */
    username: text('username').notNull(),
    /** Nazwa wyświetlana (nowsze konta; NULL dla starszych). */
    globalName: text('global_name'),
    /** Pełny URL awatara (CDN Discorda) — NULL gdy brak awatara. */
    avatarUrl: text('avatar_url'),
    /** Opcjonalny e-mail (tylko przy scope `email`; może być NULL). */
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Ostatnie udane logowanie — do metryk i wykrywania porzuconych kont. */
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    // Wyszukiwanie po nazwie (panel admina / support).
    index('idx_users_username').on(table.username),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
