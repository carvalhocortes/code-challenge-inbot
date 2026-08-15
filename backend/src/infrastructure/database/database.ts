import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;
