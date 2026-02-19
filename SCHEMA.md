# Supabase Database Schema

> Last updated: 2026-02-19
> Always update this file whenever changes are made to the Supabase database schema.

---

## Tables

### `public.my_litanies` *(legacy)*
| Column | Type | Constraints |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | NULL |
| created_at | TIMESTAMPTZ | NULL, DEFAULT now() |

### `public.litanies`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL |
| description | TEXT | NULL |
| scheduled_time | TEXT | NULL |

### `public.adhkar_library`
| Column | Type | Constraints |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| arabic_text | TEXT | NULL |
| transliteration | TEXT | NULL |
| translation | TEXT | NULL |
| default_count | INTEGER | NULL |
| source_reference | TEXT | NULL |
| category | TEXT | NULL |

### `public.adhkar_blocks`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| title | TEXT | NOT NULL |
| arabic | TEXT | NOT NULL |
| transliteration | TEXT | NULL |
| translation | TEXT | NULL |
| category | TEXT | NULL |

### `public.litany_structure`
| Column | Type | Constraints |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| litany_id | UUID | FK → litanies(id) ON DELETE CASCADE |
| block_id | UUID | FK → adhkar_blocks(id) |
| order_index | INTEGER | NULL |
| user_count | INTEGER | NULL |

### `public.litany_sessions`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| litany_id | UUID | FK → litanies(id) ON DELETE CASCADE |
| current_block_index | INTEGER | NULL, DEFAULT 0 |
| current_count | INTEGER | NULL, DEFAULT 0 |
| is_completed | BOOLEAN | NULL, DEFAULT false |
| mode | TEXT | NULL |
| last_active | TIMESTAMPTZ | NULL, DEFAULT now() |
| session_label | TEXT | NULL, DEFAULT 'Freestyle' |
| start_time | TIMESTAMPTZ | NULL, DEFAULT now() |

### `public.litany_schedules`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| litany_id | UUID | FK → litanies(id) ON DELETE CASCADE |
| label | TEXT | NOT NULL |
| time_hint | TEXT | NULL |
| created_at | TIMESTAMPTZ | NULL, DEFAULT now() |

### `public.litany_items` *(legacy)*
| Column | Type | Constraints |
|---|---|---|
| litany_id | INTEGER | FK → my_litanies(id) |
| dhikr_id | INTEGER | FK → adhkar_library(id) |
| position | INTEGER | NULL |
> No primary key defined.

---

## Relationships

| Foreign Key | References | Cascade |
|---|---|---|
| litany_structure.litany_id | litanies.id | DELETE CASCADE |
| litany_structure.block_id | adhkar_blocks.id | — |
| litany_sessions.litany_id | litanies.id | DELETE CASCADE |
| litany_schedules.litany_id | litanies.id | DELETE CASCADE |
| litany_items.litany_id | my_litanies.id | — |
| litany_items.dhikr_id | adhkar_library.id | — |

---

## Notes

- There are **two separate litany tables**: `my_litanies` (SERIAL integer id, legacy) and `litanies` (UUID id, current). `litany_items` references the legacy table; all other tables reference `litanies`.
- All tables use TABLESPACE `pg_default`.
